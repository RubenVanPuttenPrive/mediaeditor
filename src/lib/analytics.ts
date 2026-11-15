// Anonymous visit statistics for the site owner, via Cloudflare Web Analytics.
// The beacon sets no cookies and collects no personal data: page views, country, browser/device type
// and page-load speed. It never sees videos, photos, music or anything you edit; those stay on the device.
// It is enabled only when the build provides VITE_CF_BEACON_TOKEN (a GitHub repository variable) and
// never on localhost, so local development and automated tests send nothing.

const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

export function startAnalytics(token = import.meta.env.VITE_CF_BEACON_TOKEN as string | undefined) {
  if (!token || typeof document === 'undefined') return false;
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')) return false;
  if (document.querySelector(`script[src="${BEACON_SRC}"]`)) return true;
  const s = document.createElement('script');
  s.defer = true;
  s.src = BEACON_SRC;
  s.setAttribute('data-cf-beacon', JSON.stringify({ token }));
  document.head.appendChild(s);
  return true;
}
