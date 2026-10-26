// Memasang firestore.rules ke Firebase lewat Firebase Rules API.
import { GoogleAuth } from 'google-auth-library';
import fs from 'node:fs';
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) { console.log('Kunci FIREBASE_SERVICE_ACCOUNT belum diisi di GitHub Secrets, langkah ini dilewati.'); process.exit(0); }
const sa = JSON.parse(raw);
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'] });
const client = await auth.getClient();
const base = `https://firebaserules.googleapis.com/v1/projects/${sa.project_id}`;
const content = fs.readFileSync('firestore.rules', 'utf8');
try {
  const rs = await client.request({ url: `${base}/rulesets`, method: 'POST', data: { source: { files: [{ name: 'firestore.rules', content }] } } });
  await client.request({ url: `${base}/releases/cloud.firestore`, method: 'PATCH', data: { release: { name: `projects/${sa.project_id}/releases/cloud.firestore`, rulesetName: rs.data.name } } });
  console.log('Aturan Firestore terpasang:', rs.data.name);
} catch (e) {
  console.error('Gagal memasang aturan:', JSON.stringify(e.response && e.response.data || e.message, null, 2));
  process.exit(1);
}
