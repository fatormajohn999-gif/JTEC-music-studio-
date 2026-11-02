/**
 * Profile Photo Processor for JTEC Party
 * Decodes photo using createImageBitmap, crops centered square, scales to 256x256 canvas,
 * and compresses to JPEG under 40 KB. Never stores original image.
 */

export async function processProfilePhoto(file: File): Promise<string> {
  let bitmap: ImageBitmap;

  try {
    // Respect EXIF orientation
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Fallback if browser/platform does not support options in createImageBitmap
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image file.'));
        img.src = url;
      });
      bitmap = await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const sSize = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - sSize) / 2;
  const sy = (bitmap.height - sSize) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas context not available');
  }

  // Draw largest centered square to 256x256
  ctx.drawImage(bitmap, sx, sy, sSize, sSize, 0, 0, 256, 256);

  // Approximate byte calculation for data URL: (base64.length * 3 / 4)
  const getByteSize = (dataUrl: string): number => {
    const base64 = dataUrl.split(',')[1] || '';
    return Math.round((base64.length * 3) / 4);
  };

  const MAX_BYTES = 40 * 1024; // 40 KB
  let quality = 0.85;
  let resultDataUrl = canvas.toDataURL('image/jpeg', quality);

  while (getByteSize(resultDataUrl) > MAX_BYTES && quality > 0.15) {
    quality -= 0.08;
    resultDataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  return resultDataUrl;
}
