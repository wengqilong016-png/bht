import { useCallback, useEffect, useRef, useState } from 'react';

import { getScanMeterErrorMessage, scanMeterFromBase64 } from '../../../services/scanMeterService';
import { Transaction } from '../../../types';

export type ScanResult = {
  status: 'loading' | 'matched' | 'mismatch' | 'unclear' | 'error';
  detectedScore?: string;
  notes?: string;
};

async function convertImageUrlToBase64(url: string): Promise<string> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Image fetch failed with status ${resp.status}`);
  }

  const blob = await resp.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      if (!result) {
        reject(new Error('Image conversion produced empty base64 data'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Image conversion failed'));
    reader.readAsDataURL(blob);
  });
}

function deriveScanResult(
  tx: Transaction,
  result: Extract<Awaited<ReturnType<typeof scanMeterFromBase64>>, { success: true }>,
): ScanResult {
  const detectedScore = result.data.score ?? '';
  const submittedScore = String(tx.currentScore ?? '');
  const diff = Math.abs(parseInt(detectedScore || '0', 10) - parseInt(submittedScore || '0', 10));
  const status = detectedScore === '' || result.data.condition === 'Unclear'
    ? 'unclear'
    : diff <= 5 ? 'matched' : 'mismatch';

  return { status, detectedScore, notes: result.data.notes };
}

export function useAnomalyScanResults(
  isAdmin: boolean,
  anomalyTransactions: Transaction[],
  lang: 'zh' | 'sw',
) {
  const [scanResults, setScanResults] = useState<Map<string, ScanResult>>(new Map());
  const startedScanIdsRef = useRef<Set<string>>(new Set());

  const triggerAIScan = useCallback(async (tx: Transaction) => {
    if (!tx.photoUrl || startedScanIdsRef.current.has(tx.id)) return;
    startedScanIdsRef.current.add(tx.id);
    setScanResults(prev => new Map(prev).set(tx.id, { status: 'loading' }));
    try {
      const base64 = await convertImageUrlToBase64(tx.photoUrl);

      const result = await scanMeterFromBase64(base64);
      if (result.success) {
        setScanResults(prev => new Map(prev).set(tx.id, deriveScanResult(tx, result)));
        return;
      }

      const failure = result as Extract<Awaited<ReturnType<typeof scanMeterFromBase64>>, { success: false }>;
      setScanResults(prev => new Map(prev).set(tx.id, {
        status: 'error',
        notes: getScanMeterErrorMessage(failure.code, lang),
      }));
    } catch (error) {
      console.warn('AI scan failed for transaction', tx.id, error);
      setScanResults(prev => new Map(prev).set(tx.id, {
        status: 'error',
        notes: getScanMeterErrorMessage('NETWORK_ERROR', lang),
      }));
    }
  }, [lang]);

  useEffect(() => {
    if (!isAdmin) return;
    for (const tx of anomalyTransactions) {
      triggerAIScan(tx);
    }
  }, [anomalyTransactions, isAdmin, triggerAIScan]);

  return scanResults;
}
