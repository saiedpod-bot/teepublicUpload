// License request submission — sends notification to the owner via EmailJS or mailto fallback.
// EmailJS is optional; without it, the user is prompted to email manually.
// To enable EmailJS:
//   1. Sign up at https://www.emailjs.com (free — 200 emails/month)
//   2. Connect an email service (Gmail, Outlook, etc.)
//   3. Create an Email Template with variables: {{name}}, {{email}}, {{duration}}, {{message}}
//   4. Copy your Public Key, Service ID, and Template ID
//   5. Paste them in the app settings or set env vars:
//      NEXT_PUBLIC_EMAILJS_SERVICE_ID
//      NEXT_PUBLIC_EMAILJS_TEMPLATE_ID
//      NEXT_PUBLIC_EMAILJS_PUBLIC_KEY

export interface LicenseRequest {
  name: string;
  email: string;
  duration: string;
  message: string;
}

export const OWNER_EMAIL = "radoune2@gmail.com";

export function getEmailJSConfig() {
  return {
    serviceId: process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID || "",
    templateId: process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID || "",
    publicKey: process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY || "",
  };
}

export function isEmailJSConfigured(): boolean {
  const cfg = getEmailJSConfig();
  return !!(cfg.serviceId && cfg.templateId && cfg.publicKey);
}

export async function sendLicenseRequest(data: LicenseRequest): Promise<{ ok: boolean; error?: string }> {
  const cfg = getEmailJSConfig();

  if (cfg.serviceId && cfg.templateId && cfg.publicKey) {
    // Send via EmailJS
    try {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: cfg.serviceId,
          template_id: cfg.templateId,
          user_id: cfg.publicKey,
          template_params: {
            name: data.name,
            email: data.email,
            duration: data.duration,
            message: data.message,
            owner_email: OWNER_EMAIL,
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "unknown");
        return { ok: false, error: `EmailJS error (${res.status}): ${text}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Network error: ${(e as Error).message}` };
    }
  }

  // Fallback: return mailto link info
  return { ok: false, error: "EMAILJS_NOT_CONFIGURED" };
}

export function buildMailToLink(data: LicenseRequest): string {
  const subject = encodeURIComponent(`License Request: ${data.name}`);
  const body = encodeURIComponent(
    `License Request\n\n` +
    `Name: ${data.name}\n` +
    `Email: ${data.email}\n` +
    `Duration: ${data.duration}\n` +
    `Message: ${data.message || "N/A"}\n\n` +
    `---\nSent from TeePublic Uploader`
  );
  return `mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`;
}
