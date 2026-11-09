const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// =========================================================
// KONFIGURASI PRODUCTION
// =========================================================
// 💡 Kalo mau tes trigger WA langsung: ubah 24 jadi 0
// 💡 Kalo udah selesai tes: balikin lagi jadi 24
const CHECK_IN_INTERVAL_HOURS = 0; 

// Token Fonnte asli
const FONNTE_TOKEN = 'fj9onjYfqNctNtG14Btw'; 

// DAFTAR KONTAK DARURAT
// ⚠️ Pastikan waNumber formatnya 628xxx (bukan nomor pendek/typo)
const EMERGENCY_CONTACTS = [
  { 
    name: 'ipiii', 
    waNumber: '6287778226475', 
    secretMessage: 'Nt sudah sejauh ini berjuang'
  },
  { 
    name: 'Mama', 
    waNumber: '6283898936475', 
    secretMessage: 'Maafin ivi kalo ada salah ya mah,doain ivi terus ya kalo bener bener udah ga ada'
  },
  { 
    name: 'Afifah', 
    waNumber: '628569373797906', 
    secretMessage: 'Maafin gua ya nong,Titip enda ya,jagain enda,doain gua terus ya kalo gua bener bener ga ada'
  },
  { 
    name: 'Syafiq', 
    waNumber: '6285718166617', 
    secretMessage: 'Jagain nda ya fik,maafin gua kalo ada salah,bilangin nda gua sayang bgt sma enda & papah'
  }
];

// FUNGSI TEMPLATE PESAN UTAMA
const getEmergencyMessage = (contact) => {
  return `[PESAN OTOMATIS DARURAT]
${contact.secretMessage}

Halo ${contact.name}, ini adalah pesan terprogram dari sistem yang sudah diprogram. 
Pengguna sistem ini tidak melakukan check-in di waktu yang telah di-set. Mohon segera mengecek keberadaan/kondisi pengguna.`;
}; 

// =========================================================
// STATE SIMPANAN MEMORI
// =========================================================
let lastCheckIn = new Date();
let isMessageSent = false;

// 1. Endpoint API Check-in (iPhone / Apple Watch)
app.post('/api/checkin', (req, res) => {
  lastCheckIn = new Date();
  isMessageSent = false;
  console.log(`[${new Date().toISOString()}] Check-in berhasil tercatat!`);
  res.json({ success: true, message: "Check-in berhasil tercatat.", lastCheckIn });
});

// 2. Endpoint API Status
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

    console.log(`[WA] Berhasil kirim ke ${contact.name} (${contact.waNumber}):`, response.data);
    return { success: true, contact: contact.name, target: contact.waNumber, response: response.data };
  } catch (error) {
    const errorData = error.response ? error.response.data : error.message;
    console.error(`[WA] Gagal kirim ke ${contact.name} (${contact.waNumber}):`, errorData);
    return { success: false, contact: contact.name, target: contact.waNumber, error: errorData };
  }
}

// Broadcast ke seluruh kontak
async function broadcastWhatsAppAlerts() {
  const sendPromises = EMERGENCY_CONTACTS.map(contact => sendFonnteWA(contact));
  return await Promise.all(sendPromises);
}

// =========================================================
// 3. ENDPOINT CRON CHECK (Cek Batas Interval Jam)
// =========================================================
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

  // Jika selisih waktu sudah melebihi CHECK_IN_INTERVAL_HOURS
  if (diffInHours >= CHECK_IN_INTERVAL_HOURS) {
    console.log("PERINGATAN: Melewati batas waktu check-in! Mengirim WA...");
    const results = await broadcastWhatsAppAlerts();
    const hasSuccess = results.some(r => r.success === true);

    if (hasSuccess) {
      isMessageSent = true;
      return res.json({ 
        status: "triggered", 
        message: "Pesan WA darurat BERHASIL dikirim ke seluruh kontak!",
        details: results,
        hoursPassed: diffInHours.toFixed(2)
      });
    } else {
      return res.status(500).json({ 
        status: "error", 
        message: "Gagal mengirim pesan WA via Fonnte.",
        fonnte_details: results,
        hoursPassed: diffInHours.toFixed(2)
      });
    }
  }

  return res.json({ 
    status: "ok", 
    message: "Status aman, belum melewati batas waktu check-in.",
    hoursPassed: diffInHours.toFixed(2)
  });
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server Dead Man's Switch berjalan di port ${PORT}`);
  });
}