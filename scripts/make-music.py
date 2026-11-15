#!/usr/bin/env python3
"""Synthesises the royalty-free tracks shipped with MediaEditor (public/music/*.mp3).

Everything is generated from code in this file (no samples), so the output is original work,
released under CC0 1.0. Requires: numpy, lameenc.  Run: python3 scripts/make-music.py
"""
import os
import numpy as np
import lameenc

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'music')
rng = np.random.default_rng(7)

NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def hz(name):
    """'A4' -> 440"""
    p, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[p] + 12 * (o + 1) - 69) / 12)


def env(n, a=0.005, d=0.1, s=0.6, r=0.1):
    t = np.arange(n) / SR
    total = n / SR
    e = np.where(t < a, t / max(a, 1e-6), np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = np.clip((total - t) / max(r, 1e-6), 0, 1)
    return e * rel


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    b = 1 - a
    for i in range(len(x)):
        acc = b * x[i] + a * acc
        y[i] = acc
    return y


def saw(f, n, detune=0.0):
    t = np.arange(n) / SR
    ph = (t * f * (1 + detune)) % 1.0
    return 2 * ph - 1


def sine(f, n, phase=0.0):
    return np.sin(2 * np.pi * f * np.arange(n) / SR + phase)


def kick(n=int(0.35 * SR)):
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9)


def snare(n=int(0.25 * SR)):
    t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * 18)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)
    return 0.55 * (noise - lowpass(noise, 1200)) + 0.5 * tone


def hat(n=int(0.06 * SR), open_=False):
    if open_:
        n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - lowpass(noise, 7000)
    return hp * np.exp(-t * (14 if open_ else 70)) * 0.5


def pluck(f, n):
    """Karplus-Strong string."""
    period = max(2, int(SR / f))
    buf = rng.uniform(-1, 1, period)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % period]
        buf[i % period] = 0.497 * (buf[i % period] + buf[(i + 1) % period])
    return out


def epiano(f, n):
    t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 2 * t) * 1.2 * np.exp(-t * 4)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.8)


def pad(freqs, n):
    x = np.zeros(n)
    for f in freqs:
        for d in (-0.004, 0.0, 0.005):
            x += saw(f, n, d)
    x = lowpass(x / (len(freqs) * 3), 1400)
    return x * env(n, a=0.4, d=0.2, s=0.9, r=0.5)


def place(track, sound, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= track.shape[1]:
        return
    s = sound[: track.shape[1] - i] * gain
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    track[0, i:i + len(s)] += s * l * 1.414
    track[1, i:i + len(s)] += s * r * 1.414


def reverb(x, mix=0.18):
    out = x.copy()
    for ch in range(2):
        wet = np.zeros(x.shape[1])
        for delay, g in ((0.031, 0.5), (0.047, 0.42), (0.071, 0.36), (0.113, 0.3), (0.167, 0.22)):
            d = int((delay + ch * 0.004) * SR)
            buf = np.zeros(x.shape[1])
            buf[d:] = x[ch, :-d] * g
            for _ in range(3):  # a few echoes of each tap
                buf[d:] += buf[:-d] * 0.35
            wet += buf
        out[ch] = x[ch] + lowpass(wet, 5000) * mix
    return out


def chord(root, kind='maj', octave=3):
    base = hz(f'{root}{octave}')
    steps = {'maj': (0, 4, 7), 'min': (0, 3, 7), 'maj7': (0, 4, 7, 11), 'min7': (0, 3, 7, 10), 'sus2': (0, 2, 7)}[kind]
    return [base * 2 ** (s / 12) for s in steps]


def finish(track, name, seconds):
    track = reverb(track)
    n = track.shape[1]
    fade = int(3 * SR)
    track[:, n - fade:] *= np.linspace(1, 0, fade)
    track[:, : int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    peak = np.max(np.abs(track)) or 1
    track = np.tanh(track / peak * 1.2) * 0.89
    pcm = (track.T * 32767).astype('<i2').tobytes()
    enc = lameenc.Encoder()
    enc.set_bit_rate(128)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    data = enc.encode(pcm) + enc.flush()
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, name + '.mp3'), 'wb') as f:
        f.write(data)
    print(f'{name}: {seconds:.0f}s, {len(data) / 1e6:.2f} MB')


