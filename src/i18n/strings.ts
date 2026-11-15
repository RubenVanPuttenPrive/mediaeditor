// Every user-facing string lives here. To add Dutch, add an `nl` table with the same keys and
// pick it from navigator.language in `currentLocale`.

const en = {
  'app.name': 'MediaEditor',
  'app.privacy': 'Private by design: your videos are edited on this device and never uploaded.',
  'app.privacyShort': 'Stays on your device',
  'app.restoring': 'Restoring your project…',
  'app.offlineReady': 'MediaEditor now works offline.',
  'app.updateReady': 'A new version is ready. Reload to update.',
  'app.reload': 'Reload',

  'top.import': 'Import',
  'top.export': 'Export',
  'top.about': 'About',
  'top.undo': 'Undo',
  'top.redo': 'Redo',
  'top.newProject': 'New project',
  'top.newProjectConfirm': 'Start a new project? The current project and its media will be removed from this device.',
  'top.aspect': 'Aspect ratio',

  'empty.title': 'Start with a video',
  'empty.body': 'Import videos or photos from your device. Nothing is uploaded.',
  'empty.button': 'Import videos or photos',

  'import.picking': 'Importing {name}…',
  'import.unknownType': '"{name}" is not a video, photo or audio file.',
  'import.noVideoTrack': '"{name}" has no video in it.',
  'import.unsupportedCodec': '"{name}" uses {codec}, which this device cannot play. Try converting it to H.264 MP4.',
  'import.unsupportedImage': 'This browser cannot open the photo "{name}".',
  'import.unknownCodec': 'an unknown format',
  'import.bigWarning': '"{name}" is {size}{length}. Large clips can make the browser on phones and tablets run out of memory and reload. Import anyway?',
  'import.bigLength': ', {minutes} minutes long',
  'import.failed': 'Could not import "{name}": {reason}',
  'import.storageFull': 'Not enough storage on this device to keep "{name}" for autosave. It will work until you close the page.',

  'play.play': 'Play',
  'play.pause': 'Pause',
  'play.toStart': 'Go to start',
  'play.time': 'Playhead at {time} of {total}',

  'tool.split': 'Split',
  'tool.delete': 'Delete',
  'tool.music': 'Music',
  'tool.emoji': 'Emoji',
  'tool.stickers': 'Stickers',
  'tool.text': 'Text',
  'tool.addMedia': 'Add clip',
  'tool.zoomIn': 'Zoom in',
  'tool.zoomOut': 'Zoom out',

  'track.video': 'Video',
  'track.music': 'Music',
  'track.overlay': 'Overlays',
  'track.timeline': 'Timeline. Drag to scrub, pinch to zoom.',
  'track.trimStart': 'Trim start of {name}',
  'track.trimEnd': 'Trim end of {name}',
  'track.clip': '{name}, {duration}',
  'track.emptyMusic': 'Tap Music to add a soundtrack',
  'track.emptyOverlay': 'Emoji, stickers and text appear here',

  'inspect.clip': 'Clip',
  'inspect.volume': 'Volume',
  'inspect.mute': 'Mute original sound',
  'inspect.fit': 'Frame',
  'inspect.fitContain': 'Fit',
  'inspect.fitCover': 'Fill',
  'inspect.duration': 'Duration',
  'inspect.start': 'Start',
  'inspect.trimIn': 'In point',
  'inspect.trimOut': 'Out point',
  'inspect.music': 'Music',
  'inspect.fadeIn': 'Fade in',
  'inspect.fadeOut': 'Fade out',
  'inspect.balance': 'Original audio vs music',
  'inspect.balanceOriginal': 'Original',
  'inspect.balanceMusic': 'Music',
  'inspect.overlay': 'Overlay',
  'inspect.size': 'Size',
  'inspect.rotation': 'Rotation',
  'inspect.text': 'Text',
  'inspect.font': 'Font',
  'inspect.color': 'Colour',
  'inspect.outline': 'Outline',
  'inspect.shadow': 'Shadow',
  'inspect.close': 'Close',
  'inspect.seconds': '{value} s',
  'inspect.center': 'Centre',

  'music.title': 'Add music',
  'music.import': 'Import audio file (MP3, M4A, WAV)',
  'music.library': 'Free music included with the app',
  'music.preview': 'Preview {name}',
  'music.stopPreview': 'Stop preview',
  'music.add': 'Add',
  'music.license': 'License: {license}',

  'emoji.title': 'Emoji',
  'emoji.search': 'Search emoji',
  'emoji.loading': 'Loading emoji…',
  'emoji.none': 'No emoji match "{q}".',
  'emoji.recent': 'Recent',
  'stickers.title': 'Stickers',
  'text.title': 'Add text',
  'text.placeholder': 'Your text',
  'text.add': 'Add text',
  'dialog.close': 'Close',

  'export.title': 'Export video',
  'export.quality': 'Quality',
  'export.start': 'Export MP4',
  'export.cancel': 'Cancel',
  'export.preparing': 'Preparing…',
  'export.loadingEncoder': 'Loading encoder…',
  'export.rendering': 'Rendering {percent}%',
  'export.eta': 'About {time} left',
  'export.finishing': 'Finishing…',
  'export.done': 'Your video is ready',
  'export.share': 'Share / Save to Photos',
  'export.download': 'Download',
  'export.again': 'Done',
  'export.failed': 'Export failed: {reason}',
  'export.cancelled': 'Export cancelled.',
  'export.empty': 'Add a clip, emoji or text first.',
  'export.method': 'Encoder: {method}',
  'export.methodWebCodecs': 'hardware (WebCodecs)',
  'export.methodWasmAac': 'hardware video, software audio',
  'export.methodFfmpeg': 'software (ffmpeg, slower)',
  'export.keepOpen': 'Keep this page open until the export finishes.',
  'export.downscaled': '1080p is not supported here, exporting at 720p.',
  'export.size': '{size}, {duration}',
  'export.shareFailed': 'Sharing did not work here; use Download instead.',

  'about.title': 'About MediaEditor',
  'about.body': 'MediaEditor is a video editor that runs entirely in your browser. Videos, photos and music you import stay on this device: there is no server, no account, no tracking and no cookies.',
  'about.storage': 'Your project is saved automatically in this browser so a refresh does not lose work.',
  'about.licenses': 'Licenses and credits',
  'about.emoji': 'Emoji graphics: Twemoji by Twitter, Inc. and other contributors, licensed under CC-BY 4.0.',
  'about.emojiData': 'Emoji names and keywords: Emojibase, MIT License.',
  'about.stickers': 'Stickers: made for MediaEditor, released into the public domain (CC0 1.0).',
  'about.fonts': 'Fonts: Bricolage Grotesque, Inter, Bebas Neue and Pacifico (SIL Open Font License 1.1); Permanent Marker and Roboto Slab (Apache License 2.0).',
  'about.code': 'Built with Mediabunny (MPL-2.0), ffmpeg.wasm (MIT, core LGPL/GPL), React (MIT) and Zustand (MIT).',
  'about.music': 'Included music',
  'about.trackCredit': '{title}: composed and synthesised for MediaEditor, released into the public domain.',
  'about.version': 'Version {version}',

  'error.generic': 'Something went wrong: {reason}',
  'unit.mb': '{n} MB',
  'unit.gb': '{n} GB',
} as const;

export type StringKey = keyof typeof en;
type Table = Record<StringKey, string>;

const tables: Record<string, Table> = { en };
const currentLocale = 'en';

export function t(key: StringKey, params?: Record<string, string | number>): string {
  let s: string = tables[currentLocale]?.[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function formatBytes(n: number) {
  return n >= 1024 ** 3 ? t('unit.gb', { n: (n / 1024 ** 3).toFixed(1) }) : t('unit.mb', { n: Math.max(0.1, n / 1024 ** 2).toFixed(1) });
}
