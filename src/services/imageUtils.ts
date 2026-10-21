/**
 * Image Utilities for JTEC MUSIC
 * Handles resizing, downscaling, and converting album covers to lightweight
 * JPEG data URLs (max 512x512, quality 0.85) for persistent offline storage.
 */

/**
 * Resizes an image source (Blob, File, or image URL) to at most maxDim x maxDim
 * and converts it to a JPEG data URL.
 */
export async function resizeImageToJpegDataUrl(
  source: Blob | string,
  maxDim = 512,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    let objectUrlToRevoke: string | null = null;
    let srcUrl = '';

    if (typeof source === 'string') {
      srcUrl = source;
    } else {
      objectUrlToRevoke = URL.createObjectURL(source);
      srcUrl = objectUrlToRevoke;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const cleanup = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
    };

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width || 300;
        let height = img.naturalHeight || img.height || 300;

        // Shrink to at most maxDim x maxDim while preserving aspect ratio
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        width = Math.max(1, width);
        height = Math.max(1, height);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Failed to get 2D canvas context'));
          return;
        }

        // Fill background with dark tone for transparent PNGs
        ctx.fillStyle = '#060810';
        ctx.fillRect(0, 0, width, height);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    img.onerror = (err) => {
      cleanup();
      reject(err);
    };

    img.src = srcUrl;
  });
}

/**
 * Downloads a remote cover image (HTTP/HTTPS URL), shrinks it to at most maxDim x maxDim,
 * and converts it to a JPEG data URL.
 */
export async function downloadAndConvertCover(
  imageUrl: string,
  maxDim = 512,
  quality = 0.85
): Promise<string> {
  if (!imageUrl) {
    throw new Error('Image URL is empty');
  }

  // If already a persistent data URL, resize if needed or return
  if (imageUrl.startsWith('data:image/jpeg') || imageUrl.startsWith('data:image/png')) {
    try {
      return await resizeImageToJpegDataUrl(imageUrl, maxDim, quality);
    } catch {
      return imageUrl;
    }
  }

  // 1. First attempt: fetch binary blob with a 10s timeout
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const blob = await res.blob();
      if (blob && blob.size > 0) {
        return await resizeImageToJpegDataUrl(blob, maxDim, quality);
      }
    }
  } catch {
    // Fetch failed (network or CORS), fall through to Image element drawing
  }

  // 2. Second attempt: load directly via Image element with crossOrigin
  return resizeImageToJpegDataUrl(imageUrl, maxDim, quality);
}
