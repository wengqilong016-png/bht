import { useEffect, useMemo, useRef, useState } from 'react';

import {
  calculateCollectionFinanceLocal,
  calculateCollectionFinancePreview,
  type CollectionFinanceInput,
  type FinanceCalculationResult,
} from '../../services/financeCalculator';

import type { Location } from '../../types';

interface UseCollectionFinancePreviewInput {
  selectedLocation: Location | null | undefined;
  currentScore: string;
  expenses: string;
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  startupDebtDeduction: string;
  initialFloat: number;
}

const EMPTY_FINANCE_INPUT: CollectionFinanceInput = {
  selectedLocation: null,
  currentScore: '',
  expenses: '',
  coinExchange: '',
  ownerRetention: '',
  isOwnerRetaining: false,
  tip: '',
  startupDebtDeduction: '',
  initialFloat: 0,
};

export function useCollectionFinancePreview(input: UseCollectionFinancePreviewInput): FinanceCalculationResult {
  const financeInput = useMemo<CollectionFinanceInput>(() => ({
    selectedLocation: input.selectedLocation,
    currentScore: input.currentScore,
    expenses: input.expenses,
    coinExchange: input.coinExchange,
    ownerRetention: input.ownerRetention,
    isOwnerRetaining: input.isOwnerRetaining,
    tip: input.tip,
    startupDebtDeduction: input.startupDebtDeduction,
    initialFloat: input.initialFloat,
  }), [
    input.selectedLocation,
    input.currentScore,
    input.expenses,
    input.coinExchange,
    input.ownerRetention,
    input.isOwnerRetaining,
    input.tip,
    input.startupDebtDeduction,
    input.initialFloat,
  ]);

  const [financeResult, setFinanceResult] = useState<FinanceCalculationResult>(() =>
    calculateCollectionFinanceLocal(EMPTY_FINANCE_INPUT)
  );
  const requestIdRef = useRef<number>(0);
  const rpcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFinanceResult(calculateCollectionFinanceLocal(financeInput));

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (rpcDebounceRef.current) clearTimeout(rpcDebounceRef.current);

    rpcDebounceRef.current = setTimeout(() => {
      calculateCollectionFinancePreview(financeInput).then(result => {
        if (requestId === requestIdRef.current) setFinanceResult(result);
      }).catch(() => {
        // Local calculation has already been applied.
      });
    }, 400);

    return () => {
      if (rpcDebounceRef.current) clearTimeout(rpcDebounceRef.current);
    };
  }, [financeInput]);

  return financeResult;
}
