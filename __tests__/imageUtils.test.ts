/**
 * __tests__/imageUtils.test.ts
 *
 * Tests for utils/imageUtils.ts and driver/utils/imageOptimization.ts
 */
import { describe, it, expect } from '@jest/globals';
import { getOptimizedImageUrl } from '../utils/imageUtils';
import {
  compressCanvasImage,
  getOptimalVideoConstraints,
  getOptimalScanInterval,
  getOptimalAIImageSize,
  getOptimalEvidenceWidth,
  clearCanvasMemory,
  getMinimumAICallInterval,
} from '../driver/utils/imageOptimization';

// ── getOptimizedImageUrl ──────────────────────────────────────────────────────

describe('getOptimizedImageUrl()', () => {
  it('returns empty string for empty URL', () => {
    expect(getOptimizedImageUrl('')).toBe('');
  });

  it('returns the original URL when it is not a Supabase storage URL', () => {
    const url = 'https://cdn.example.com/images/photo.jpg';
    expect(getOptimizedImageUrl(url)).toBe(url);
  });

  it('transforms a Supabase public storage URL to render URL', () => {
    const url = 'https://abc123.supabase.co/storage/v1/object/public/photos/image.jpg';
    const result = getOptimizedImageUrl(url, 200, 300, 80);
    expect(result).toBe(
      'https://abc123.supabase.co/storage/v1/render/image/public/photos/image.jpg?width=200&height=300&quality=80',
    );
  });

  it('uses default width, height, quality when not specified', () => {
    const url = 'https://abc123.supabase.co/storage/v1/object/public/photos/img.jpg';
    const result = getOptimizedImageUrl(url);
    expect(result).toContain('width=400');
    expect(result).toContain('height=400');
    expect(result).toContain('quality=70');
  });

  it('preserves the bucket-and-path segment after transformation', () => {
    const url = 'https://project.supabase.co/storage/v1/object/public/bucket/folder/file.png';
    const result = getOptimizedImageUrl(url, 100, 100, 50);
    expect(result).toContain('/render/image/public/bucket/folder/file.png');
  });
});

// ── imageOptimization (driver/utils) ─────────────────────────────────────────

describe('compressCanvasImage()', () => {
  function makeCanvas(width = 100, height = 100): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // jsdom doesn't implement canvas — mock toDataURL
    (canvas as any).toDataURL = jest.fn().mockReturnValue('data:image/jpeg;base64,mock');
    return canvas;
  }

  it('uses lower quality (0.6) for low-performance devices', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, true);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.6);
  });

  it('uses higher quality (0.7) for high-performance devices', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, false);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7);
  });

  it('respects explicit quality override', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, true, { quality: 0.9 });
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9);
  });

  it('respects explicit format override', () => {
    const canvas = makeCanvas();
    compressCanvasImage(canvas, false, { targetFormat: 'image/webp' });
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.7);
  });

  it('returns the data URL string', () => {
    const canvas = makeCanvas();
    const result = compressCanvasImage(canvas, false);
    expect(result).toBe('data:image/jpeg;base64,mock');
  });
});

describe('getOptimalVideoConstraints()', () => {
  it('returns low-res constraints for low-performance devices', () => {
    const constraints = getOptimalVideoConstraints(true);
    expect((constraints as any).width.ideal).toBe(640);
    expect((constraints as any).height.ideal).toBe(480);
    expect(constraints.facingMode).toBe('environment');
  });

  it('returns high-res constraints for high-performance devices', () => {
    const constraints = getOptimalVideoConstraints(false);
    expect((constraints as any).width.ideal).toBe(1280);
    expect((constraints as any).height.ideal).toBe(720);
  });
});

describe('getOptimalScanInterval()', () => {
  it('returns 3500ms for low-performance', () => {
    expect(getOptimalScanInterval(true)).toBe(3500);
  });

  it('returns 2500ms for high-performance', () => {
    expect(getOptimalScanInterval(false)).toBe(2500);
  });
});

describe('getOptimalAIImageSize()', () => {
  it('returns 384 for low-performance', () => {
    expect(getOptimalAIImageSize(true)).toBe(384);
  });

  it('returns 512 for high-performance', () => {
    expect(getOptimalAIImageSize(false)).toBe(512);
  });
});

describe('getOptimalEvidenceWidth()', () => {
  it('returns 480 for low-performance', () => {
    expect(getOptimalEvidenceWidth(true)).toBe(480);
  });

  it('returns 640 for high-performance', () => {
    expect(getOptimalEvidenceWidth(false)).toBe(640);
  });
});

describe('clearCanvasMemory()', () => {
  it('calls clearRect on the canvas context', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 150;
    // jsdom doesn't implement canvas — mock getContext
    const mockClearRect = jest.fn();
    (canvas as any).getContext = jest.fn().mockReturnValue({ clearRect: mockClearRect });
    clearCanvasMemory(canvas);
    expect(mockClearRect).toHaveBeenCalledWith(0, 0, 200, 150);
  });

  it('does not throw when context is null', () => {
    const canvas = document.createElement('canvas');
    // getContext returns null in jsdom by default
    expect(() => clearCanvasMemory(canvas)).not.toThrow();
  });
});

describe('getMinimumAICallInterval()', () => {
  it('returns 3000ms for low-performance', () => {
    expect(getMinimumAICallInterval(true)).toBe(3000);
  });

  it('returns 2000ms for high-performance', () => {
    expect(getMinimumAICallInterval(false)).toBe(2000);
  });
});
