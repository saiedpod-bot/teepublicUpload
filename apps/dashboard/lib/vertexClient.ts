import { createSign, createPrivateKey } from "crypto";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedSa: ServiceAccount | null = null;

function loadSa(): ServiceAccount {
  if (cachedSa) return cachedSa;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) throw new Error("GOOGLE_APPLICATION_CREDENTIALS env var not set");
  const fs = require("fs");
  const raw = fs.readFileSync(path, "utf-8");
  cachedSa = JSON.parse(raw);
  return cachedSa;
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }

  const sa = loadSa();
  const jwtHeader = { alg: "RS256", typ: "JWT" };
  const jwtPayload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const signingInput = b64(jwtHeader) + "." + b64(jwtPayload);
  const key = createPrivateKey(sa.private_key);
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(key, "base64url");

  const jwt = signingInput + "." + signature;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token error ${res.status}: ${text}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };
  return cachedToken.token;
}

export interface GeneratedImage {
  base64: string;
  mime: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title:         { type: "string", description: "TeePublic design title, 30-70 chars, marketable and specific." },
    description:   { type: "string", description: "2-3 sentence TeePublic description, customer-facing, no quotes." },
    primaryTag:    { type: "string", description: "Single most relevant primary tag (1-3 words)." },
    tags:          { type: "array", items: { type: "string" }, description: "Exactly 8 supporting tags, each 1-3 words, no '#'." },
    matureContent: { type: "boolean", description: "true only if the design depicts explicit content." },
  },
  required: ["title", "description", "primaryTag", "tags", "matureContent"],
} as const;

export interface GeneratedListing {
  title: string;
  description: string;
  primaryTag: string;
  tags: string[];
  matureContent: boolean;
}

const LISTING_SYSTEM_INSTRUCTION = [
  "You write TeePublic listings for print-on-demand designs.",
  "Output JSON matching the provided schema. No prose outside JSON.",
  "Be specific to what the image shows: subject, style, audience.",
  "Tags must be lowercase, no leading '#', 1-3 words each, no duplicates of the title's exact words.",
].join(" ");

const GEMINI_VERTEX_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

export async function generateListingViaVertex(
  imageBase64: string,
  imageMime: string,
  prompt: string,
  model?: string,
  signal?: AbortSignal,
): Promise<GeneratedListing> {
  const sa = loadSa();
  const pid = sa.project_id;
  if (!pid) throw new Error("Project ID not found in service account.");
  const token = await getAccessToken();
  const m = model && GEMINI_VERTEX_MODELS.includes(model) ? model : "gemini-2.5-flash-lite";
  const region = "us-central1";

  const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${pid}/locations/${region}/publishers/google/models/${m}:generateContent`;

  const userPrompt = [
    "Create a TeePublic listing for the design in the attached image.",
    `Theme / direction from the user: ${prompt.trim() || "(no extra theme — derive from the image)"}`,
    "Return JSON only.",
  ].join("\n");

  const body = {
    contents: [{
      role: "user",
      parts: [
        { text: userPrompt },
        { inline_data: { mime_type: imageMime, data: imageBase64 } },
      ],
    }],
    system_instruction: { parts: [{ text: LISTING_SYSTEM_INSTRUCTION }] },
    generationConfig: {
      temperature: 0.8,
      response_mime_type: "application/json",
      response_schema: RESPONSE_SCHEMA,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vertex AI listing error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const reason = json?.promptFeedback?.blockReason ?? "no candidate text";
    throw new Error(`Vertex AI returned no listing (${reason}).`);
  }

  let parsed: GeneratedListing;
  try { parsed = JSON.parse(text); } catch {
    throw new Error(`Vertex AI response was not valid JSON: ${text.slice(0, 200)}`);
  }

  return {
    title:         String(parsed.title ?? "").trim(),
    description:   String(parsed.description ?? "").trim(),
    primaryTag:    String(parsed.primaryTag ?? "").trim(),
    tags:          Array.isArray(parsed.tags) ? parsed.tags.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean) : [],
    matureContent: parsed.matureContent === true,
  };
}

export async function generateWithVertex(
  prompt: string,
  projectId?: string,
  count: number = 4,
): Promise<GeneratedImage[]> {
  const sa = loadSa();
  const pid = projectId || sa.project_id;

  if (!pid) throw new Error("Project ID not found. Set projectId or check your service account.");

  const token = await getAccessToken();

  const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${pid}/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict`;

  const body = {
    instances: [
      {
        prompt: `standalone printable graphic, NO t-shirt or clothing mockup, flat vector illustration style, high contrast, edges fill the canvas, transparent background, professional print-ready design: ${prompt}`,
      },
    ],
    parameters: {
      sampleCount: Math.min(count, 8),
      aspectRatio: "3:4", // portrait orientation matches TeePublic's ~1500×1995
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vertex AI error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const predictions = data.predictions || [];
  return predictions.slice(0, count).map((p: any) => ({
    base64: p.bytesBase64Encoded || p.image?.bytesBase64Encoded || "",
    mime: "image/png",
  }));
}
