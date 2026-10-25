// Pengirim notifikasi tantangan JELAS.
// Berjalan di Firebase Cloud Functions (paket Blaze). Dipasang otomatis oleh GitHub Actions.
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'asia-southeast2', maxInstances: 5 });

async function sendTo(uid, data) {
  if (!uid) return;
  const ref = admin.firestore().doc('users/' + uid);
  const snap = await ref.get();
  const tokens = (snap.exists && snap.data().push) || [];
  if (!tokens.length) return;
  const clean = {};
  Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null) clean[k] = String(v); });
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: clean,
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
  });
  const bad = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token' || code === 'messaging/invalid-argument')) bad.push(tokens[i]);
  });
  if (bad.length) await ref.update({ push: admin.firestore.FieldValue.arrayRemove(...bad) });
}

// Teman mengirim tantangan: munculkan gelembung "X menantangmu!" dengan tombol Terima / Tolak.
exports.inviteCreated = onDocumentCreated('invites/{id}', async (ev) => {
  const x = ev.data && ev.data.data();
  if (!x) return;
  await sendTo(x.to, {
    type: 'invite', inv: ev.params.id, code: x.code,
    title: `${x.fromName || 'Temanmu'} menantangmu!`,
    body: `${x.subjName || ''}${x.title ? ' · ' + x.title : ''}. Terima tantangannya?`,
  });
});

// Tantangan dijawab: beri tahu si penantang.
exports.inviteAnswered = onDocumentUpdated('invites/{id}', async (ev) => {
  const b = ev.data.before.data(), a = ev.data.after.data();
  if (!a || (b && b.status) || !a.status) return;
  const who = a.toName || 'Temanmu';
  if (a.status === 'declined') {
    await sendTo(a.from, { type: 'declined', title: `${who} menolak tantanganmu`, body: 'Coba ajak teman lain, atau tantang lagi nanti.' });
  } else if (a.status === 'accepted') {
    await sendTo(a.from, { type: 'accepted', code: a.code, title: `${who} menerima tantanganmu!`, body: 'Buka JELAS dan mulai tandingnya.' });
  }
});
