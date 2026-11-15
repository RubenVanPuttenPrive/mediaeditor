import { registerSW } from 'virtual:pwa-register';
import { useEditor } from '../state/store';
import { t } from '../i18n/strings';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  registerSW({
    immediate: true,
    onOfflineReady() {
      useEditor.getState().showToast(t('app.offlineReady'));
    },
  });
}
