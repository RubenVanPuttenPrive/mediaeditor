// Emoji picker. The index and the Twemoji images are loaded only when the picker is first opened.
import { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n/strings';
import { Dialog } from './Dialog';
import { emojiUrl, ASSET_BASE } from '../render/assets';
import { addOverlayAtPlayhead } from './Panels';

type Entry = [file: string, unicode: string, label: string, group: number, tags: string];
interface Index { groups: { id: number; key: string; label: string }[]; emoji: Entry[] }

let indexPromise: Promise<Index> | null = null;
const loadIndex = () => (indexPromise ??= fetch(`${ASSET_BASE}emoji/index.json`).then((r) => r.json()));

const RECENT_KEY = 'mediaeditor.recentEmoji';
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function pushRecent(file: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([file, ...readRecent().filter((f) => f !== file)].slice(0, 24)));
  } catch {
    /* storage unavailable */
  }
}

const GROUP_ICONS: Record<string, string> = {
  'smileys-emotion': '1f600', 'people-body': '1f44b', 'animals-nature': '1f43b', 'food-drink': '1f354',
  'travel-places': '1f697', activities: '26bd', objects: '1f4a1', symbols: '2764', flags: '1f3c1',
};

export default function EmojiPicker({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState<Index | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<number | 'recent'>(() => (readRecent().length ? 'recent' : 0));
  useEffect(() => {
    void loadIndex().then(setIndex);
  }, []);

  const list = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    if (q) {
      const words = q.split(/\s+/);
      return index.emoji.filter((e) => words.every((w) => e[2].toLowerCase().includes(w) || e[4].includes(w))).slice(0, 240);
    }
    if (group === 'recent') {
      const byFile = new Map(index.emoji.map((e) => [e[0], e]));
      return readRecent().map((f) => byFile.get(f)).filter((e): e is Entry => !!e);
    }
    return index.emoji.filter((e) => e[3] === group);
  }, [index, query, group]);

  const pick = (e: Entry) => {
    pushRecent(e[0]);
    addOverlayAtPlayhead({ kind: 'emoji', file: e[0], label: e[2] }, 0.25);
  };

  return (
    <Dialog title={t('emoji.title')} onClose={onClose} className="emoji-sheet">
      <input type="search" className="search" placeholder={t('emoji.search')} aria-label={t('emoji.search')}
        value={query} onChange={(e) => setQuery(e.target.value)} />
      {index && !query && (
        <div className="emoji-tabs" role="tablist" aria-label={t('emoji.title')}>
          {readRecent().length > 0 && (
            <button role="tab" aria-selected={group === 'recent'} className={group === 'recent' ? 'on' : ''}
              onClick={() => setGroup('recent')} aria-label={t('emoji.recent')} title={t('emoji.recent')}>
              <img src={emojiUrl('1f558')} alt="" width="24" height="24" />
            </button>
          )}
          {index.groups.map((g) => (
            <button key={g.id} role="tab" aria-selected={group === g.id} className={group === g.id ? 'on' : ''}
              onClick={() => setGroup(g.id)} aria-label={g.label} title={g.label}>
              <img src={emojiUrl(GROUP_ICONS[g.key] ?? '1f600')} alt="" width="24" height="24" />
            </button>
          ))}
        </div>
      )}
      {!index && <p className="muted">{t('emoji.loading')}</p>}
      {index && list.length === 0 && <p className="muted">{t('emoji.none', { q: query })}</p>}
      <div className="emoji-grid" role="list">
        {list.map((e) => (
          <button key={e[0]} role="listitem" className="emoji-btn" onClick={() => pick(e)} aria-label={e[2]} title={e[2]} data-emoji={e[0]}>
            <img src={emojiUrl(e[0])} alt="" loading="lazy" width="36" height="36" decoding="async" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
