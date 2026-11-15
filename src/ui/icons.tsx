// Inline SVG icons (stroke-based, currentColor). Decorative: buttons carry their own labels.
const paths: Record<string, string> = {
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
  start: 'M6 5v14M18 5 9 12l9 7z',
  import: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14',
  export: 'M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5',
  undo: 'M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2',
  redo: 'm15 7 5 5-5 5m5-5H9a5 5 0 0 0 0 10h2',
  split: 'M12 3v18M7 7 4 12l3 5m10-10 3 5-3 5',
  trash: 'M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  emoji: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01',
  sticker: 'M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h8l7-7V6a3 3 0 0 0-3-3h-4zM14 21v-4a3 3 0 0 1 3-3h4',
  text: 'M5 6V4h14v2M12 4v16m-3 0h6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5v-5m0-3h.01',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4-4M8 11h6m-3-3v6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4-4M8 11h6',
  share: 'M12 3v12m0-12L8 7m4-4 4 4M6 11H5v10h14V11h-1',
  download: 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  newDoc: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6m-3-3h6',
  volume: 'M4 9v6h4l5 4V5L8 9zm12 0a4 4 0 0 1 0 6',
  muted: 'M4 9v6h4l5 4V5L8 9zm12 1 4 4m0-4-4 4',
};

export function Icon({ name, size = 22 }: { name: keyof typeof paths | string; size?: number }) {
  const filled = name === 'play' || name === 'pause';
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}
