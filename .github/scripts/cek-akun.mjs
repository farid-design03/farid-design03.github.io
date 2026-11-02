// Cek akun murid (HANYA MEMBACA). Hasil ditulis sebagai anotasi singkat tanpa data pribadi.
import { GoogleAuth } from 'google-auth-library';
const raw=process.env.FIREBASE_SERVICE_ACCOUNT;if(!raw){console.log('::notice::kunci tidak ada');process.exit(0)}
const sa=JSON.parse(raw),pid=sa.project_id;
const auth=new GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase','https://www.googleapis.com/auth/datastore','https://www.googleapis.com/auth/identitytoolkit']});
const c=await auth.getClient();const user=(process.env.CEK_USER||'farid').toLowerCase();
const fs_=p=>c.request({url:`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${p}`}).then(r=>r.data).catch(e=>({__err:e.response?e.response.status:String(e.message)}));
const note=m=>console.log('::notice title=cek::'+m);
const fmt=t=>t?new Date(+t).toISOString().slice(0,16).replace('T',' ')+' UTC':'-';
try{
  const r=await c.request({url:`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:lookup`,method:'POST',data:{email:[`${user}@murid.jelajahkelas.app`]}});
  const us=r.data.users||[];
  if(!us.length)note(`AUTH ${user}: TIDAK ADA akun login`);
  for(const u of us){note(`AUTH ${user}: ada, dibuat ${fmt(u.createdAt)}, terakhir masuk ${fmt(u.lastLoginAt)}, disabled=${!!u.disabled}`);
    const d=await fs_('users/'+u.localId);
    if(d.__err)note(`USERS doc: ${d.__err===404?'TIDAK ADA':'error '+d.__err}`);
    else{const f=d.fields||{};note(`USERS doc: ada, role=${f.role&&f.role.stringValue}, username=${f.username&&f.username.stringValue}, punya kelas=${!!(f.classId&&f.classId.stringValue)}, diubah ${d.updateTime}`)}}
}catch(e){note('AUTH error '+JSON.stringify(e.response&&e.response.data&&e.response.data.error&&e.response.data.error.message||e.message))}
const h=await fs_('handles/'+user);
note(h.__err?`HANDLES/${user}: ${h.__err===404?'TIDAK ADA':'error '+h.__err}`:`HANDLES/${user}: ada, uid=${(h.fields.uid||{}).stringValue}, diubah ${h.updateTime}`);
const rc=await fs_('recovery/'+user);note(rc.__err?`RECOVERY/${user}: ${rc.__err===404?'TIDAK ADA':'error '+rc.__err}`:`RECOVERY/${user}: ada`);
