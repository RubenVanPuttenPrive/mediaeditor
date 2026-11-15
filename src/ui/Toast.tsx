import { useEffect, useState } from 'react';
import { useEditor } from '../state/store';
import { t } from '../i18n/strings';
import { Icon } from './icons';

export function Toast() {
  const toast = useEditor((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const id = setTimeout(() => setVisible(false), Math.max(4000, toast.text.length * 70));
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && visible && (
        <div className="toast" key={toast.id}>
          <span>{toast.text}</span>
          <button className="icon-btn small" onClick={() => setVisible(false)} aria-label={t('dialog.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
