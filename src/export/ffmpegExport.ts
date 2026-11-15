// Fallback encoder for browsers without WebCodecs H.264 encoding: single-threaded ffmpeg.wasm, which
// needs no SharedArrayBuffer (and so no COOP/COEP headers, which GitHub Pages cannot send).
// Frames are written to ffmpeg's in-memory FS as JPEGs in short batches and encoded batch by batch,
// so memory stays bounded; the batches are then joined and muxed with the mixed audio.
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { FPS, projectDuration } from '../model/time';
import type { ExportRequest } from './exporter';
import { exportFileName, makeCanvas, openAudioReaders, renderFrames } from './exporter';
import { MIX_WINDOW, encodeWav, mixWindow } from './mix';

const BATCH = 90;

async function canvasJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  const blob = 'convertToBlob' in canvas
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
    : await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', 0.9));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function exportWithFfmpeg(req: ExportRequest, width: number, height: number): Promise<File> {
  const { signal, onProgress, project } = req;
  const duration = projectDuration(project);
  const ffmpeg = new FFmpeg();
  const onAbort = () => ffmpeg.terminate();
  signal.addEventListener('abort', onAbort);
  try {
    onProgress({ stage: 'loading', progress: 0, eta: null });
    const base = new URL(`${import.meta.env.BASE_URL}ffmpeg/`, location.href).href;
    await ffmpeg.load({ coreURL: `${base}ffmpeg-core.js`, wasmURL: `${base}ffmpeg-core.wasm` });

    const { canvas, ctx } = makeCanvas(width, height);
    const total = Math.max(1, Math.round(duration * FPS));
    const segments: string[] = [];
    let inBatch = 0;
    const started = performance.now();
    const name = (i: number) => `f${String(i).padStart(4, '0')}.jpg`;

    const flush = async () => {
      if (inBatch === 0) return;
      const seg = `s${segments.length}.mp4`;
      await ffmpeg.exec(['-framerate', String(FPS), '-i', 'f%04d.jpg', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
        '-pix_fmt', 'yuv420p', '-r', String(FPS), seg]);
      for (let i = 0; i < inBatch; i++) await ffmpeg.deleteFile(name(i));
      segments.push(seg);
      inBatch = 0;
    };

    await renderFrames(req, ctx, width, height, typeof VideoDecoder === 'undefined', async (f) => {
      await ffmpeg.writeFile(name(inBatch++), await canvasJpeg(canvas));
      if (inBatch === BATCH) await flush();
      const done = (f + 1) / total;
      const elapsed = (performance.now() - started) / 1000;
      onProgress({ stage: 'rendering', progress: done * 0.95, eta: done > 0.03 ? (elapsed / done) * (1 - done) : null });
    });
    await flush();

    onProgress({ stage: 'finishing', progress: 0.96, eta: null });
    const readers = await openAudioReaders(project, req.media);
    const buffers: AudioBuffer[] = [];
    try {
      for (let w0 = 0; w0 < duration; w0 += MIX_WINDOW) {
        buffers.push(await mixWindow(project, w0, Math.min(duration, w0 + MIX_WINDOW), readers.video, readers.music));
      }
    } finally {
      readers.close();
    }
    await ffmpeg.writeFile('a.wav', encodeWav(buffers));
    await ffmpeg.writeFile('list.txt', segments.map((s) => `file '${s}'`).join('\n'));
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-i', 'a.wav', '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', 'out.mp4']);
    const data = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
    return new File([new Uint8Array(data)], exportFileName(), { type: 'video/mp4' });
  } catch (e) {
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
    throw e;
  } finally {
    signal.removeEventListener('abort', onAbort);
    ffmpeg.terminate();
  }
}
