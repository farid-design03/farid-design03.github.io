// HANYA MEMBACA: antrean Pemain Lain & ruang 30 menit terakhir.
import { GoogleAuth } from 'google-auth-library';
const sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT),pid=sa.project_id;
const c=await new GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/datastore','https://www.googleapis.com/auth/cloud-platform']}).getClient();
const base=`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents`;
const now=Date.now(),out=[];
const mm=(await c.request({url:`${base}/mm`})).data.documents||[];
for(const d of mm){const f=d.fields;out.push(`MM ${d.name.split('/').pop()} code=${f.code&&f.code.stringValue} umur=${Math.round((now-+(f.at&&f.at.integerValue||0))/1000)}s upd=${d.updateTime}`)}
const r=(await c.request({url:`${base}:runQuery`,method:'POST',data:{structuredQuery:{from:[{collectionId:'rooms'}],where:{fieldFilter:{field:{fieldPath:'created'},op:'GREATER_THAN',value:{integerValue:String(now-1800e3)}}},limit:20}}})).data;
for(const x of r){if(!x.document)continue;const f=x.document.fields;const pl=Object.keys((f.players&&f.players.mapValue.fields)||{}).length;
  out.push(`ROOM ${x.document.name.split('/').pop()} cls=${f.cls&&f.cls.stringValue} max=${f.max&&f.max.integerValue} status=${f.status&&f.status.stringValue} pemain=${pl} dibuat=${Math.round((now-+f.created.integerValue)/1000)}s lalu`)}
out.push('jam server '+new Date(now).toISOString());
console.log('::notice title=mm::'+out.join(' || '));
