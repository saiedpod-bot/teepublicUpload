"use client";

import { useState } from "react";
import { sendLicenseRequest, buildMailToLink, isEmailJSConfigured, OWNER_EMAIL, type LicenseRequest } from "@/lib/licenseRequest";

export default function SubscribePage() {
  const [form, setForm] = useState<LicenseRequest>({
    name: "",
    email: "",
    duration: "30",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [mailToLink, setMailToLink] = useState("");

  const handleChange = (field: keyof LicenseRequest, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setErrorMsg("Name and email are required.");
      return;
    }
    setStatus("sending");
    setErrorMsg("");
    setMailToLink("");

    const result = await sendLicenseRequest(form);
    if (result.ok) {
      setStatus("sent");
    } else if (result.error === "EMAILJS_NOT_CONFIGURED") {
      // Fallback: show mailto link
      setMailToLink(buildMailToLink(form));
      setStatus("sent");
    } else {
      setStatus("error");
      setErrorMsg(result.error || "Failed to send request.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="surface p-8 max-w-lg w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="text-5xl">🔑</div>
          <h1 className="text-2xl font-bold">Request a License</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Fill in your details to request access to TeePublic Uploader.
            The owner will review and send you a license file.
          </p>
        </div>

        {status === "sent" ? (
          <div className="text-center space-y-4">
            <div className="text-4xl">✅</div>
            <h2 className="text-lg font-semibold text-success-500">Request Submitted</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your request has been sent to the owner. You will receive your license file at <strong>{form.email}</strong>.
            </p>
            {mailToLink ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Or send the request manually by clicking the button below:
                </p>
                <a
                  href={mailToLink}
                  className="btn-primary inline-block px-6 py-3"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Email Client
                </a>
              </div>
            ) : null}
            <p className="text-xs text-zinc-600 dark:text-zinc-500 pt-2">
              Once you receive <code className="bg-zinc-800 px-1 rounded">license.json</code>, place it in the app root folder and restart.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Name *</span>
              <input
                className="input w-full"
                placeholder="Your name or company"
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Email *</span>
              <input
                type="email"
                className="input w-full"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">License Duration</span>
              <select
                className="input w-full"
                value={form.duration}
                onChange={(e) => handleChange("duration", e.target.value)}
              >
                <option value="7">7 days (Trial)</option>
                <option value="30">30 days (Monthly)</option>
                <option value="90">90 days (Quarterly)</option>
                <option value="365">365 days (Yearly)</option>
                <option value="0">Perpetual (Lifetime)</option>
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Message (optional)</span>
              <textarea
                className="input w-full min-h-[80px] resize-y"
                placeholder="Any additional notes for the owner..."
                value={form.message}
                onChange={(e) => handleChange("message", e.target.value)}
              />
            </label>

            {status === "error" && (
              <div className="text-sm text-danger-500 bg-danger-500/10 p-3 rounded-lg">{errorMsg}</div>
            )}

            <button
              type="submit"
              className="btn-primary w-full py-3 text-base"
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending..." : "Submit Request"}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className="text-center text-[11px] text-zinc-600 dark:text-zinc-600 pt-2 border-t border-zinc-800">
          © SaiedPod — All Rights Reserved
          <br />
          Owner: {OWNER_EMAIL}
        </div>
      </div>
    </div>
  );
}
