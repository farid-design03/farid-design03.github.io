// Sekali pakai: membuat ulang akun login murid dengan UID lama agar datanya tersambung lagi.
import { GoogleAuth } from 'google-auth-library';
const raw=process.env.FIREBASE_SERVICE_ACCOUNT;if(!raw){console.log('::error::kunci FIREBASE_SERVICE_ACCOUNT belum ada');process.exit(1)}
const sa=JSON.parse(raw),pid=sa.project_id,uid=process.env.UID_LAMA,user=process.env.USERNAME_LAMA;
const c=await new GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/identitytoolkit','https://www.googleapis.com/auth/datastore']}).getClient();
const note=m=>console.log('::notice title=pulihkan::'+m);
const d=(await c.request({url:`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/users/${uid}`})).data.fields;
if(d.username.stringValue!==user){note('nama pengguna tidak cocok, dibatalkan');process.exit(1)}
const pin=d.pin&&d.pin.stringValue;if(!/^\d{4}$/.test(pin||'')){note('PIN lama tidak ditemukan, dibatalkan');process.exit(1)}
const ex=(await c.request({url:`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts:lookup`,method:'POST',data:{localId:[uid]}})).data.users;
if(ex&&ex.length){note('akun login sudah ada, tidak perlu dipulihkan');process.exit(0)}
await c.request({url:`https://identitytoolkit.googleapis.com/v1/projects/${pid}/accounts`,method:'POST',data:{localId:uid,email:`${user}@murid.jelajahkelas.app`,password:`jk-${pin}-murid`,emailVerified:false}});
note(`akun ${user} dipulihkan dengan UID lama`);
