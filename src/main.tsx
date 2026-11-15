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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
registerServiceWorker();
