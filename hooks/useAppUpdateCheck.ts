import { useEffect, useState } from 'react';

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    fetch('/version.json', { signal: controller.signal, cache: 'no-store' })
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
