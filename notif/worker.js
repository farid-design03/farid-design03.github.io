// Pengirim notifikasi tantangan JELAS — Cloudflare Worker (gratis, tanpa kartu).
// Rahasia yang dibutuhkan di Cloudflare: SERVICE_ACCOUNT = isi file kunci akun layanan Firebase (.json).
// Pembayaran (pilih salah satu):
//   Midtrans: MIDTRANS_SERVER_KEY = Server Key, MIDTRANS_PRODUCTION = 1 (hanya saat sudah mode asli/Production).
//   Xendit:   XENDIT_SECRET_KEY = Secret API key, XENDIT_CALLBACK_TOKEN = Webhook verification token.

const ALLOWED_ORIGINS = ['https://farid-design03.github.io'];
let SA = null, ACCESS = { token: null, exp: 0 }, JWKS = { keys: null, exp: 0 };

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlStr = (s) => b64url(enc.encode(s));
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

function cors(origin) {
  const o = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' };
}
const reply = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });

// Token akses Google dari akun layanan (berlaku 1 jam, disimpan sementara).
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (ACCESS.token && ACCESS.exp > now + 60) return ACCESS.token;
  const pem = SA.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const head = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlStr(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + head + '.' + claim + '.' + b64url(sig) });
  const j = await r.json();
  if (!j.access_token) throw new Error('Gagal mendapat token Google: ' + JSON.stringify(j));
  ACCESS = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return ACCESS.token;
}

// Memastikan permintaan benar-benar dari pengguna JELAS yang sedang login.
async function verifyUser(idToken) {
  const [h, p, s] = String(idToken || '').split('.');
  if (!s) throw new Error('Token tidak ada');
  const header = JSON.parse(new TextDecoder().decode(fromB64url(h)));
  const payload = JSON.parse(new TextDecoder().decode(fromB64url(p)));
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== SA.project_id || payload.iss !== 'https://securetoken.google.com/' + SA.project_id || payload.exp < now) throw new Error('Token tidak sah');
  if (!JWKS.keys || JWKS.exp < Date.now()) {
    const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    JWKS = { keys: (await r.json()).keys, exp: Date.now() + 3600e3 };
  }
  const jwk = JWKS.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Kunci token tidak dikenal');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromB64url(s), enc.encode(h + '.' + p));
  if (!ok) throw new Error('Tanda tangan token salah');
  return payload.user_id || payload.sub;
}

const val = (f) => f == null ? null : f.stringValue ?? f.integerValue ?? f.doubleValue ?? f.booleanValue
  ?? (f.arrayValue ? (f.arrayValue.values || []).map(val) : f.mapValue ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, val(v)])) : null);
const fieldsOf = (doc) => { const out = {}; Object.entries((doc && doc.fields) || {}).forEach(([k, v]) => { out[k] = val(v); }); return out; };
async function listDocs(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/${path}?pageSize=300`, { headers: { Authorization: 'Bearer ' + await accessToken() } });
  const j = await r.json();
  return (j.documents || []).map((d) => ({ id: d.name.split('/').pop(), ...fieldsOf(d) }));
}
async function deleteDoc(path) {
  await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/${path}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + await accessToken() } });
}
// Kirim ke semua murid kelas yang belum mengerjakan tugas.
async function pushTask(cid, tid, data, onlyPending) {
  const cls = await getDoc('classes/' + cid);
  const members = Object.keys((cls && cls.members) || {});
  if (!members.length) return 0;
  const done = onlyPending ? new Set((await listDocs(`classes/${cid}/tasks/${tid}/done`)).map((d) => d.id)) : new Set();
  let sent = 0;
  for (const uid of members) if (!done.has(uid)) sent += await pushTo(uid, data);
  return sent;
}
async function getDoc(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer ' + await accessToken() } });
  if (r.status === 404) return null;
  const j = await r.json();
  return fieldsOf(j);
}

async function pushTo(uid, data) {
  const user = await getDoc('users/' + uid);
  const tokens = (user && user.push) || [];
  const clean = {};
  Object.entries(data).forEach(([k, v]) => { if (v != null) clean[k] = String(v); });
  let sent = 0;
  for (const token of tokens.slice(-5)) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, data: clean, webpush: { headers: { Urgency: 'high', TTL: '86400' } } } }),
    });
    if (r.ok) sent++;
  }
  return sent;
}

// Tulis sebagian kolom dokumen (dokumen dibuat jika belum ada).
const fv = (v) => v == null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number'
  ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : { stringValue: String(v) };
async function patchDoc(path, obj, precondition) {
  const mask = Object.keys(obj).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const pre = precondition ? '&currentDocument.updateTime=' + encodeURIComponent(precondition) : '';
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/${path}?${mask}${pre}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fv(v)])) }),
  });
  if (!r.ok) throw new Error('Firestore ' + r.status + ': ' + (await r.text()).slice(0, 200));
}
async function getDocRaw(path) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/${path}`, { headers: { Authorization: 'Bearer ' + await accessToken() } });
  if (r.status === 404) return null;
  const j = await r.json();
  return { data: fieldsOf(j), updateTime: j.updateTime };
}

