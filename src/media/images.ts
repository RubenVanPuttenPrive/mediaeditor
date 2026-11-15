import type { MediaInfo } from '../model/types';
import { blobFor } from './library';

/** Longest side we keep in memory for photos; plenty for 1080p output. */
const MAX_SIDE = 2048;

/** Decodes a photo, downscaled so huge camera images do not eat the memory budget. */
export async function loadImage(m: MediaInfo): Promise<ImageBitmap | HTMLImageElement> {
  const blob = await blobFor(m);
  const scale = Math.min(1, MAX_SIDE / Math.max(m.width || 1, m.height || 1));
  try {
    return await createImageBitmap(blob, scale < 1
      ? { resizeWidth: Math.round(m.width * scale), resizeHeight: Math.round(m.height * scale), resizeQuality: 'high' }
      : {});
  } catch {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    // The URL stays alive: Safari may re-read it when drawing the image later.
    return img;
  }
}
