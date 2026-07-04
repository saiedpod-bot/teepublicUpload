/**
 * Test a license file.
 * Usage: node test-license.js [path/to/license.json]
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnBenXhzep0XfZLfIHakl
IqvMpHBpS+mR2P1JTJxHyTAr3Vxanrl8nk+BsmH6N5XHIaZApsH8WD+b7+dr7aDw
bd90CCPLtH17aUhMP8DcB74UI9XfKoLYmEFBrymnxgNo9MCiaHb2AjcqjIaeCT0D
YGYorUZf4iToaOJ5t3C+A5vLPUGPw0rifaxF+ZLvSZ6C6IieNRjJmbCLn6PzMSU7
XuiumiAjssfFLczfrzk0tzkTqXeMUKmlYc3ZBvQKiCdKjusm7RfM+/MCd8Y4rpYY
VhZlgkcLKSjMSuc2cyIbF5CqdUXSEV8Zs/cMm43Bn1Nno84qdyzQ4bx+JE+lpPiN
/QIDAQAB
-----END PUBLIC KEY-----`;

const licensePath = process.argv[2] || path.join(__dirname, "..", "license.json");
const raw = fs.readFileSync(licensePath, "utf8");
const license = JSON.parse(raw);
const { signature, ...payload } = license;

const verifier = crypto.createVerify("SHA256");
verifier.update(JSON.stringify(payload));
verifier.end();
const valid = verifier.verify(PUBLIC_KEY, signature, "base64");

console.log("=== License Test ===");
console.log("File:", licensePath);
console.log("Signature valid:", valid);
console.log("Subscriber:", payload.subscriber);
console.log("Issued:", payload.issuedAt);
console.log("Expires:", payload.expiresAt || "Never");
console.log("Type:", payload.licenseType);
console.log("Features:", (payload.features || []).join(", "));

if (payload.expiresAt) {
  const daysLeft = Math.ceil((new Date(payload.expiresAt).getTime() - Date.now()) / 86400000);
  console.log("Days left:", daysLeft);
  if (daysLeft <= 0) console.log("⚠ STATUS: EXPIRED");
  else if (daysLeft <= 7) console.log("⚠ STATUS: Expiring soon");
  else console.log("✓ STATUS: Valid");
} else {
  console.log("✓ STATUS: Valid (perpetual)");
}
