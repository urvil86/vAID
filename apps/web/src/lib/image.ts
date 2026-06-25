/**
 * Read an uploaded file into a compact data URL, downscaling images so the
 * result is small enough to store inline with the document record (no external
 * blob storage needed for the pilot). For non-images (PDF), returns the raw
 * data URL unchanged.
 *
 * For production scale, swap this for Vercel Blob / S3 and store a URL instead.
 */
export async function fileToCompactDataUrl(
  file: File,
  maxDim = 1400,
  quality = 0.7
): Promise<string> {
  const readAsDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const original = await readAsDataUrl(file);
  if (!file.type.startsWith('image/')) return original;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = original;
  });

  let { width, height } = img;
  if (Math.max(width, height) > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}