// ---------- Pembayaran paket Pro lewat Xendit ----------
// Harga dibaca dari Firestore config/app.plans (diatur admin). Jika kosong, pakai harga bawaan ini.
const DEFAULT_PLANS = [
  { id: 'b1', name: '1 bulan', days: 30, price: 25000 },
  { id: 'b6', name: '6 bulan', days: 183, price: 120000 },
  { id: 'b12', name: '1 tahun', days: 365, price: 200000 },
];
const xAuth = (env) => 'Basic ' + btoa(env.XENDIT_SECRET_KEY + ':');
async function plansNow() {
  const cfg = (await getDoc('config/app')) || {};
  const list = Array.isArray(cfg.plans) && cfg.plans.length ? cfg.plans : DEFAULT_PLANS;
  return list.map((p) => ({ id: String(p.id), name: String(p.name || ''), days: Math.round(+p.days || 0), price: Math.round(+p.price || 0) }))
    .filter((p) => p.id && p.days > 0 && p.price >= 10000);
}
async function createInvoice(env, uid, planId, origin) {
  if (env.MIDTRANS_SERVER_KEY) return createMidtrans(env, uid, planId, origin);
  if (!env.XENDIT_SECRET_KEY) return { status: 503, body: { error: 'Pembayaran otomatis belum diaktifkan.' } };
  const user = await getDoc('users/' + uid);
  if (!user || user.role !== 'teacher') return { status: 403, body: { error: 'Paket Pro hanya untuk akun guru.' } };
  const plan = (await plansNow()).find((p) => p.id === planId);
  if (!plan) return { status: 400, body: { error: 'Paket tidak ditemukan.' } };
  const now = Date.now(), pend = user.pay;
  if (pend && pend.plan === plan.id && +pend.price === plan.price && +pend.exp > now + 15 * 60e3 && pend.url) return { status: 200, body: { url: pend.url, reused: true } };
  const ext = `jelas_${uid}_${plan.id}_${now}`;
  const site = (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]) + '/';
  const r = await fetch('https://api.xendit.co/v2/invoices', {
    method: 'POST', headers: { Authorization: xAuth(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_id: ext, amount: plan.price, currency: 'IDR', invoice_duration: 86400,
      description: `JELAS Pro ${plan.name} untuk ${user.email || ''}`.trim(),
      payer_email: user.email || undefined,
      customer: { given_names: String(user.name || 'Guru JELAS').slice(0, 50), email: user.email || undefined },
      customer_notification_preference: { invoice_paid: ['email'] },
      items: [{ name: `JELAS Pro ${plan.name}`, quantity: 1, price: plan.price, category: 'Langganan' }],
      success_redirect_url: site + '?bayar=ok', failure_redirect_url: site + '?bayar=batal',
    }),
  });
  const inv = await r.json();
  if (!r.ok || !inv.invoice_url) return { status: 502, body: { error: 'Xendit menolak: ' + (inv.message || r.status) } };
  const exp = inv.expiry_date ? Date.parse(inv.expiry_date) : now + 86400e3;
  await patchDoc('payments/' + ext, { uid, plan: plan.id, planName: plan.name, days: plan.days, amount: plan.price, status: 'PENDING', invoiceId: inv.id, url: inv.invoice_url, email: user.email || '', created: now });
  await savePending(uid, plan, inv.invoice_url, exp, ext);
  return { status: 200, body: { url: inv.invoice_url } };
}
// Catat tagihan yang menunggu dibayar di dokumen guru (dipakai ulang jika guru menekan Bayar lagi).
async function savePending(uid, plan, url, exp, ext) {
  await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/users/${uid}?updateMask.fieldPaths=pay`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { pay: { mapValue: { fields: { plan: fv(plan.id), price: fv(plan.price), url: fv(url), exp: fv(exp), ext: fv(ext) } } } } }),
  });
}
// Aktifkan / perpanjang Pro sekali saja untuk satu pembayaran.
async function grantPro(ext, extra) {
  const pay = await getDocRaw('payments/' + ext);
  if (!pay) return 'no record';
  const p = pay.data;
  if (p.status === 'PAID') return 'already';
  try { await patchDoc('payments/' + ext, Object.assign({ status: 'PAID', paidAt: Date.now() }, extra), pay.updateTime); }
  catch (e) { return 'race'; }
  const user = (await getDoc('users/' + p.uid)) || {};
  const base = Math.max(Date.now(), +user.proUntil || 0);
  await patchDoc('users/' + p.uid, { plan: 'pro', proUntil: base + (+p.days) * 864e5, pay: null, lastPay: ext });
  return 'ok';
}

// ---------- Midtrans (Snap) ----------
const mtBase = (env) => env.MIDTRANS_PRODUCTION === '1' ? { snap: 'https://app.midtrans.com', api: 'https://api.midtrans.com' } : { snap: 'https://app.sandbox.midtrans.com', api: 'https://api.sandbox.midtrans.com' };
const mtAuth = (env) => 'Basic ' + btoa(env.MIDTRANS_SERVER_KEY + ':');
async function createMidtrans(env, uid, planId, origin) {
  const user = await getDoc('users/' + uid);
  if (!user || user.role !== 'teacher') return { status: 403, body: { error: 'Paket Pro hanya untuk akun guru.' } };
  const plan = (await plansNow()).find((p) => p.id === planId);
  if (!plan) return { status: 400, body: { error: 'Paket tidak ditemukan.' } };
  const now = Date.now(), pend = user.pay;
  if (pend && pend.plan === plan.id && +pend.price === plan.price && +pend.exp > now + 15 * 60e3 && pend.url) return { status: 200, body: { url: pend.url, reused: true } };
  const ext = `J-${uid}-${plan.id}-${now.toString(36)}`;
  const site = (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]) + '/';
  const r = await fetch(mtBase(env).snap + '/snap/v1/transactions', {
    method: 'POST', headers: { Authorization: mtAuth(env), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      transaction_details: { order_id: ext, gross_amount: plan.price },
      item_details: [{ id: plan.id, price: plan.price, quantity: 1, name: `JELAS Pro ${plan.name}`.slice(0, 50) }],
      customer_details: { first_name: String(user.name || 'Guru JELAS').slice(0, 50), email: user.email || undefined },
      callbacks: { finish: site + '?bayar=ok' },
      expiry: { unit: 'hours', duration: 24 },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.redirect_url) return { status: 502, body: { error: 'Midtrans menolak: ' + ((j.error_messages || []).join(', ') || r.status) } };
  const exp = now + 24 * 3600e3;
  await patchDoc('payments/' + ext, { uid, plan: plan.id, planName: plan.name, days: plan.days, amount: plan.price, status: 'PENDING', gateway: 'midtrans', url: j.redirect_url, email: user.email || '', created: now });
  await savePending(uid, plan, j.redirect_url, exp, ext);
  return { status: 200, body: { url: j.redirect_url } };
}
async function sha512hex(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-512', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
// Kabar dari Midtrans: cek tanda tangan, lalu cek ulang status langsung ke Midtrans sebelum Pro diaktifkan.
async function midtransWebhook(request, env) {
  if (!env.MIDTRANS_SERVER_KEY) return new Response('off', { status: 200 });
  const b = await request.json().catch(() => ({}));
  const ext = String(b.order_id || '');
  if (!/^J-[A-Za-z0-9]+-[A-Za-z0-9]+-[a-z0-9]+$/.test(ext)) return new Response('ignored', { status: 200 });
  const sig = await sha512hex(ext + String(b.status_code || '') + String(b.gross_amount || '') + env.MIDTRANS_SERVER_KEY);
  if (sig !== b.signature_key) return new Response('bad signature', { status: 403 });
  const r = await fetch(mtBase(env).api + '/v2/' + encodeURIComponent(ext) + '/status', { headers: { Authorization: mtAuth(env), Accept: 'application/json' } });
  const st = await r.json().catch(() => ({}));
  if (st.order_id !== ext) return new Response('unknown order', { status: 200 });
  const pay = await getDoc('payments/' + ext);
  if (!pay) return new Response('no record', { status: 200 });
  const ts = st.transaction_status, fraud = String(st.fraud_status || 'accept').toLowerCase();
  if (['expire', 'cancel', 'deny', 'failure'].includes(ts)) { if (pay.status !== 'PAID') await patchDoc('payments/' + ext, { status: 'EXPIRED' }); return new Response('closed', { status: 200 }); }
  if (!((ts === 'settlement' || ts === 'capture') && fraud === 'accept' && String(st.status_code) === '200')) return new Response('pending', { status: 200 });
  if (Math.round(+st.gross_amount) < +pay.amount) return new Response('underpaid', { status: 200 });
  return new Response(await grantPro(ext, { method: st.payment_type || '', channel: (st.va_numbers && st.va_numbers[0] && st.va_numbers[0].bank) || st.issuer || st.acquirer || '' }), { status: 200 });
}

// Kabar dari Xendit. Status selalu dicek ulang langsung ke Xendit sebelum Pro diaktifkan.
async function xenditWebhook(request, env) {
  if (!env.XENDIT_CALLBACK_TOKEN || request.headers.get('x-callback-token') !== env.XENDIT_CALLBACK_TOKEN) return new Response('forbidden', { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ext = String(body.external_id || '');
  if (!/^jelas_[A-Za-z0-9]+_[A-Za-z0-9]+_\d+$/.test(ext) || !body.id) return new Response('ignored', { status: 200 });
  const r = await fetch('https://api.xendit.co/v2/invoices/' + encodeURIComponent(body.id), { headers: { Authorization: xAuth(env) } });
  const inv = await r.json();
  if (!r.ok || inv.external_id !== ext) return new Response('unknown invoice', { status: 200 });
  const pay = await getDocRaw('payments/' + ext);
  if (!pay) return new Response('no record', { status: 200 });
  const p = pay.data;
  if (p.status === 'PAID') return new Response('already', { status: 200 });
  if (inv.status === 'EXPIRED') { await patchDoc('payments/' + ext, { status: 'EXPIRED' }); return new Response('expired', { status: 200 }); }
  if (inv.status !== 'PAID' && inv.status !== 'SETTLED') return new Response('pending', { status: 200 });
  if (+(inv.paid_amount ?? inv.amount) < +p.amount) return new Response('underpaid', { status: 200 });
  return new Response(await grantPro(ext, { method: inv.payment_method || '', channel: inv.payment_channel || '' }), { status: 200 });
}

// Pengingat tugas terjadwal (Cron Trigger setiap jam).
async function reminders() {
  const now = new Date();
  const list = await listDocs('reminders');
  for (const r of list) {
    const tz = Number(r.tz || 480);
    const local = new Date(now.getTime() + tz * 60000);
    const day = local.toISOString().slice(0, 10), hour = local.getUTCHours();
    if (!r.due || day > r.due) { await deleteDoc('reminders/' + r.id); continue; }
    const hours = (r.hours || []).map(Number);
    if (!hours.includes(hour)) continue;
    const key = day + ':' + hour;
    if (r.last === key) continue;
    await pushTask(r.classId, r.tid, { type: 'task', tid: r.tid, title: `Jangan lupa tugasmu: ${r.title || ''}`, body: `${r.subjName || ''} · batas ${r.due}. Kerjakan sekarang, ya!` }, true);
    await fetch(`https://firestore.googleapis.com/v1/projects/${SA.project_id}/databases/(default)/documents/reminders/${r.id}?updateMask.fieldPaths=last`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { last: { stringValue: key } } }),
    });
  }
}

