// HANYA MEMBACA: cocokkan akun login murid dengan data users/handles.
import { GoogleAuth } from 'google-auth-library';
const sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),pid=sa.project_id;
const c=await new GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/identitytoolkit','https://www.googleapis.com/auth/datastore']}).getClient();
const note=m=>console.log('::notice title=cek::'+m);
const r=await c.request({url:`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:batchGet?maxResults=500`});
const fmt=t=>t?new Date(+t+8*3600e3).toISOString().slice(5,16).replace('T',' '):'-';
for(const u of r.data.users||[]){const user=(u.email||'').split('@')[0];
  let d='ada';try{await c.request({url:`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/users/${u.localId}`})}catch(e){d=e.response?('TIDAK ('+e.response.status+')'):'error'}
  note(`${(u.email||'').endsWith('@murid.jelajahkelas.app')?user:'(guru/google)'} | data users: ${d} | dibuat ${fmt(u.createdAt)} | masuk ${fmt(u.lastLoginAt)} WITA`)}
