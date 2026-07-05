/** Simple background removal using canvas — makes near-white/edge-color pixels transparent. */
export function removeBackgroundFromBase64(base64: string, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Sample corner colors to determine background
      const corners = [
        getPixel(data, 0, 0, canvas.width),
        getPixel(data, canvas.width - 1, 0, canvas.width),
        getPixel(data, 0, canvas.height - 1, canvas.width),
        getPixel(data, canvas.width - 1, canvas.height - 1, canvas.width),
      ];
      const bgColor = averageColor(corners);

      // If background is already transparent (alpha = 0 in corners), skip
      if (corners.every((c) => c.a < 10)) {
        resolve(`data:${mime};base64,${base64}`);
        img.remove();
        return;
      }

      // Make pixels close to bgColor transparent with edge tolerance
      const tolerance = 60;
      for (let i = 0; i < data.length; i += 4) {
        const dist = colorDistance(
          { r: data[i], g: data[i + 1], b: data[i + 2] },
          bgColor,
        );
        if (dist < tolerance) {
          data[i + 3] = 0; // fully transparent
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
      img.remove();
    };
    img.onerror = () => reject(new Error("Failed to load image for background removal"));
    img.src = `data:${mime};base64,${base64}`;
  });
}

interface Rgb { r: number; g: number; b: number; a?: number; }

function getPixel(data: Uint8ClampedArray, x: number, y: number, w: number): Rgb {
  const i = (y * w + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function averageColor(colors: Rgb[]): Rgb {
  const len = colors.length;
  return {
    r: Math.round(colors.reduce((s, c) => s + c.r, 0) / len),
    g: Math.round(colors.reduce((s, c) => s + c.g, 0) / len),
    b: Math.round(colors.reduce((s, c) => s + c.b, 0) / len),
  };
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}
