/* Pengaturan Firebase untuk Jelajah Kelas.
   Isi bagian firebaseConfig dengan kode dari Firebase Console
   (Setelan proyek → Aplikasi Anda → Konfigurasi SDK). */
window.FB_CONFIG = {
  apiKey: "AIzaSyBknIh7RszPXw9A1Yfq6CTIQTSKIRqBj54",
  authDomain: "jelajah-kelas.firebaseapp.com",
  projectId: "jelajah-kelas",
  storageBucket: "jelajah-kelas.firebasestorage.app",
  messagingSenderId: "117968760505",
  appId: "1:117968760505:web:d8564b081664154779b568",
  /* jumlah murid maksimal untuk guru paket Gratis (samakan dengan angka di firestore.rules) */
  freeStudents: 10,
  /* lama masa coba gratis semua fitur Pro untuk guru baru (samakan dengan angka di firestore.rules) */
  trialDays: 14,
  /* kunci notifikasi web (Setelan proyek → Cloud Messaging → Web Push certificates) */
  vapidKey: "",
  /* alamat pengirim notifikasi di Cloudflare Workers */
  pushUrl: ""
};
