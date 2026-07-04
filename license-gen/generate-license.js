/**
 * License Generator — creates signed license files.
 *
 * Usage:
 *   node generate-license.js --subscriber "Client Name" --duration 30
 *
 * Options:
 *   --subscriber   Client name / email
 *   --duration     Days (7, 30, 60, 365) or "0" for perpetual
 *   --features     Comma-separated (default: dashboard,extension)
 *   --out          Output file (default: license.json)
 *
 * Output: a signed license.json file that the app validates.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = {};
process.argv.slice(2).forEach((arg, i, arr) => {
  if (arg.startsWith("--")) args[arg.slice(2)] = arr[i + 1];
});

const subscriber = args.subscriber || "test-user";
const durationDays = parseInt(args.duration || "30", 10);
const features = (args.features || "dashboard,extension").split(",").map(s => s.trim());
const outFile = args.out || "license.json";

const privateKeyPath = path.join(__dirname, "keys", "private.pem");
if (!fs.existsSync(privateKeyPath)) {
  console.error("❌ Private key not found. Run generate-keys.js first.");
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, "utf8");

const issuedAt = new Date().toISOString();
const expiresAt = durationDays === 0
  ? null
  : new Date(Date.now() + durationDays * 86400000).toISOString();

const payload = {
  subscriber,
  issuedAt,
  expiresAt,
  features,
  licenseType: durationDays === 0 ? "perpetual" : "trial",
};

const sign = crypto.createSign("SHA256");
sign.update(JSON.stringify(payload));
sign.end();
const signature = sign.sign(privateKey, "base64");

const license = { ...payload, signature };

fs.writeFileSync(outFile, JSON.stringify(license, null, 2));
console.log(`✅ License generated: ${outFile}`);
console.log(`   Subscriber: ${subscriber}`);
console.log(`   Duration:   ${durationDays === 0 ? "Perpetual" : durationDays + " days"}`);
console.log(`   Expires:    ${expiresAt || "Never"}`);
console.log(`   Features:   ${features.join(", ")}`);