def sunny_loop():
    """Bright, bouncy major-key pop at 112 bpm."""
    bpm, bars = 112, 32
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    prog = [('C', 'maj'), ('G', 'maj'), ('A', 'min'), ('F', 'maj')]
    melody = ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5', 'E5', 'E5', 'D5', 'C5', 'A4', 'C5', 'D5', 'G4']
    k, sn, hh = kick(), snare(), hat()
    for bar in range(bars):
        root, kind = prog[bar % 4]
        t0 = bar * 4 * beat
        for b in range(4):
            if bar >= 2 or b % 2 == 0:
                place(tr, k, t0 + b * beat, 0.9)
            if b % 2 == 1 and bar >= 2:
                place(tr, sn, t0 + b * beat, 0.55)
            for e in range(2):
                place(tr, hh, t0 + (b + e / 2) * beat, 0.25, 0.3)
        bass_f = hz(f'{root}2')
        for e in range(8):
            n = int(beat / 2 * SR * 0.9)
            s = lowpass(saw(bass_f, n), 600) * env(n, 0.005, 0.1, 0.5, 0.05)
            place(tr, s, t0 + e * beat / 2, 0.45)
        for e in range(8):
            n = int(beat / 2 * SR)
            for f in chord(root, kind, 4):
                place(tr, pluck(f, n) * env(n, 0.002, 0.2, 0.3, 0.05), t0 + e * beat / 2, 0.12, -0.35)
        if bar >= 8 and bar < 24:
            for i in range(4):
                note = melody[(bar % 4) * 4 + i]
                n = int(beat * SR * 0.95)
                s = (sine(hz(note), n) + 0.3 * sine(hz(note) * 2, n)) * env(n, 0.01, 0.15, 0.6, 0.1)
                place(tr, s, t0 + i * beat, 0.22, 0.2)
    finish(tr, 'sunny-loop', total)


