const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// =========================================================
// KONFIGURASI PRODUCTION
// =========================================================
const CHECK_IN_INTERVAL_HOURS = 24; // Batas waktu check-in (24 jam)

// Masukkan Token Fonnte asli dari dashboard.fonnte.com
const FONNTE_TOKEN = 'fj9onjYfqNctNtG14Btw'; 

// DAFTAR KONTAK DARURAT (Tambah/edit nomor WA & nama penerima di sini)
const EMERGENCY_CONTACTS = [
  { 
    name: 'ipiii', 
    waNumber: '6285117356475', 
    secretMessage: 'Nt sudah sejauh ini berjuang'
  },
 
];

// Pesan otomatis yang akan dikirim ke WhatsApp kontak darurat
// const USER_SECRET_MESSAGE = `[PESAN OTOMATIS DARURAT]
//Maafin ivi ya kalo ada salah,doain ivi trs kalo ivi bener bener udh ga ada,jangan tinggalin sholat ya.

//Halo, ini adalah pesan terprogram dari sistem yang sudah di program. 
// Pengguna sistem ini tidak melakukan checkin di waktu yang telah di set. Mohon segera mengecek keberadaan/kondisi pengguna.`;

// FUNGSI TEMPLATE PESAN UTAMA (Mencampurkan pesan personal + template penutup)
const getEmergencyMessage = (contact) => {
  return `[PESAN OTOMATIS DARURAT]
${contact.secretMessage}

Halo , ini adalah pesan terprogram dari sistem yang sudah diprogram. 
Pengguna sistem ini tidak melakukan check-in di waktu yang telah di-set. Mohon segera mengecek keberadaan/kondisi pengguna.`;
}; 
// =========================================================
// STATE SIMPANAN
// =========================================================
let lastCheckIn = new Date();
let isMessageSent = false;

// 1. Endpoint API untuk Check-in dari iPhone / Apple Watch
app.post('/api/checkin', (req, res) => {
  lastCheckIn = new Date();
  isMessageSent = false; // Reset status pengiriman jika pengguna aktif lagi
  console.log(`[${new Date().toISOString()}] Check-in berhasil tercatat!`);
  res.json({ success: true, message: "Check-in berhasil tercatat.", lastCheckIn });
});

// 2. Endpoint API untuk Cek Status (Berguna untuk pemantauan dari iOS/Watch)
app.get('/api/status', (req, res) => {
  const now = new Date();
  const diffInHours = (now - new Date(lastCheckIn)) / (1000 * 60 * 60);
  res.json({
    lastCheckIn,
    hoursPassed: diffInHours.toFixed(2),
    isMessageSent
  });
});

// Browser check
app.get('/', (req, res) => {
  res.send('Server Dead Man Switch Aktif!');
});

// 3. Fungsi Pengirim Pesan WhatsApp ke 1 Nomor
async function sendFonnteWA(waNumber) {
  try {
    const params = new URLSearchParams();
    params.append('target', waNumber);
    params.append('message', USER_SECRET_MESSAGE);
    params.append('countryCode', '62');

    const response = await axios.post(
      'https://api.fonnte.com/send',
      params,
      {
        headers: {
          'Authorization': FONNTE_TOKEN,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
      }
    );

    console.log(`[WA] Pesan darurat berhasil dikirim ke ${waNumber}:`, response.data);
    return true;
  } catch (error) {
    console.error(`[WA] Gagal mengirim ke ${waNumber}:`, error.response ? error.response.data : error.message);
    return false;
  }
}

// Fungsi Broadcast ke SELURUH Kontak di Array
async function broadcastWhatsAppAlerts() {
  const sendPromises = EMERGENCY_CONTACTS.map(contact => sendFonnteWA(contact.waNumber));
  const results = await Promise.all(sendPromises);
  // Mengembalikan true jika minimal ada 1 nomor yang berhasil terkirim
  return results.some(status => status === true);
}

// 4. Endpoint Khusus Pemicu Cron Job (Dipanggil Vercel Cron / Cron-job.org)
app.get('/api/cron-check', async (req, res) => {
  const now = new Date();
  const diffInHours = (now - new Date(lastCheckIn)) / (1000 * 60 * 60);

  console.log(`[Cron Trigger] Selisih waktu check-in: ${diffInHours.toFixed(2)} jam`);

  if (isMessageSent) {
    return res.json({ 
      status: "skipped", 
      message: "Pesan darurat sudah pernah terkirim sebelumnya.",
      hoursPassed: diffInHours.toFixed(2)
    });
  }

  // Jika selisih waktu sudah melebihi batas (24 jam)
  if (diffInHours >= CHECK_IN_INTERVAL_HOURS) {
    console.log("PERINGATAN: Pengguna tidak check-in melebihi batas waktu! Mengirim WhatsApp ke semua kontak...");
    const success = await broadcastWhatsAppAlerts();
    
    if (success) {
      isMessageSent = true;
      return res.json({ 
        status: "triggered", 
        message: "Pesan WhatsApp darurat BERHASIL dikirim ke seluruh kontak via Fonnte!",
        hoursPassed: diffInHours.toFixed(2)
      });
    } else {
      return res.status(500).json({ 
        status: "error", 
        message: "Gagal menguji/mengirim pesan WA via Fonnte." 
      });
    }
  }

  return res.json({ 
    status: "ok", 
    message: "Status aman, belum melewati batas waktu check-in.",
    hoursPassed: diffInHours.toFixed(2)
  });
});

// Export app khusus untuk deployment Vercel Serverless
module.exports = app;

// Jalankan Server jika di-run secara lokal (bukan di Vercel)
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server Dead Man's Switch berjalan di port ${PORT}`);
  });
}