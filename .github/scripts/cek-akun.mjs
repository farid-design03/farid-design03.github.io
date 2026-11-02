// HANYA MEMBACA: daftar dokumen users & handles, dibandingkan dengan akun login.
import { GoogleAuth } from 'google-auth-library';
const sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),pid=sa.project_id;
const c=await new GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/identitytoolkit','https://www.googleapis.com/auth/datastore']}).getClient();
const note=m=>console.log('::notice title=cek::'+m);
const auth=new Set(((await c.request({url:`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:batchGet?maxResults=500`})).data.users||[]).map(u=>u.localId));
const base=`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
const list=async col=>{let out=[],tok='';do{const r=(await c.request({url:`${base}/${col}?pageSize=300${tok?'&pageToken='+tok:''}`})).data;out=out.concat(r.documents||[]);tok=r.nextPageToken||''}while(tok);return out};
const fmt=t=>t?new Date(Date.parse(t)+8*3600e3).toISOString().slice(5,16).replace('T',' '):'-';
for(const d of await list('users')){const id=d.name.split('/').pop(),f=d.fields||{};
  note(`users ${f.username?f.username.stringValue:'(guru)'} | login ${auth.has(id)?'ADA':'HILANG'} | role ${f.role&&f.role.stringValue} | diubah ${fmt(d.updateTime)} WITA`)}
for(const d of await list('handles')){const f=d.fields||{},id=d.name.split('/').pop(),uid=f.uid&&f.uid.stringValue;note(`handle ${id} | login ${auth.has(uid)?'ADA':'HILANG'} | diubah ${fmt(d.updateTime)} WITA`)}
