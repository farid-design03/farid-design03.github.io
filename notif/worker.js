// Pengirim notifikasi tantangan JELAS — Cloudflare Worker (gratis, tanpa kartu).
// Rahasia yang dibutuhkan di Cloudflare: SERVICE_ACCOUNT = isi file kunci akun layanan Firebase (.json).

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
    if (request.method !== 'POST') return reply(200, { ok: true, info: 'Pengirim notifikasi JELAS aktif.' }, origin);
    try {
      if (!SA) SA = JSON.parse(env.SERVICE_ACCOUNT);
      const uid = await verifyUser((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''));
      const { type, id, cid, tid } = await request.json();
      if (type === 'task') {
        if (!cid || cid !== uid || !/^[A-Za-z0-9_-]{4,120}$/.test(tid || '')) return reply(403, { error: 'Bukan guru kelas ini' }, origin);
        const t = await getDoc(`classes/${cid}/tasks/${tid}`);
        if (!t) return reply(404, { error: 'Tugas tidak ditemukan' }, origin);
        const sent = await pushTask(cid, tid, { type: 'task', tid, title: `Tugas baru: ${t.title || ''}`, body: `${t.subjName || ''} · ${t.n || ''} soal · batas ${t.due || ''}. Yuk kerjakan!` }, false);
        return reply(200, { ok: true, sent }, origin);
      }
      if (!/^[A-Za-z0-9_-]{6,120}$/.test(id || '')) return reply(400, { error: 'id tidak valid' }, origin);
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
