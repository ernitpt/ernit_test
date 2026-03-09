/**
 * Client-side image compression using Canvas API (web-compatible).
 * Resizes images that exceed max dimensions and re-encodes at target quality.
 */

const MAX_DIMENSION = 1200; // Max width or height in pixels
const TARGET_QUALITY = 0.8; // JPEG quality (0-1)

/**
 * Compress an image blob if it exceeds size/dimension limits.
 * Returns the original blob if compression isn't needed or isn't supported.
 */
export async function compressImageBlob(
  blob: Blob,
  options?: { maxDimension?: number; quality?: number }
): Promise<Blob> {
  const maxDim = options?.maxDimension ?? MAX_DIMENSION;
  const quality = options?.quality ?? TARGET_QUALITY;

  // Only compress image types
  if (!blob.type?.startsWith('image/')) return blob;

  // Skip if already small (under 500KB)
  if (blob.size < 500 * 1024) return blob;

  // Check if Canvas API is available (web only)
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
    return blob;
  }

  try {
    const imageBitmap = await createImageBitmap(blob);
    const { width, height } = imageBitmap;

    // Calculate new dimensions maintaining aspect ratio
    let newWidth = width;
    let newHeight = height;

    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      newWidth = Math.round(width * ratio);
      newHeight = Math.round(height * ratio);
    } else if (blob.size < 2 * 1024 * 1024) {
      // Under 2MB and within dimensions — no compression needed
      imageBitmap.close();
      return blob;
    }

    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      imageBitmap.close();
      return blob;
    }

    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
    imageBitmap.close();

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Canvas compression failed'));
        },
        'image/jpeg',
        quality
      );
    });

    // Only use compressed version if it's actually smaller
    return compressedBlob.size < blob.size ? compressedBlob : blob;
  } catch {
    // Fallback: return original blob if compression fails
    return blob;
  }
}
