/**
 * Generate RSA key pair for signing licenses.
 * Run once: node generate-keys.js
 * Keep private.pem secret — it is used to sign license files.
 * public.pem is embedded in the app to verify licenses.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const keysDir = path.join(__dirname, "keys");

if (!fs.existsSync(keysDir)) fs.mkdirSync(keysDir, { recursive: true });

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

fs.writeFileSync(path.join(keysDir, "public.pem"), publicKey);
fs.writeFileSync(path.join(keysDir, "private.pem"), privateKey);

console.log("✅ RSA key pair generated:");
console.log(`   Private: license-gen/keys/private.pem  (KEEP SECRET)`);
console.log(`   Public:  license-gen/keys/public.pem   (embed in app)`);
