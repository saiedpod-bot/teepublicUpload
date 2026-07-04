// License validation module (browser-compatible using Web Crypto API).
// Verifies a signed license.json file using the embedded RSA public key.
// Checks expiry date — blocks the app if the license is invalid or expired.

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnBenXhzep0XfZLfIHakl
IqvMpHBpS+mR2P1JTJxHyTAr3Vxanrl8nk+BsmH6N5XHIaZApsH8WD+b7+dr7aDw
bd90CCPLtH17aUhMP8DcB74UI9XfKoLYmEFBrymnxgNo9MCiaHb2AjcqjIaeCT0D
YGYorUZf4iToaOJ5t3C+A5vLPUGPw0rifaxF+ZLvSZ6C6IieNRjJmbCLn6PzMSU7
XuiumiAjssfFLczfrzk0tzkTqXeMUKmlYc3ZBvQKiCdKjusm7RfM+/MCd8Y4rpYY
VhZlgkcLKSjMSuc2cyIbF5CqdUXSEV8Zs/cMm43Bn1Nno84qdyzQ4bx+JE+lpPiN
/QIDAQAB
-----END PUBLIC KEY-----`;

export interface LicenseInfo {
  subscriber: string;
  issuedAt: string;
  expiresAt: string | null;
  features: string[];
  licenseType: string;
}

export interface LicenseStatus {
  valid: boolean;
  reason?: string;
  info?: LicenseInfo;
  daysLeft?: number;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

async function importPublicKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    pemToArrayBuffer(PUBLIC_KEY_PEM),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

export async function verifyLicense(json: string): Promise<LicenseStatus> {
  try {
    let parsed: any;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { valid: false, reason: "License file is not valid JSON." };
    }

    const { signature, ...payload } = parsed;
    if (!signature || typeof signature !== "string") {
      return { valid: false, reason: "License file is missing signature." };
    }
    if (!payload.subscriber) {
      return { valid: false, reason: "License file is missing subscriber." };
    }

    // Import public key and verify signature
    let publicKey: CryptoKey;
    try {
      publicKey = await importPublicKey();
    } catch {
      return { valid: false, reason: "Failed to load verification key." };
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));

    let valid: boolean;
    try {
      const sigBuf = Uint8Array.from(atob(signature), c => c.charCodeAt(0)).buffer;
      valid = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        publicKey,
        sigBuf,
        data
      );
    } catch {
      return { valid: false, reason: "Signature verification failed (corrupted file)." };
    }

    if (!valid) {
      return { valid: false, reason: "License signature is invalid (tampered file)." };
    }

    const info: LicenseInfo = {
      subscriber: payload.subscriber,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      features: payload.features || [],
      licenseType: payload.licenseType || "trial",
    };

    // Check expiry
    if (info.expiresAt) {
      const expires = new Date(info.expiresAt).getTime();
      const now = Date.now();
      if (now > expires) {
        const daysOver = Math.ceil((now - expires) / 86400000);
        return {
          valid: false,
          reason: `License expired ${daysOver} day(s) ago. Contact SaiedPod for renewal.`,
          info,
          daysLeft: 0,
        };
      }
      const daysLeft = Math.ceil((expires - now) / 86400000);
      return { valid: true, info, daysLeft };
    }

    return { valid: true, info, daysLeft: Infinity };
  } catch (e) {
    return { valid: false, reason: `License check error: ${(e as Error).message}` };
  }
}

export function checkFeatureAccess(feature: string, licenseInfo: LicenseInfo): boolean {
  return licenseInfo.features.includes(feature) || licenseInfo.features.includes("*");
}
