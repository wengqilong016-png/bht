/**
 * EXIF GPS extraction and location estimation utilities.
 *
 * Extracted from offlineQueue.ts to keep the queue module focused on
 * IndexedDB / sync concerns and avoid circular dependency risks.
 */

// ── Extract GPS from EXIF metadata of a base64 image ─────────────────────────
export function extractGpsFromExif(
  imageDataUrl: string
): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!imageDataUrl || !imageDataUrl.startsWith('data:image')) {
      resolve(null);
      return;
    }
    try {
      // Convert data URL to ArrayBuffer for EXIF parsing
      const base64 = imageDataUrl.split(',')[1];
      if (!base64) { resolve(null); return; }
      const binary  = atob(base64);
      const bytes   = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // Use EXIF.js via img element (most compatible approach)
      const img = new Image();
      img.onload = () => {
        try {
          // Resolve EXIF once to avoid repeated (window as any) casts.
          // Depends on global window.EXIF (exif-js loaded via <script> tag in index.html).
          // Gracefully returns null if the library is unavailable (ad-blockers, slow networks).
          const EXIFLib = (window as any).EXIF;
          if (!EXIFLib) { resolve(null); return; }
          EXIFLib.getData(img, function(this: HTMLImageElement) {
            const lat    = EXIFLib.getTag(this, 'GPSLatitude');
            const latRef = EXIFLib.getTag(this, 'GPSLatitudeRef');
            const lng    = EXIFLib.getTag(this, 'GPSLongitude');
            const lngRef = EXIFLib.getTag(this, 'GPSLongitudeRef');

            if (lat && lng) {
              const toDecimal = (dms: number[]) =>
                dms[0] + dms[1] / 60 + dms[2] / 3600;
              const latDec = toDecimal(lat) * (latRef === 'S' ? -1 : 1);
              const lngDec = toDecimal(lng) * (lngRef === 'W' ? -1 : 1);
              if (isFinite(latDec) && isFinite(lngDec) && (latDec !== 0 || lngDec !== 0)) {
                resolve({ lat: latDec, lng: lngDec });
                return;
              }
            }
            resolve(null);
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageDataUrl;
    } catch {
      resolve(null);
    }
  });
}

// ── Estimate location from last known GPS (dead-reckoning fallback) ───────────
export function estimateLocationFromContext(
  lastKnownGps: { lat: number; lng: number } | null,
  locationCoords: { lat: number; lng: number } | null
): { lat: number; lng: number; isEstimated: boolean } | null {
  // Prefer machine's registered coordinates (most accurate for "at site")
  if (locationCoords && locationCoords.lat !== 0) {
    return { ...locationCoords, isEstimated: true };
  }
  // Fall back to last known GPS
  if (lastKnownGps) {
    return { ...lastKnownGps, isEstimated: true };
  }
  return null;
}