def night_drive():
    """Minor-key synthwave at 96 bpm."""
    bpm, bars = 96, 28
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    prog = [('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('G', 'maj')]
    k, sn, hh = kick(), snare(), hat()
    for bar in range(bars):
        root, kind = prog[(bar // 2) % 4]
        t0 = bar * 4 * beat
        if bar % 2 == 0:
            place(tr, pad(chord(root, kind, 3), int(8 * beat * SR)), t0, 0.5)
        if bar >= 4:
            for b in range(4):
                place(tr, k, t0 + b * beat, 0.85)
                if b in (1, 3):
                    place(tr, sn, t0 + b * beat, 0.5)
                for e in range(4):
                    place(tr, hh, t0 + (b + e / 4) * beat, 0.15 if e % 2 else 0.22, -0.3)
        bass_f = hz(f'{root}1')
        for e in range(16):
            n = int(beat / 4 * SR * 0.9)
            s = lowpass(saw(bass_f * (2 if e % 2 else 1), n), 900) * env(n, 0.003, 0.05, 0.6, 0.03)
            place(tr, s, t0 + e * beat / 4, 0.35)
        if 8 <= bar < 24:
            arp = chord(root, kind, 5)
            for e in range(8):
                n = int(beat / 2 * SR)
                f = arp[e % len(arp)]
                s = lowpass(saw(f, n) + saw(f, n, 0.006), 3000) * env(n, 0.005, 0.12, 0.2, 0.05)
                place(tr, s, t0 + e * beat / 2, 0.09, 0.4 if e % 2 else -0.4)
    finish(tr, 'night-drive', total)


def lofi_steps():
    """Relaxed, swung lo-fi beat at 80 bpm with electric piano."""
    bpm, bars = 80, 22
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    prog = [('D', 'min7'), ('G', 'maj'), ('C', 'maj7'), ('A', 'min7')]
    k, sn, hh = kick(), snare(), hat()
    swing = 0.12 * beat
    for bar in range(bars):
        root, kind = prog[bar % 4]
        t0 = bar * 4 * beat
        for f in chord(root, kind, 4):
            n = int(3.8 * beat * SR)
            place(tr, epiano(f, n), t0, 0.16, -0.2)
            place(tr, epiano(f, n // 2), t0 + 2.5 * beat + swing, 0.08, 0.2)
        if bar >= 1:
            place(tr, k, t0, 0.8)
            place(tr, k, t0 + 2.5 * beat + swing, 0.6)
            place(tr, sn, t0 + beat, 0.4)
            place(tr, sn, t0 + 3 * beat, 0.4)
            for e in range(8):
                place(tr, hh, t0 + e * beat / 2 + (swing if e % 2 else 0), 0.14, 0.35)
        n = int(1.8 * beat * SR)
        place(tr, sine(hz(f'{root}2'), n) * env(n, 0.01, 0.3, 0.7, 0.2), t0, 0.5)
        place(tr, sine(hz(f'{root}2') * 1.5, n) * env(n, 0.01, 0.3, 0.7, 0.2), t0 + 2 * beat, 0.35)
    # vinyl crackle
    crackle = (rng.random(tr.shape[1]) > 0.9993) * rng.standard_normal(tr.shape[1]) * 0.15
    tr += lowpass(crackle, 4000)
    finish(tr, 'lofi-steps', total)


def acoustic_morning():
    """Fingerpicked strings in G major at 100 bpm."""
    bpm, bars = 100, 26
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    prog = [('G', 'maj'), ('D', 'maj'), ('E', 'min'), ('C', 'maj')]
    k = kick()
    pattern = [0, 2, 1, 2, 0, 2, 1, 2]
    for bar in range(bars):
        root, kind = prog[bar % 4]
        notes = chord(root, kind, 3) + [chord(root, kind, 4)[0]]
        t0 = bar * 4 * beat
        place(tr, pluck(hz(f'{root}2'), int(2 * beat * SR)), t0, 0.35)
        place(tr, pluck(hz(f'{root}2') * 1.5, int(2 * beat * SR)), t0 + 2 * beat, 0.25)
        for e, idx in enumerate(pattern):
            f = notes[idx + (1 if e % 4 == 3 else 0)]
            place(tr, pluck(f * 2, int(beat * SR)), t0 + e * beat / 2, 0.22, -0.3 + 0.2 * (e % 3))
        if bar >= 4:
            place(tr, k, t0, 0.5)
            place(tr, k, t0 + 2 * beat, 0.45)
            for b in (1, 3):
                place(tr, hat(open_=False) * 1.5, t0 + b * beat, 0.3, 0.4)
        if 8 <= bar < 20:
            mel = chord(root, kind, 5)
            for i, f in enumerate([mel[2], mel[1], mel[0]]):
                n = int(beat * SR * 1.2)
                place(tr, sine(f, n) * env(n, 0.04, 0.2, 0.5, 0.3), t0 + i * 1.33 * beat, 0.12, 0.25)
    finish(tr, 'acoustic-morning', total)


def square(f, n, duty=0.5):
    t = np.arange(n) / SR
    return np.where((t * f) % 1.0 < duty, 1.0, -1.0)


def marimba(f, n):
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t * 30)) * np.exp(-t * 6)


def piano(f, n):
    t = np.arange(n) / SR
    tone = sum(np.sin(2 * np.pi * f * k * t) * (0.6 ** (k - 1)) for k in range(1, 6))
    return tone * np.exp(-t * 2.2) * np.clip(t / 0.004, 0, 1) * 0.5


def guitar(freqs, n):
    x = sum(saw(f, n, d) for f in freqs for d in (-0.003, 0.003))
    return np.tanh(lowpass(x, 2500) * 2.5) * 0.4


def retro_arcade():
    """Chiptune with square-wave lead and noise drums at 140 bpm."""
    bpm, bars = 140, 36
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    prog = [('C', 'maj'), ('A', 'min'), ('F', 'maj'), ('G', 'maj')]
    lead = [0, 2, 4, 7, 4, 2, 0, -1, 0, 4, 7, 9, 7, 4, 2, 4]
    for bar in range(bars):
        root, kind = prog[bar % 4]
        t0 = bar * 4 * beat
        notes = chord(root, kind, 4)
        for e in range(8):
            n = int(beat / 2 * SR * 0.8)
            place(tr, square(hz(f'{root}2'), n) * env(n, 0.002, 0.05, 0.6, 0.02), t0 + e * beat / 2, 0.12)
        for e in range(16):
            n = int(beat / 4 * SR * 0.9)
            place(tr, square(notes[e % 3] * 2, n, 0.25) * env(n, 0.001, 0.04, 0.3, 0.02), t0 + e * beat / 4, 0.04, -0.4)
        for b in range(4):
            place(tr, kick(), t0 + b * beat, 0.6)
            if b % 2 == 1:
                place(tr, hat(open_=True), t0 + b * beat, 0.5)
        if bar >= 4 and bar % 8 < 6:
            base = hz(f'{root}4')
            for i in range(4):
                step = lead[(bar * 4 + i) % len(lead)]
                n = int(beat * SR * 0.9)
                place(tr, square(base * 2 ** (step / 12), n, 0.5) * env(n, 0.003, 0.1, 0.5, 0.05), t0 + i * beat, 0.07, 0.3)
    finish(tr, 'retro-arcade', total)


def cinematic_rise():
    """Slow, building cinematic pads and toms at 70 bpm."""
    bpm, bars = 70, 18
    beat = 60 / bpm
    total = bars * 4 * beat + 4
    tr = np.zeros((2, int(total * SR)))
    prog = [('D', 'min'), ('A#', 'maj'), ('F', 'maj'), ('C', 'maj')]
    for bar in range(bars):
        root, kind = prog[bar % 4]
        t0 = bar * 4 * beat
        intensity = min(1.0, 0.3 + bar / bars)
        place(tr, pad(chord(root, kind, 3), int(4.2 * beat * SR)), t0, 0.5 * intensity)
        place(tr, sine(hz(f'{root}1'), int(4 * beat * SR)) * env(int(4 * beat * SR), 0.3, 0.5, 0.8, 0.8), t0, 0.45 * intensity)
        if bar >= 6:
            for b in range(4):
                tom = kick(int(0.6 * SR))
                place(tr, tom, t0 + b * beat, 0.7 * intensity, -0.2 if b % 2 else 0.2)
        if bar >= 10:
            for e in range(8):
                n = int(beat / 2 * SR)
                f = chord(root, kind, 5)[e % 3]
                place(tr, pluck(f, n) * env(n, 0.002, 0.2, 0.4, 0.1), t0 + e * beat / 2, 0.12 * intensity, 0.4 if e % 2 else -0.4)
    finish(tr, 'cinematic-rise', total)


def funky_groove():
    """Syncopated funk bass, clavinet stabs and tight drums at 104 bpm."""
    bpm, bars = 104, 30
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    prog = [('E', 'min7'), ('E', 'min7'), ('A', 'min7'), ('B', 'min7')]
    bass_pattern = [(0, 0), (0.75, 0), (1.5, 12), (2, 0), (2.5, 10), (3, 7), (3.5, 0)]
    for bar in range(bars):
        root, kind = prog[bar % 4]
        t0 = bar * 4 * beat
        for at, semi in bass_pattern:
            n = int(0.22 * SR)
            f = hz(f'{root}1') * 2 ** (semi / 12)
            place(tr, lowpass(saw(f, n) + square(f, n) * 0.5, 800) * env(n, 0.003, 0.08, 0.4, 0.05), t0 + at * beat, 0.4)
        for at in (0.5, 1.25, 2.5, 3.25):
            n = int(0.12 * SR)
            stab = sum(square(f, n, 0.3) for f in chord(root, kind, 4)) / 4
            place(tr, lowpass(stab, 3000) * env(n, 0.001, 0.05, 0.3, 0.03), t0 + at * beat, 0.18, 0.3)
        if bar >= 2:
            place(tr, kick(), t0, 0.85)
            place(tr, kick(), t0 + 2.5 * beat, 0.7)
            place(tr, snare(), t0 + beat, 0.5)
            place(tr, snare(), t0 + 3 * beat, 0.5)
            for e in range(16):
                place(tr, hat(), t0 + e * beat / 4, 0.18 if e % 2 else 0.28, -0.35)
    finish(tr, 'funky-groove', total)


def piano_reflections():
    """Gentle solo piano in A minor at 72 bpm."""
    bpm, bars = 72, 20
    beat = 60 / bpm
    total = bars * 4 * beat + 4
    tr = np.zeros((2, int(total * SR)))
    prog = [('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('G', 'maj')]
    for bar in range(bars):
        root, kind = prog[bar % 4]
        t0 = bar * 4 * beat
        low = chord(root, kind, 3)
        arp = [low[0], low[1], low[2], low[1] * 2, low[2], low[1]]
        place(tr, piano(hz(f'{root}2'), int(4 * beat * SR)), t0, 0.35, -0.2)
        for i, f in enumerate(arp + arp[:2]):
            place(tr, piano(f, int(2 * beat * SR)), t0 + i * beat / 2, 0.22, -0.1)
        if bar >= 4 and bar < 18:
            top = chord(root, kind, 5)
            for i, f in enumerate([top[2], top[1], top[0] if bar % 2 else top[1]]):
                place(tr, piano(f, int(2 * beat * SR)), t0 + i * 1.33 * beat, 0.2, 0.2)
    finish(tr, 'piano-reflections', total)


def tropical_sunset():
    """Marimba and shaker, laid-back tropical house at 108 bpm."""
    bpm, bars = 108, 30
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    prog = [('F', 'maj7'), ('G', 'maj'), ('E', 'min7'), ('A', 'min')]
    rhythm = [0, 0.75, 1.5, 2, 2.75, 3.5]
    for bar in range(bars):
        root, kind = prog[bar % 4]
        t0 = bar * 4 * beat
        notes = chord(root, kind, 4)
        for i, at in enumerate(rhythm):
            place(tr, marimba(notes[i % len(notes)] * (2 if i % 3 == 2 else 1), int(0.6 * SR)), t0 + at * beat, 0.28, 0.25 if i % 2 else -0.25)
        place(tr, pad(chord(root, kind, 3), int(4 * beat * SR)), t0, 0.18)
        if bar >= 2:
            for b in range(4):
                place(tr, kick(), t0 + b * beat, 0.7)
                place(tr, hat() * 1.2, t0 + (b + 0.5) * beat, 0.3, 0.4)
            place(tr, snare() * 0.6, t0 + beat, 0.25)
            place(tr, snare() * 0.6, t0 + 3 * beat, 0.25)
        n = int(beat * SR * 0.9)
        for b in (0, 2.5):
            place(tr, sine(hz(f'{root}2'), n) * env(n, 0.01, 0.2, 0.6, 0.1), t0 + b * beat, 0.45)
    finish(tr, 'tropical-sunset', total)


def rock_drive():
    """Driving power chords and big drums at 128 bpm."""
    bpm, bars = 128, 34
    beat = 60 / bpm
    total = bars * 4 * beat + 3
    tr = np.zeros((2, int(total * SR)))
    roots = ['E', 'C', 'G', 'D']
    for bar in range(bars):
        root = roots[(bar // 2) % 4]
        t0 = bar * 4 * beat
        f0 = hz(f'{root}2')
        power = [f0, f0 * 1.5, f0 * 2]
        for e in range(8):
            n = int(beat / 2 * SR * 0.95)
            place(tr, guitar(power, n) * env(n, 0.003, 0.05, 0.8, 0.03), t0 + e * beat / 2, 0.35, -0.5)
            place(tr, guitar([f * 1.002 for f in power], n) * env(n, 0.003, 0.05, 0.8, 0.03), t0 + e * beat / 2, 0.35, 0.5)
            place(tr, lowpass(saw(f0 / 2, n), 400) * env(n, 0.003, 0.05, 0.7, 0.03), t0 + e * beat / 2, 0.3)
        if bar >= 1:
            for b in range(4):
                place(tr, kick(), t0 + b * beat, 0.9)
                if b % 2:
                    place(tr, snare(), t0 + b * beat, 0.7)
                for e in range(2):
                    place(tr, hat(open_=e == 1), t0 + (b + e / 2) * beat, 0.2, 0.3)
    finish(tr, 'rock-drive', total)


ALL = ['sunny_loop', 'night_drive', 'lofi_steps', 'acoustic_morning', 'retro_arcade', 'cinematic_rise',
       'funky_groove', 'piano_reflections', 'tropical_sunset', 'rock_drive']

if __name__ == '__main__' and len(__import__('sys').argv) > 1:
    for name in __import__('sys').argv[1:]:
        globals()[name]()
    raise SystemExit

if __name__ == '__main__':
    sunny_loop()
    night_drive()
    lofi_steps()
    acoustic_morning()
    retro_arcade()
    cinematic_rise()
    funky_groove()
    piano_reflections()
    tropical_sunset()
    rock_drive()
