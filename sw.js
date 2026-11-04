// Service Worker: macht die App offline nutzbar.
const CACHE = 'calitrack-v5';
const JS = ['core', 'ui', 'views', 'training', 'steps', 'nutrition', 'backup', 'prefs', 'config', 'sync', 'actions', 'main'].map(n => `./js/${n}.js`);
const FILES = ['./', './index.html', './styles.css', './data.js', ...JS, './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Netzwerk zuerst (für Updates), bei Offline aus dem Cache.
self.addEventListener('fetch', e => {
  // Fremde Anfragen (Open Food Facts, Scanner-Bibliothek) nicht abfangen
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
// Tipp auf eine Erinnerung öffnet die App (oder holt sie in den Vordergrund)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
