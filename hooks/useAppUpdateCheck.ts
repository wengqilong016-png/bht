import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

export interface VersionInfo {
  version: string;
  apkUrl: string;
  releaseNotes?: string;
}

export interface UpdateStatus {
  hasUpdate: boolean;
  latestVersion: string;
  apkUrl: string;
  releaseNotes: string;
}

function getUpdateManifestUrl(): string {
  // In the Android APK we run at `https://localhost` and `/version.json` points to the bundled asset,
  // which will always match the currently-installed version. For native builds we must read a remote
  // manifest (served by Vercel) to detect updates.
  if (Capacitor.isNativePlatform()) {
    const configured =
      typeof __UPDATE_MANIFEST_URL__ !== 'undefined' ? (__UPDATE_MANIFEST_URL__ || '') : '';
    return configured || 'https://b-ht.vercel.app/version.json';
  }
  return '/version.json';
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useAppUpdateCheck(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
    const manifestUrl = getUpdateManifestUrl();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Add a cache-buster as extra protection against stale edge caches.
    fetch(`${manifestUrl}?t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' })
      .then(r => r.json() as Promise<VersionInfo>)
      .then(data => {
        clearTimeout(timeout);
        if (compareVersions(currentVersion, data.version) > 0) {
          setStatus({
            hasUpdate: true,
            latestVersion: data.version,
            apkUrl: data.apkUrl,
            releaseNotes: data.releaseNotes ?? '',
          });
        }
      })
      .catch(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return status;
}