export default {
  async scheduled(event, env, ctx) {
    if (!SA) SA = JSON.parse(env.SERVICE_ACCOUNT);
    ctx.waitUntil(reminders());
  },
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    const path = new URL(request.url).pathname;
    if (request.method === 'POST' && (path === '/xendit' || path === '/midtrans')) {
      try { if (!SA) SA = JSON.parse(env.SERVICE_ACCOUNT); return await (path === '/midtrans' ? midtransWebhook(request, env) : xenditWebhook(request, env)); }
      catch (e) { return new Response('error: ' + String(e && e.message || e), { status: 500 }); }
    }
    if (request.method !== 'POST') return reply(200, { ok: true, info: 'Pengirim notifikasi JELAS aktif.' }, origin);
    try {
      if (!SA) SA = JSON.parse(env.SERVICE_ACCOUNT);
      const uid = await verifyUser((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
      const { type, id, cid, tid, plan } = await request.json();
      if (type === 'pay') { const r = await createInvoice(env, uid, String(plan || ''), origin); return reply(r.status, r.body, origin); }
      if (type === 'task') {
        if (!cid || cid !== uid || !/^[A-Za-z0-9_-]{4,120}$/.test(tid || '')) return reply(403, { error: 'Bukan guru kelas ini' }, origin);
        const t = await getDoc(`classes/${cid}/tasks/${tid}`);
        if (!t) return reply(404, { error: 'Tugas tidak ditemukan' }, origin);
        const sent = await pushTask(cid, tid, { type: 'task', tid, title: `Tugas baru: ${t.title || ''}`, body: `${t.subjName || ''} · ${t.n || ''} soal · batas ${t.due || ''}. Yuk kerjakan!` }, false);
        return reply(200, { ok: true, sent }, origin);
      }
      if (!/^[A-Za-z0-9_-]{6,120}$/.test(id || '')) return reply(400, { error: 'id tidak valid' }, origin);
      if (type === 'nudge') {
        const d = await getDoc('fq/' + id);
        if (!d || !(d.members || []).includes(uid)) return reply(403, { error: 'Bukan anggota misi teman ini' }, origin);
        const other = d.members.find((x) => x !== uid), nm = (d.names || {})[uid] || 'Temanmu';
        const sent = await pushTo(other, { type: 'nudge', title: `${nm} mencolekmu! 👋`, body: 'Ayo selesaikan misi teman minggu ini.' });
        return reply(200, { ok: true, sent }, origin);
      }
      const inv = await getDoc('invites/' + id);
      if (!inv) return reply(404, { error: 'Undangan tidak ditemukan' }, origin);
      let sent = 0;
      if (type === 'invite') {
        if (inv.from !== uid) return reply(403, { error: 'Bukan pengirim undangan' }, origin);
        sent = await pushTo(inv.to, { type: 'invite', inv: id, code: inv.code, title: `${inv.fromName || 'Temanmu'} menantangmu!`, body: `${inv.subjName || ''}${inv.title ? ' · ' + inv.title : ''}. Terima tantangannya?` });
      } else if (type === 'answer') {
        if (inv.to !== uid || !inv.status) return reply(403, { error: 'Bukan penerima undangan' }, origin);
        const who = inv.toName || 'Temanmu';
        sent = inv.status === 'declined'
          ? await pushTo(inv.from, { type: 'declined', title: `${who} menolak tantanganmu`, body: 'Coba ajak teman lain, atau tantang lagi nanti.' })
          : await pushTo(inv.from, { type: 'accepted', code: inv.code, title: `${who} menerima tantanganmu!`, body: 'Buka JELAS dan mulai tandingnya.' });
      } else return reply(400, { error: 'type tidak dikenal' }, origin);
      return reply(200, { ok: true, sent }, origin);
    } catch (e) {
      return reply(500, { error: String(e && e.message || e) }, origin);
    }
  },
};
