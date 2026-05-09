// Servidor mock para smoke tests en emulador — solo responde /health
// Uso: node health-mock.js
const http = require('http');

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', maintenance: false, timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'mock server — solo /health disponible' }));
  }
});

server.listen(3000, () => {
  console.log('Mock /health server corriendo en http://localhost:3000');
  console.log('Recuerda ejecutar: adb reverse tcp:3000 tcp:3000');
});
