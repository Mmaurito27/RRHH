require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');

console.log("🚀 Webhook configurado en:", process.env.N8N_WEBHOOK_URL);

const app = express();
app.use(bodyParser.json());

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: false }
});

let sheet;
const initSheet = async () => {
  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = process.env;
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    console.warn('⚠️ Google Sheets no configurado. Se omitirá el registro.');
    return;
  }
  try {
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    });
    await doc.loadInfo();
    sheet = doc.sheetsByIndex[0];
    console.log(`📊 Conectado a Google Sheets: ${doc.title}`);
  } catch (err) {
    console.error('❌ No se pudo inicializar Google Sheets:', err.message);
  }
};

initSheet();

const logInteraction = async (entry) => {
  if (!sheet) return;
  try {
    await sheet.addRow(entry);
    console.log('📝 Interacción registrada en Google Sheets');
  } catch (err) {
    console.error('❌ Error al registrar en Google Sheets:', err.message);
  }
};

// 🧠 Utilidad para asegurar formato correcto del número
const normalizeWid = (numero) => {
  return numero.includes('@') ? numero : `${numero}@c.us`;
};

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Cliente WhatsApp conectado!');
});

const esCV = (mimetype) => {
  return (
    mimetype.includes('pdf') ||
    mimetype.includes('msword') ||
    mimetype.includes('officedocument.wordprocessingml.document')
  );
};

// 🧠 Manejo de mensajes entrantes
client.on('message', async (msg) => {
  try {
    if (!msg.from || typeof msg.from !== 'string' || msg.from.trim() === '') {
      console.error("❌ Número de remitente inválido (msg.from):", msg.from);
      console.log("📦 Dump del mensaje:", JSON.stringify(msg, null, 2));
      return;
    }

    const contact = await msg.getContact();
    const senderName = contact.pushname || contact.name || 'Desconocido';

    const baseData = {
      desde: normalizeWid(msg.from),
      sender: senderName,
      timestamp: msg.timestamp,
    };

    // 📎 Si contiene media
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media && esCV(media.mimetype)) {
        const payload = {
          ...baseData,
          filename: `cv_${senderName}.${media.mimetype.split('/')[1]}`,
          mimetype: media.mimetype,
          data_base64: media.data
        };

        await axios.post(process.env.N8N_WEBHOOK_URL, payload);
        await logInteraction({
          desde: baseData.desde,
          sender: senderName,
          timestamp: new Date(msg.timestamp * 1000).toISOString(),
          tipo: 'cv',
          archivo: payload.filename,
        });
        console.log("📡 Enviando CV a:", process.env.N8N_WEBHOOK_URL);
        console.log(`📎 CV detectado y enviado desde ${senderName}`);
        return;
      }
    }

    // 📝 Si es solo texto
    if (msg.body) {
      const textPayload = {
        ...baseData,
        message: msg.body
      };

      await axios.post(process.env.N8N_WEBHOOK_URL, textPayload);
      await logInteraction({
        desde: baseData.desde,
        sender: senderName,
        timestamp: new Date(msg.timestamp * 1000).toISOString(),
        tipo: 'texto',
        mensaje: msg.body,
      });
      console.log("📡 Enviando texto a:", process.env.N8N_WEBHOOK_URL);
      console.log(`📝 Texto enviado desde ${senderName}: ${msg.body}`);
    }

  } catch (err) {
    console.error('❌ Error al procesar mensaje:', err.message);
    console.log("⚠️ Dump completo:", err);
  }
});

// 📬 Endpoint protegido para enviar mensajes
app.post('/send-message', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.AUTH_TOKEN}`) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const { to, text } = req.body;

  if (!to || typeof to !== 'string' || !to.endsWith('@c.us')) {
    console.error('❌ Número inválido (to):', to);
    return res.status(400).json({ error: 'Número inválido. Debe terminar en @c.us' });
  }

  try {
    await client.sendMessage(to, text);
    console.log(`📩 Mensaje enviado a ${to}: ${text}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al enviar mensaje:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 API escuchando en http://localhost:${process.env.PORT || 3000}`);
});

client.initialize();
