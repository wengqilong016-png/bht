import { useState, useCallback } from 'react';

export type GpsStatus =
  | 'idle'        // not yet requested
  | 'requesting'  // in-flight geolocation call
  | 'granted'     // coords available
  | 'denied'      // user blocked permission
  | 'timeout'     // request timed out (TIMEOUT error code)
  | 'error';      // other geolocation failure

export interface GpsCoords {
  lat: number;
  lng: number;
}

export interface UseGpsCaptureResult {
  coords: GpsCoords | null;
  status: GpsStatus;
  /** Fire a geolocation request. Safe to call multiple times (retry). */
  request: () => Promise<GpsCoords | null>;
}

/**
 * Manages GPS acquisition with full status tracking.
 *
 * Pass `initialCoords` when restoring from a draft so the hook starts
 * in the 'granted' state instead of 'idle'.
 */
export function useGpsCapture(initialCoords?: GpsCoords | null): UseGpsCaptureResult {
  const [coords, setCoords] = useState<GpsCoords | null>(initialCoords ?? null);
  const [status, setStatus] = useState<GpsStatus>(initialCoords ? 'granted' : 'idle');

  const request = useCallback((): Promise<GpsCoords | null> => {
    if (!navigator.geolocation) {
      setStatus('error');
      return Promise.resolve(null);
    }
    setStatus('requesting');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const nextCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(nextCoords);
          setStatus('granted');
          resolve(nextCoords);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus('denied');
          } else if (err.code === err.TIMEOUT) {
            setStatus('timeout');
          } else {
            setStatus('error');
          }
          resolve(null);
        },
        { timeout: 10000, enableHighAccuracy: true },
      );
    });
  }, []);

  return { coords, status, request };
}
