import { t } from '../i18n/strings';
import { Dialog } from './Dialog';
import { BUILTIN_TRACKS } from '../render/music';
import { newProject } from './TopBar';
import { Icon } from './icons';

export default function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={t('about.title')} onClose={onClose} className="about-sheet">
      <p>{t('about.body')}</p>
      <p>{t('about.storage')}</p>
      <button className="btn" onClick={async () => { if (await newProject()) onClose(); }}>
        <Icon name="newDoc" />
        {t('top.newProject')}
      </button>
      <h3 className="sheet-subtitle">{t('about.licenses')}</h3>
      <ul className="license-list">
        <li>
          {t('about.emoji')}{' '}
          <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noreferrer">github.com/jdecked/twemoji</a>{' · '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC-BY 4.0</a>
        </li>
        <li>{t('about.emojiData')}</li>
        <li>{t('about.stickers')}</li>
        <li>{t('about.fonts')}</li>
        <li>{t('about.code')}</li>
      </ul>
      <h3 className="sheet-subtitle">{t('about.music')}</h3>
      <ul className="license-list">
        {BUILTIN_TRACKS.map((tr) => (
          <li key={tr.id}>
            {t('about.trackCredit', { title: tr.title })}{' '}
            <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0 1.0</a>
          </li>
        ))}
      </ul>
      <p className="muted small">{t('about.version', { version: __APP_VERSION__ })}</p>
    </Dialog>
  );
}
