// Sekali jalan: tambahkan jelajahkelas.github.io ke domain resmi Firebase Auth & cek batasan API key.
import { GoogleAuth } from 'google-auth-library';
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
if (!sa.project_id) { console.log('::notice::kunci tidak ada'); process.exit(0); }
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'] });
const c = await auth.getClient(); const NEW = 'jelajahkelas.github.io'; const out = [];
try {
  const u = `https://identitytoolkit.googleapis.com/admin/v2/projects/${sa.project_id}/config`;
  const cfg = (await c.request({ url: u })).data; const d = cfg.authorizedDomains || [];
  if (!d.includes(NEW)) { await c.request({ url: u + '?updateMask=authorizedDomains', method: 'PATCH', data: { authorizedDomains: [...d, NEW] } }); out.push('domain ditambah'); } else out.push('domain sudah ada');
  out.push('domains=' + [...new Set([...d, NEW])].join(','));
} catch (e) { out.push('auth gagal ' + JSON.stringify(e.response && e.response.data && e.response.data.error && e.response.data.error.message || e.message)); }
try {
  const k = (await c.request({ url: `https://apikeys.googleapis.com/v2/projects/${sa.project_id}/locations/global/keys` })).data.keys || [];
  k.forEach(x => out.push('key ' + x.displayName + ' referrer=' + JSON.stringify(((x.restrictions || {}).browserKeyRestrictions || {}).allowedReferrers || 'bebas')));
} catch (e) { out.push('apikeys gagal ' + JSON.stringify(e.response && e.response.data && e.response.data.error && e.response.data.error.message || e.message)); }
console.log('::notice::' + out.join(' | '));
