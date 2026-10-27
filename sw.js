// Selalu ambil versi terbaru dari internet; pakai salinan tersimpan hanya saat offline.
const CACHE = 'jelajah-kelas-v79';
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
    if (d.type === 'task' && d.tid) {
      if (list.length) { list[0].postMessage({ task: d.tid }); return list[0].focus && list[0].focus(); }
      return self.clients.openWindow('./?tugas=' + encodeURIComponent(d.tid));
    }
    const msg = { inv: d.inv, code: d.code, action };
    if (list.length) { const c = list[0]; c.postMessage(msg); return c.focus && c.focus(); }
    if (!d.code && !d.inv) return self.clients.openWindow('./');
    return self.clients.openWindow('./?tantang=' + encodeURIComponent(d.code || '') + (d.inv ? '&inv=' + encodeURIComponent(d.inv) + '&act=' + (action === 'decline' ? 'decline' : 'accept') : ''));
  }));
});

// Notifikasi dari server (Firebase Cloud Messaging) tetap muncul walaupun aplikasi tertutup.
self.addEventListener('push', e => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = j.data || j; } catch (_) {}
  const opt = { body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.inv ? 'inv-' + d.inv : (d.type || 'jelas'),
    renotify: true, vibrate: [200, 100, 200], data: d };
  if (d.type === 'invite') { opt.requireInteraction = true; opt.actions = [{ action: 'accept', title: 'Terima' }, { action: 'decline', title: 'Tolak' }]; }
  if (d.type === 'task') { opt.requireInteraction = true; opt.tag = 'task-' + d.tid; opt.actions = [{ action: 'task', title: 'Kerjakan sekarang' }]; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.visibilityState === 'visible');
    if (open) { open.postMessage({ push: d }); return; }
    return self.registration.showNotification(d.title || 'JELAS', opt);
  }));
});
