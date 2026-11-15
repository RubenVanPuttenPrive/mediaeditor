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


if __name__ == '__main__':
    sunny_loop()
    night_drive()
    lofi_steps()
    acoustic_morning()
