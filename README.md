# RRHH WhatsApp Bot

Servicio Node.js para recibir mensajes desde WhatsApp Web y reenviarlos a un workflow de n8n. El flujo en n8n clasifica los mensajes, utiliza OpenAI para generar respuestas y vuelve a enviar la contestación por WhatsApp.

## Requisitos
- Node.js 18+
- n8n en funcionamiento con el workflow importado (`WSP_RRHH (4).json`)
- Archivo `.env` configurado (ver `.env.example`)

## Instalación
```bash
PUPPETEER_SKIP_DOWNLOAD=1 npm install
```

## Uso
1. Copia `.env.example` a `.env` y completa los valores necesarios.
2. Ejecuta el servicio:
```bash
node index.js
```
3. Escaneá el código QR que aparecerá en consola para vincular WhatsApp Web.
4. Asegurate de que n8n tenga un webhook público accesible en `N8N_WEBHOOK_URL`.

## Google Sheets (opcional)
Si proporcionás las variables `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `GOOGLE_SHEET_ID`, cada mensaje o CV recibido se registrará en la hoja especificada.

## Recomendaciones para n8n

El endpoint `/send-message` validará que el campo `to` termine en `@c.us`. Si el número es inválido o está vacío, la API devolverá **400 Bad Request** antes de contactar a WhatsApp.

Para evitar errores, asegurate de armar el JSON del HTTP Request en n8n así:

```json
{
  "to": "{{ $json.to || $json.sessionId }}",
  "text": "{{ $json.text }}"
}
```
