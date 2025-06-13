const express = require('express');
const pdf = require('pdf-parse');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/parse-pdf', async (req, res) => {
  const { base64 } = req.body || {};
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'Missing base64 field' });
  }

  // Remove possible data URI prefix
  const cleanBase64 = base64.replace(/^data:.*;base64,/, '').trim();

  // Basic base64 validation (allow optional whitespace)
  if (!/^[A-Za-z0-9+/=\s]+$/.test(cleanBase64)) {
    return res.status(400).json({ error: 'Invalid base64 data' });
  }

  try {
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ error: 'Empty PDF buffer' });
    }
    // Quick header check to ensure it's a PDF
    if (buffer.slice(0, 4).toString() !== '%PDF') {
      return res.status(400).json({ error: 'Data is not a valid PDF file' });
    }

    const data = await pdf(buffer);
    res.json({ text: data.text });
  } catch (err) {
    console.error('Error parsing PDF:', err.message);
    res.status(400).json({ error: 'Invalid or corrupted PDF file' });
  }
});

app.get('/status', (_, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\uD83D\uDCC4 PDF extractor API on http://localhost:${PORT}`);
});
