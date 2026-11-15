// Import flow: probe → warn about big files on mobile → keep the file for autosave → add to the timeline.
import { putBlob } from '../media/db';
import { rememberBlob } from '../media/library';
import { addClips, addMusic, clipFromMedia, musicFromMedia } from '../model/timeline';
import { locate, projectDuration } from '../model/time';
import { useEditor, getProject } from '../state/store';
import { t, formatBytes } from '../i18n/strings';

export async function importFiles(files: File[], target: 'timeline' | 'music') {
  const s = useEditor.getState();
  // Mediabunny is only needed once media is imported, so it stays out of the first-load bundle.
  const { probeFile, isMobileDevice, BIG_FILE_BYTES, LONG_CLIP_SECONDS, UnsupportedMediaError } = await import('../media/probe');
  for (const file of files) {
    s.setBusy(t('import.picking', { name: file.name }));
    try {
      const { info } = await probeFile(file, target === 'music' ? 'audio' : undefined);
      if (isMobileDevice() && (info.size > BIG_FILE_BYTES || info.duration > LONG_CLIP_SECONDS)) {
        const length = info.duration > LONG_CLIP_SECONDS ? t('import.bigLength', { minutes: Math.round(info.duration / 60) }) : '';
        if (!window.confirm(t('import.bigWarning', { name: file.name, size: formatBytes(info.size), length }))) continue;
      }
      rememberBlob(info.id, file);
      try {
        await putBlob(info.id, file);
      } catch {
        s.showToast(t('import.storageFull', { name: file.name }));
      }
      s.addMedia(info);
      if (info.kind === 'audio') {
        const p = getProject();
        const start = p.music.length === 0 ? 0 : Math.min(useEditor.getState().time, projectDuration(p));
        const m = musicFromMedia(info, start);
        s.apply((proj) => addMusic(proj, m));
        s.select(m.id);
      } else {
        // Insert after the clip under the playhead (or at the end).
        const p = getProject();
        const loc = locate(p.clips, useEditor.getState().time);
        const at = p.clips.length === 0 || !loc ? p.clips.length : loc.index + 1;
        const clip = clipFromMedia(info);
        s.apply((proj) => addClips(proj, [clip], at));
        s.select(clip.id);
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      s.showToast(e instanceof UnsupportedMediaError ? reason : t('import.failed', { name: file.name, reason }));
    } finally {
      s.setBusy(null);
    }
  }
}

/** Opens the system file picker (camera roll on iOS and Android). */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.onchange = () => {
      resolve([...(input.files ?? [])]);
      input.remove();
    };
    input.oncancel = () => {
      resolve([]);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}
