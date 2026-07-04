const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3030;
const HTML_PATH = path.join(__dirname, 'index.html');
const LICENSE_PATH = path.join(__dirname, 'license.json');
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnBenXhzep0XfZLfIHakl
IqvMpHBpS+mR2P1JTJxHyTAr3Vxanrl8nk+BsmH6N5XHIaZApsH8WD+b7+dr7aDw
bd90CCPLtH17aUhMP8DcB74UI9XfKoLYmEFBrymnxgNo9MCiaHb2AjcqjIaeCT0D
YGYorUZf4iToaOJ5t3C+A5vLPUGPw0rifaxF+ZLvSZ6C6IieNRjJmbCLn6PzMSU7
XuiumiAjssfFLczfrzk0tzkTqXeMUKmlYc3ZBvQKiCdKjusm7RfM+/MCd8Y4rpYY
VhZlgkcLKSjMSuc2cyIbF5CqdUXSEV8Zs/cMm43Bn1Nno84qdyzQ4bx+JE+lpPiN
/QIDAQAB
-----END PUBLIC KEY-----`;

const BLOCK_PAGE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>License Required</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .card{background:#1a1a1a;border-radius:12px;padding:48px;max-width:480px;text-align:center;border:1px solid #ef4444}
  h1{color:#ef4444;font-size:24px;margin:16px 0}
  p{color:#94a3b8;font-size:14px;line-height:1.6}
  a{display:inline-block;margin-top:20px;padding:10px 24px;background:#3b82f6;color:#fff;border-radius:6px;text-decoration:none;font-weight:600}
  .footer{margin-top:32px;font-size:10px;color:#555;user-select:none}
</style></head><body>
<div class="card">
  <div style="font-size:48px">🔒</div>
  <h1>License Required</h1>
  <p>__REASON__</p>
  <a href="https://github.com/saiedpod-bot" target="_blank">Contact SaiedPod</a>
  <div class="footer">&copy; SaiedPod &mdash; All Rights Reserved</div>
</div></body></html>`;

function verifyLicense() {
  try {
    if (!fs.existsSync(LICENSE_PATH)) {
      return { valid: false, reason: 'License file not found. Place license.json next to server.js.' };
    }
    const raw = fs.readFileSync(LICENSE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const { signature, ...payload } = parsed;

    if (!signature || !payload.subscriber) {
      return { valid: false, reason: 'Invalid license file format.' };
    }

    const verifier = crypto.createVerify('SHA256');
    verifier.update(JSON.stringify(payload));
    verifier.end();

    const valid = verifier.verify(PUBLIC_KEY, signature, 'base64');
    if (!valid) {
      return { valid: false, reason: 'License signature is invalid (tampered file).' };
    }

    if (payload.expiresAt) {
      const expires = new Date(payload.expiresAt).getTime();
      if (Date.now() > expires) {
        const daysOver = Math.ceil((Date.now() - expires) / 86400000);
        return { valid: false, reason: `License expired ${daysOver} day(s) ago. Contact SaiedPod for renewal.` };
      }
    }

    return { valid: true, subscriber: payload.subscriber };
  } catch (e) {
    return { valid: false, reason: 'License check error: ' + e.message };
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/license.json') {
    if (fs.existsSync(LICENSE_PATH)) {
      const data = fs.readFileSync(LICENSE_PATH, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const lic = verifyLicense();
    if (!lic.valid) {
      const html = BLOCK_PAGE.replace('__REASON__', lic.reason || 'Unauthorized.');
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
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
  const lic = verifyLicense();
  if (!lic.valid) {
    console.log(`⚠ License: ${lic.reason}`);
  } else {
    console.log(`✓ License valid for: ${lic.subscriber}`);
  }
});
