// Minimaler Webserver ohne Abhängigkeiten: node server.js
// Öffnet die App unter http://localhost:8080 und zeigt die Adresse fürs Handy im WLAN an.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const START_PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const ALLOWED = new Set(['index.html', 'styles.css', 'data.js', 'app.js', 'sw.js', 'manifest.webmanifest', 'icons/icon.svg']);

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  if (!ALLOWED.has(rel)) { res.writeHead(404); res.end('Nicht gefunden'); return; }
  fs.readFile(path.join(ROOT, rel), (err, data) => {
    if (err) { res.writeHead(404); res.end('Nicht gefunden'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// Windows reserviert manchmal Portbereiche (EACCES). Dann einfach den nächsten Port probieren.
function listen(port, tries = 0) {
  server.once('error', err => {
    if ((err.code === 'EACCES' || err.code === 'EADDRINUSE') && tries < 20) {
      console.log(`  Port ${port} nicht verfügbar, versuche ${port + 1} …`);
      listen(port + 1, tries + 1);
    } else { console.error(err.message); process.exit(1); }
  });
  server.listen(port, '0.0.0.0');
}

server.once('listening', () => {
  server.removeAllListeners('error');
  const port = server.address().port;
  console.log(`\n  CaliTrack läuft auf:  http://localhost:${port}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  Im WLAN (Handy):      http://${n.address}:${port}`);
    }
  }
  console.log('\n  Beenden mit Strg+C\n');
});
listen(START_PORT);
