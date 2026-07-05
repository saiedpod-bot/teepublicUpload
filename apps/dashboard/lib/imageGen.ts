export interface GeneratedImage {
  base64: string;
  mime: string;
}

export async function generateDesigns(
  prompt: string,
  count: number = 4,
  signal?: AbortSignal,
): Promise<GeneratedImage[]> {
  const res = await fetch("/api/generate-design", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, count }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `Server error ${res.status}`);
  }

  const data = await res.json();
  return data.images || [];
}
