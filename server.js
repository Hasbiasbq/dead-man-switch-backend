const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// =========================================================
// KONFIGURASI PRODUCTION
// =========================================================
const FONNTE_TOKEN = 'fj9onjYfqNctNtG14Btw'; 

// DAFTAR KONTAK DARURAT
const EMERGENCY_CONTACTS = [
  { 
    name: 'ipiii', 
    waNumber: '6285117356475', 
    secretMessage: 'Nt sudah sejauh ini berjuang'
  },
  { 
    name: 'Mama', 
    waNumber: '6283877622725', 
    secretMessage: 'Maafin ivi kalo ada salah ya mah,doain ivi terus ya kalo bener bener udah ga ada'
  },
  { 
    name: 'Afifah', 
    waNumber: '6285693797906', 
    secretMessage: 'Maafin gua ya nong,Titip enda ya,jagain enda,doain gua terus ya kalo gua bener bener ga ada'
  },
  { 
    name: 'Syafiq', 
    waNumber: '6285718166617', 
    secretMessage: 'Jagain nda ya fik,maafin gua kalo ada salah,bilangin nda gua sayang bgt sma enda & papah'
  }
];

// FUNGSI TEMPLATE PESAN UTAMA (Personalisasi Nama + Secret Message)
const getEmergencyMessage = (contact) => {
  return `[PESAN OTOMATIS DARURAT]
${contact.secretMessage}

Halo, ini adalah pesan terprogram dari sistem yang sudah diprogram. 
Pengguna sistem ini tidak melakukan check-in di waktu yang telah di-set. Mohon segera mengecek keberadaan dan kondisinya.`;
}; 

// =========================================================
// STATE SIMPANAN MEMORI
// =========================================================
let lastCheckIn = new Date();
let isMessageSent = false;

// 1. Endpoint API Check-in (Dipanggil dari iPhone / Apple Watch)
app.post('/api/checkin', (req, res) => {
  lastCheckIn = new Date();
  isMessageSent = false; // Reset status pengiriman saat check-in baru
  console.log(`[${new Date().toISOString()}] Check-in berhasil tercatat!`);
  res.json({ success: true, message: "Check-in berhasil tercatat.", lastCheckIn });
});

// 2. Endpoint API Status (Pemantauan sistem)
app.get('/api/status', (req, res) => {
  const now = new Date();
  const diffInHours = (now - new Date(lastCheckIn)) / (1000 * 60 * 60);
  res.json({
    lastCheckIn,
    hoursPassed: diffInHours.toFixed(2),
    isMessageSent
  });
});

app.get('/', (req, res) => {
  res.send('Server Dead Man Switch Aktif!');
});

// =========================================================
// FUNGSI PENGIRIMAN FONNTE WA PER KONTAK
// =========================================================
async function sendFonnteWA(contact) {
  try {
    const fullMessage = getEmergencyMessage(contact);

    const params = new URLSearchParams();
    params.append('target', contact.waNumber);
    params.append('message', fullMessage);
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

    console.log(`[WA] Pesan darurat berhasil dikirim ke ${contact.name} (${contact.waNumber}):`, response.data);
    return { success: true, contact: contact.name, target: contact.waNumber, response: response.data };
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error(`[WA] Gagal mengirim ke ${contact.name} (${contact.waNumber}):`, errorData);
    return { success: false, contact: contact.name, target: contact.waNumber, error: errorData };
  }
}

// Broadcast ke SELURUH Kontak di Array
async function broadcastWhatsAppAlerts() {
  const sendPromises = EMERGENCY_CONTACTS.map(contact => sendFonnteWA(contact));
  return await Promise.all(sendPromises);
}

// =========================================================
// 3. ENDPOINT CRON CHECK (Otomatis Pengecekan Hari Ini / 22:30 WIB)
// =========================================================
app.get('/api/cron-check', async (req, res) => {
  const now = new Date();
  
  // Ambil tanggal WIB (UTC+7)
  const wibOffset = 7 * 60 * 60 * 1000;
  const todayWIB = new Date(now.getTime() + wibOffset).toISOString().split('T')[0];
  const lastCheckInWIB = new Date(new Date(lastCheckIn).getTime() + wibOffset).toISOString().split('T')[0];

  const hasCheckedInToday = (todayWIB === lastCheckInWIB);

  if (isMessageSent) {
    return res.json({ 
      status: "skipped", 
      message: "Pesan darurat hari ini sudah pernah terkirim sebelumnya.",
      hasCheckedInToday
    });
  }

  // Jika belum check-in hari ini saat cron jam 22:30 WIB tersentuh:
  if (!hasCheckedInToday) {
    console.log("PERINGATAN: Belum check-in hari ini jam 22:30 WIB! Mengirim WA...");
    const results = await broadcastWhatsAppAlerts();
    const hasSuccess = results.some(r => r.success === true);

    if (hasSuccess) {
      isMessageSent = true;
      return res.json({ 
        status: "triggered", 
        message: "Pesan WA darurat BERHASIL dikirim ke seluruh kontak!",
        details: results
      });
    } else {
      return res.status(500).json({ 
        status: "error", 
        message: "Gagal mengirim pesan WA via Fonnte.",
        fonnte_details: results
      });
    }
  }

  return res.json({ 
    status: "ok", 
    message: "Status aman, kamu sudah check-in hari ini.",
    hasCheckedInToday: true
  });
});

// =========================================================
// 4. ENDPOINT TEST TRIGGER MANUAL (Kapan saja via browser)
// =========================================================
app.get('/api/test-trigger', async (req, res) => {
  console.log("[TEST TRIGGER] Menjalankan tes pengiriman WA manual...");

  const results = await broadcastWhatsAppAlerts();
  const hasSuccess = results.some(r => r.success === true);

  if (hasSuccess) {
    return res.json({
      status: "test_success",
      message: "Uji coba pengiriman WA darurat BERHASIL ke kontak!",
      details: results
    });
  } else {
    return res.status(500).json({
      status: "test_failed",
      message: "Uji coba pengiriman WA GAGAL.",
      fonnte_details: results
    });
  }
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