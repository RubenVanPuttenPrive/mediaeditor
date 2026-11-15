import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../i18n/strings';
import { Icon } from './icons';

/** Native modal <dialog>: focus trapping, Escape to close and inert background come for free. */
export function Dialog(props: { title: string; onClose: () => void; children: ReactNode; className?: string; closable?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closable = props.closable ?? true;
  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => d.close();
  }, []);
  return (
    <dialog ref={ref} className={`sheet ${props.className ?? ''}`} aria-labelledby="dialog-title"
      onCancel={(e) => { e.preventDefault(); if (closable) props.onClose(); }}
      onClick={(e) => { if (e.target === ref.current && closable) props.onClose(); }}>
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2 id="dialog-title">{props.title}</h2>
          {closable && (
            <button className="icon-btn" onClick={props.onClose} aria-label={t('dialog.close')}>
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className="sheet-body">{props.children}</div>
      </div>
    </dialog>
  );
}
