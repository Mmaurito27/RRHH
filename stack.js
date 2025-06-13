const concurrently = require('concurrently');

const { result } = concurrently([
  { command: 'node index.js', name: 'bot' },
  { command: 'node pdf-parser-api/pdf-api.js', name: 'pdf' },
  { command: 'n8n start', name: 'n8n' }
]);

result
  .then(() => {
    console.log('All services exited');
    process.exit(0);
  })
  .catch(() => process.exit(1));
