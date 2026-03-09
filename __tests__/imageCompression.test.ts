import { compressImageBlob } from '../src/utils/imageCompression';

describe('compressImageBlob', () => {
  describe('Guard clauses (Node environment)', () => {
    it('should return non-image blobs unchanged', async () => {
      const pdfBlob = new Blob(['x'.repeat(1000000)], { type: 'application/pdf' });
      const result = await compressImageBlob(pdfBlob);
      expect(result).toBe(pdfBlob);
    });

    it('should return non-image blobs unchanged (text/plain)', async () => {
      const textBlob = new Blob(['x'.repeat(1000000)], { type: 'text/plain' });
      const result = await compressImageBlob(textBlob);
      expect(result).toBe(textBlob);
    });

    it('should return small images unchanged (under 500KB)', async () => {
      // Create a blob smaller than 500KB (500 * 1024 bytes)
      const smallImageBlob = new Blob(['x'.repeat(400 * 1024)], { type: 'image/jpeg' });
      const result = await compressImageBlob(smallImageBlob);
      expect(result).toBe(smallImageBlob);
    });

    it('should return small images unchanged (exactly 499KB)', async () => {
      const smallImageBlob = new Blob(['x'.repeat(499 * 1024)], { type: 'image/jpeg' });
      const result = await compressImageBlob(smallImageBlob);
      expect(result).toBe(smallImageBlob);
    });

    it('should return original blob when blob.type is undefined', async () => {
      const blobWithoutType = new Blob(['x'.repeat(1000000)]);
      const result = await compressImageBlob(blobWithoutType);
      expect(result).toBe(blobWithoutType);
    });

    it('should return original blob when Canvas API is unavailable (Node environment)', async () => {
      // In Node/Jest with testEnvironment: 'node', document and HTMLCanvasElement are undefined
      // This tests the guard: typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined'
      const largeImageBlob = new Blob(['x'.repeat(600 * 1024)], { type: 'image/jpeg' });
      const result = await compressImageBlob(largeImageBlob);
      expect(result).toBe(largeImageBlob);
      expect(typeof document).toBe('undefined');
    });

    it('should accept custom options but still return early in Node environment', async () => {
      const largeImageBlob = new Blob(['x'.repeat(600 * 1024)], { type: 'image/png' });
      const result = await compressImageBlob(largeImageBlob, {
        maxDimension: 800,
        quality: 0.9,
      });
      expect(result).toBe(largeImageBlob);
    });

    it('should handle image/png type', async () => {
      const smallPngBlob = new Blob(['x'.repeat(100 * 1024)], { type: 'image/png' });
      const result = await compressImageBlob(smallPngBlob);
      expect(result).toBe(smallPngBlob);
    });

    it('should handle image/webp type', async () => {
      const smallWebpBlob = new Blob(['x'.repeat(100 * 1024)], { type: 'image/webp' });
      const result = await compressImageBlob(smallWebpBlob);
      expect(result).toBe(smallWebpBlob);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty blob', async () => {
      const emptyBlob = new Blob([], { type: 'image/jpeg' });
      const result = await compressImageBlob(emptyBlob);
      expect(result).toBe(emptyBlob);
    });

    it('should handle blob at exactly 500KB threshold', async () => {
      const thresholdBlob = new Blob(['x'.repeat(500 * 1024)], { type: 'image/jpeg' });
      const result = await compressImageBlob(thresholdBlob);
      // In Node environment, Canvas API is unavailable, so it returns original
      expect(result).toBe(thresholdBlob);
    });

    it('should handle case-sensitive type check', async () => {
      // Type check uses startsWith('image/'), so 'Image/jpeg' should not match
      const wrongCaseBlob = new Blob(['x'.repeat(1000000)], { type: 'Image/jpeg' } as any);
      const result = await compressImageBlob(wrongCaseBlob);
      expect(result).toBe(wrongCaseBlob);
    });
  });
});
