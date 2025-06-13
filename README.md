# RRHH WhatsApp Bot

Servicio Node.js para recibir mensajes desde WhatsApp Web y reenviarlos a un workflow de n8n. El flujo en n8n clasifica los mensajes, utiliza OpenAI para generar respuestas y vuelve a enviar la contestación por WhatsApp.
También detecta archivos adjuntos de CV en formato PDF o Word y los reenvía al flujo para su procesamiento.

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
5. Si configurás `INIT_PHONE` en `.env`, el bot enviará un mensaje de bienvenida a ese número cuando la sesión se inicie.

## Google Sheets (opcional)
Si proporcionás las variables `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `GOOGLE_SHEET_ID`, cada mensaje o CV recibido se registrará en la hoja especificada.

## Memoria persistente

El bot guarda un historial de cada conversación en el archivo `memory.json`.
Cada entrada incluye si el mensaje fue entrante o saliente, el contenido y la
marca de tiempo. Esto permite conservar el contexto aunque el proceso se
reinicie.

## Novedades del workflow

El flujo de n8n se amplió para:

1. Detectar CVs adjuntos y responder automáticamente con una confirmación.
2. Generar respuestas personalizadas a cada mensaje usando OpenAI y el contexto previo.
3. Registrar hasta los últimos cinco mensajes en la propiedad `context` para dar más coherencia a las respuestas.
4. Añadir una ruta por defecto si la clasificación falla.

## Recomendaciones para n8n

El endpoint `/send-message` validará que el campo `to` termine en `@c.us`. Si el número es inválido o está vacío, la API devolverá **400 Bad Request** antes de contactar a WhatsApp.

Para evitar errores, asegurate de armar el JSON del HTTP Request en n8n así:

```json
{
  "to": "{{ $json.to || $json.sessionId }}",
  "text": "{{ $json.text }}"
}
```

## Estructura del payload enviado a n8n

El archivo `index.js` envía al webhook un JSON con las siguientes propiedades cuando recibe un mensaje de texto:

```json
{
  "desde": "1234567890@c.us",
  "sender": "Nombre del remitente",
  "timestamp": "2024-05-01T12:00:00.000Z",
  "context": [
    {
      "direction": "incoming",
      "content": "Mensaje previo",
      "timestamp": "2024-05-01T11:59:00.000Z"
    }
  ],
  "message": "Contenido del mensaje"
}
```

Si el mensaje incluye un CV en lugar de `message` se envían `filename`, `mimetype` y `data_base64` con el archivo en base64. En ambos casos se adjunta `context` con los últimos mensajes de la conversación.

## Workflow especializado para CVs

El archivo `wspautoresponse_cv.json` implementa un flujo dedicado exclusivamente a procesar CVs recibidos por WhatsApp. Su funcionamiento es el siguiente:

1. Recibe el mensaje mediante el webhook `whatsapp-in`.
2. Verifica que el adjunto sea un PDF válido. Si no lo es, responde con un mensaje de error.
3. Guarda el archivo en `./files/cv/` con el nombre `<timestamp>_<remitente>.pdf`.
4. Extrae el texto del PDF utilizando `pdf-parse`.
5. Envía dicho texto a OpenAI para generar un resumen con nombre, experiencia, formación, habilidades, idiomas, clasificación y keywords.
6. Devuelve la respuesta al remitente vía `/send-message`.
7. Guarda el resumen generado en un archivo JSON para su posterior revisión.

Este flujo elimina la antigua clasificación de mensajes (PEDIDO/CONSULTA/OTRO) y se centra únicamente en el análisis automático de CVs.
