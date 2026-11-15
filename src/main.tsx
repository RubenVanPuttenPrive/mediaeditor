import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque/wght.css';
// Fonts offered for text overlays. Bundled (not from a CDN) so exports look the same everywhere, offline too.
import '@fontsource/inter/800.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/pacifico/400.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/roboto-slab/700.css';
import './ui/styles.css';
import { App } from './ui/App';
import { registerServiceWorker } from './lib/pwa';
import { initLocale } from './i18n/strings';
import { startAnalytics } from './lib/analytics';

// Load the device's language (or the one picked in About) before the first paint.
await initLocale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
registerServiceWorker();
// Anonymous visit counts for the site owner (no cookies; videos never leave the device).
startAnalytics();
