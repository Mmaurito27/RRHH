require('dotenv').config();
// Asegúrate de tener un archivo .env con las variables necesarias
// Variables necesarias:
// N8N_WEBHOOK_URL, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID, AUTH_TOKEN
// Asegúrate de que las variables de entorno estén correctamente configuradas
// y que el archivo .env esté en la raíz del proyecto.
// Este script configura un cliente de WhatsApp Web que escucha mensajes entrantes,
// procesa mensajes de texto y archivos adjuntos (CVs), y los envía a un webhook de n8n.
// También registra las interacciones en una hoja de Google Sheets si está configurada.
// 
// Estructura de los payloads enviados al webhook de n8n:
// Para mensajes de texto:
//   {
//     desde: string,         // número de WhatsApp del remitente (ej: '1234567890@c.us')
//     sender: string,        // nombre del remitente
//     timestamp: string,     // fecha y hora en formato ISO
//     message: string        // contenido del mensaje de texto
//   }
// Para mensajes con CV adjunto:
//   {
//     desde: string,         // número de WhatsApp del remitente
//     sender: string,        // nombre del remitente
//     timestamp: string,     // fecha y hora en formato ISO
//     filename: string,      // nombre sugerido del archivo
//     mimetype: string,      // tipo MIME del archivo
//     data_base64: string    // contenido del archivo en base64
//   }
// Requiere las dependencias necesarias
// npm install whatsapp-web.js qrcode-terminal express body-parser axios google-spreadsheet dotenv

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleSpreadsheet } = require('google-spreadsheet');


console.log("🚀 Webhook configurado en:", process.env.N8N_WEBHOOK_URL);
if (!process.env.N8N_WEBHOOK_URL) {
  console.error('❌ N8N_WEBHOOK_URL no está configurado. Asegúrate de definirlo en tu archivo .env');
  process.exit(1);
}


const app = express();
// Configura el middleware para parsear JSON
app.use(bodyParser.json());


const client = new Client({
  puppeteer: {
    headless: false, // Cambia a false si quieres ver el navegador
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  // Usa LocalAuth para mantener la sesión entre reinicios
  authStrategy: new LocalAuth(),
});
// Configura el cliente de WhatsApp Web
client.on('qr', (qr) => {
  console.log('🔍 Escanea el código QR para iniciar sesión:');
  qrcode.generate(qr, { small: true });
});
// Configura la hoja de Google Sheets si está disponible

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
      timestamp: new Date(msg.timestamp * 1000).toISOString(),
    };

    // Si contiene media, procesar solo media (no duplicar con texto)
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media && esCV(media.mimetype)) {
        const payload = {
          ...baseData,
          filename: `cv_${senderName.replace(/[^a-zA-Z0-9]/g, '_')}.${media.mimetype.split('/')[1]}`,
          mimetype: media.mimetype,
          data_base64: media.data
        };

        await axios.post(process.env.N8N_WEBHOOK_URL, payload);
        await logInteraction({
          desde: baseData.desde,
          sender: senderName,
          timestamp: baseData.timestamp,
          tipo: 'cv',
          mensaje: `Archivo recibido: ${payload.filename}`,
        });
        console.log("📡 Enviando CV a:", process.env.N8N_WEBHOOK_URL);
        console.log(`📎 CV recibido de ${senderName}: ${payload.filename}`);
      } else if (media) {
        // Media recibida pero no es CV
        console.log(`📁 Media recibida de ${senderName} (${media.mimetype}), no es CV. No se envía al webhook.`);
        await logInteraction({
          desde: baseData.desde,
          sender: senderName,
          timestamp: baseData.timestamp,
          tipo: 'media_no_cv',
          mensaje: `Archivo recibido (no CV): ${media.mimetype}`,
        });
      }
    } else if (msg.body) {
      // Solo texto (sin media)
      const textPayload = {
        ...baseData,
        message: msg.body
      };

      await axios.post(process.env.N8N_WEBHOOK_URL, textPayload);
      await logInteraction({
        desde: baseData.desde,
        sender: senderName,
        timestamp: baseData.timestamp,
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
// 🌐 Endpoint para recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  const { body } = req;
  console.log('🔔 Mensaje recibido:', body);

  if (!body || !body.from || !body.body) {
    return res.status(400).json({ error: 'Mensaje inválido' });
  }

  try {
let senderName = 'Desconocido';
let contact = null;
try {
  contact = await client.getContactById(body.from);
  senderName = contact.pushname || contact.name || 'Desconocido';
} catch {
  console.warn(`⚠️ No se pudo obtener contacto para ${body.from}`);
}

    const payload = {
      desde: normalizeWid(body.from),
      sender: senderName,
      timestamp: Math.floor(Date.now() / 1000),
      message: body.body
    };

    await axios.post(process.env.N8N_WEBHOOK_URL, payload);
    await logInteraction({
      desde: payload.desde,
      sender: senderName,
      timestamp: new Date(payload.timestamp * 1000).toISOString(),
      tipo: 'texto',
      mensaje: body.body,
    });

    console.log(`📡 Enviando mensaje a n8n desde ${senderName}: ${body.body}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error al procesar webhook:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 📬 Endpoint protegido para enviar mensajes
app.post('/send-message', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.AUTH_TOKEN}`) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const { to, text } = req.body;
  console.log('🔔 Solicitud de envío de mensaje:', { to, text });

  if (!to || typeof to !== 'string' || to.trim() === '' || to === 'undefined' || !to.endsWith('@c.us')) {
    console.error('❌ Número inválido (to):', to);
    return res.status(400).json({ error: 'Número inválido. Debe terminar en @c.us' });
  }
  const numeroDestino = to;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    console.error('❌ Texto inválido:', text);
    return res.status(400).json({ error: 'Texto inválido. No puede estar vacío.' });
  }

  try {
    const numberId = await client.getNumberId(numeroDestino);
    if (!numberId) {
      console.error(`❌ El número ${numeroDestino} no está registrado en WhatsApp.`);
      return res.status(404).json({ error: `El número ${numeroDestino} no está en WhatsApp o nunca inició chat.` });
    }

    await client.sendMessage(numberId._serialized, text);
    console.log(`📩 Mensaje enviado a ${numeroDestino}: ${text}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Error al enviar mensaje a ${numeroDestino}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get('/status', (req, res) => {
  if (client.info && client.info.pushname) {
    res.json({ status: 'conectado', pushname: client.info.pushname });
  } else {
    res.json({ status: 'desconectado' });
  }
});


app.listen(process.env.PORT || 3000, () => {
  console.log(`🌐 API escuchando en http://localhost:${process.env.PORT || 3000}`);
});

client.initialize();
