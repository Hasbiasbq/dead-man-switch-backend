const express = require('express');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
app.use(express.json());

// =========================================================
// KONFIGURASI PRODUCTION
// =========================================================
const CHECK_IN_INTERVAL_HOURS = 24; // Batas waktu check-in (24 jam)

// Masukkan Token Fonnte asli dari dashboard.fonnte.com
const FONNTE_TOKEN = 'bkKX1KrzDY2HMpViKAcT'; 

// Nomor WhatsApp kontak darurat (Gunakan koma jika lebih dari 1, contoh: '62812345678,62898765432')
const EMERGENCY_WA_NUMBER = '6285117356475,6283877622725'; 

// Pesan otomatis yang akan dikirim ke WhatsApp kontak darurat
const USER_SECRET_MESSAGE = `[PESAN OTOMATIS DARURAT]
Halo, ini adalah pesan terprogram dari sistem Dead Man's Switch. 
Pengguna sistem ini tidak melakukan check-in selama lebih dari 24 jam. Mohon segera mengecek keberadaan/kondisi pengguna.`;


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
  const diffInHours = (now - lastCheckIn) / (1000 * 60 * 60);
  res.json({
    lastCheckIn,
    hoursPassed: diffInHours.toFixed(2),
    isMessageSent
  });
});

// 3. Fungsi Pengirim Pesan WhatsApp via Fonnte API
async function sendWhatsAppAlert() {
  try {
    const params = new URLSearchParams();
    params.append('target', EMERGENCY_WA_NUMBER);
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

    console.log("Pesan WhatsApp darurat berhasil dikirim:", response.data);
    isMessageSent = true;
  } catch (error) {
    console.error("Gagal mengirim pesan WhatsApp:", error.response ? error.response.data : error.message);
  }
}

// 4. Cron Job: Pengecekan otomatis setiap jam (pada menit ke-0)
cron.schedule('0 * * * *', async () => {
  if (isMessageSent) return; // Jika pesan sudah terkirim, tidak perlu kirim ulang

  const now = new Date();
  const diffInHours = (now - lastCheckIn) / (1000 * 60 * 60);

  console.log(`[Cron Job] Pengecekan rutin... Selisih waktu check-in terakhir: ${diffInHours.toFixed(2)} jam`);

  // Jika selisih waktu sudah melebihi batas (24 jam)
  if (diffInHours >= CHECK_IN_INTERVAL_HOURS) {
    console.log("PERINGATAN: Pengguna tidak check-in melebihi batas waktu! Mengirim WhatsApp...");
    await sendWhatsAppAlert();
  }
});

// Jalankan Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server Dead Man's Switch berjalan di port ${PORT}`);
});