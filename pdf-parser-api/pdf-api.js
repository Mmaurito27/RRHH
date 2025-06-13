const express = require('express');
const pdf = require('pdf-parse');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/parse-pdf', async (req, res) => {
  const { base64 } = req.body || {};
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'Missing base64' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const data = await pdf(buffer);
    res.json({ text: data.text });
  } catch (err) {
    console.error('Error parsing PDF:', err.message);
    res.status(500).json({ error: 'Failed to parse PDF' });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\uD83D\uDCC4 PDF extractor API on http://localhost:${PORT}`);
});
