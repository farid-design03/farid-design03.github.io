// Selalu ambil versi terbaru dari internet; pakai salinan tersimpan hanya saat offline.
const CACHE = 'jelajah-kelas-v3';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Pustaka Firebase berversi tetap: simpan sekali supaya aplikasi tetap terbuka saat offline.
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match('./'))));
});

// Pemberitahuan tantangan: tombol Terima / Tolak, atau ketuk untuk membuka aplikasi.
self.addEventListener('notificationclick', e => {
  const d = e.notification.data || {}; const action = e.action || 'open';
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const msg = { inv: d.inv, code: d.code, action };
    if (list.length) { const c = list[0]; c.postMessage(msg); return c.focus && c.focus(); }
    return self.clients.openWindow('./?tantang=' + encodeURIComponent(d.code || ''));
  }));
});
