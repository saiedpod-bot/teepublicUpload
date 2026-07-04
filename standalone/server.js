const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3030;
const HTML_PATH = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(HTML_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`TeePublic Uploader running at http://localhost:${PORT}`);
  console.log('Open this URL in Chrome to use the uploader.');
});
