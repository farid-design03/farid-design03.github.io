// HANYA MEMBACA: ringkasan akun login murid vs data users (satu baris).
import { GoogleAuth } from 'google-auth-library';
const sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),pid=sa.project_id;
const c=await new GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/identitytoolkit','https://www.googleapis.com/auth/datastore']}).getClient();
const us=(await c.request({url:`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:batchGet?maxResults=500`})).data.users||[];
const base=`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
const out=[];for(const u of us){const n=(u.email||'').endsWith('@murid.jelajahkelas.app')?u.email.split('@')[0]:'guru';let d='ok';try{await c.request({url:`${base}/users/${u.localId}`})}catch(e){d='TANPA-DATA'}out.push(n+':'+d)}
console.log(`::notice title=cek::${us.length} akun login | `+out.join(', '));
