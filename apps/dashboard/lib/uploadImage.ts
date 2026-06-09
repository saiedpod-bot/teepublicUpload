// Prepares a dropped design image entirely in the browser — no Supabase, no
// Vercel — so adding images is instant. The file is read into a data URL that
// is used for previews, embedded in the queue sent to the extension (which
// fetch()es it directly), and stored as-is when the user clicks Import.

const MAX_SEGMENT = 200;

export function safeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, MAX_SEGMENT);
}

export interface UploadedImage {
  filename: string;
  originalName: string;
  url: string; // data: URL — self-contained, works anywhere fetch() does
  mime: string;
  size: number;
}

export async function uploadDesignImage(_sessionId: string, file: File): Promise<UploadedImage> {
  const url = await fileToDataUrl(file);
  return {
    filename: safeSegment(file.name),
    originalName: file.name,
    url,
    mime: file.type || "image/png",
    size: file.size,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
