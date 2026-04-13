import { useState, useCallback, useRef, useEffect } from 'react';

import { Transaction } from '../../types';

const DRAFT_STORAGE_KEY = 'bahati_collection_draft';
const CURRENT_DRAFT_SCHEMA_VERSION = 3;

export interface CollectionDraft {
  selectedLocId: string;
  draftTxId: string;
  currentScore: string;
  photoData: string | null;
  aiReviewData: AIReviewData | null;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  expenseDescription: string;
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  startupDebtDeduction: string;
  gpsCoords: { lat: number; lng: number } | null;
  gpsPermission: 'prompt' | 'granted' | 'denied';
  gpsSource: 'live' | 'exif' | 'estimated' | null;
}

export interface AIReviewData {
  score: string;
  condition: string;
  notes: string;
  image: string;
}

const EMPTY_DRAFT: CollectionDraft = {
  selectedLocId: '',
  draftTxId: '',
  currentScore: '',
  photoData: null,
  aiReviewData: null,
  expenses: '',
  expenseType: 'public',
  expenseCategory: 'tip',
  expenseDescription: '',
  coinExchange: '',
  ownerRetention: '',
  isOwnerRetaining: true,
  tip: '',
  startupDebtDeduction: '',
  gpsCoords: null,
  gpsPermission: 'prompt',
  gpsSource: null,
};

type StoredCollectionDraft = Partial<CollectionDraft> & {
  draftSchemaVersion?: number;
};

function withoutRuntimeState(draft: CollectionDraft): CollectionDraft {
  return {
    ...draft,
    photoData: null,
    aiReviewData: null,
    gpsCoords: null,
    gpsPermission: 'prompt',
    gpsSource: null,
  };
}

function sanitizeStoredDraft(stored: StoredCollectionDraft): CollectionDraft {
  const { draftSchemaVersion: _draftSchemaVersion, ...storedDraft } = stored;
  const migrated =
    stored.draftSchemaVersion === CURRENT_DRAFT_SCHEMA_VERSION
      ? storedDraft
      : {
          ...storedDraft,
          expenses: '',
          expenseType: 'public' as const,
          expenseCategory: 'tip' as const,
          expenseDescription: '',
          tip: '',
        };

  return withoutRuntimeState({ ...EMPTY_DRAFT, ...migrated });
}

export function useCollectionDraft() {
  const [draft, setDraftState] = useState<CollectionDraft>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        return sanitizeStoredDraft(JSON.parse(saved));
      }
    } catch { /* ignore */ }
    return { ...EMPTY_DRAFT };
  });

  const draftRef = useRef(draft);
  draftRef.current = draft;

  const saveDraft = useCallback((d: CollectionDraft) => {
    try {
      // Exclude photoData and aiReviewData from localStorage persistence
      // to avoid hitting the ~5MB quota (photos can be several MB each).
      const toSave = withoutRuntimeState(d);
      if (JSON.stringify(toSave) === JSON.stringify(EMPTY_DRAFT)) {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
        return;
      }
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
        ...toSave,
        draftSchemaVersion: CURRENT_DRAFT_SCHEMA_VERSION,
      }));
    } catch { /* ignore quota errors */ }
  }, []);

  const updateDraft = useCallback((partial: Partial<CollectionDraft>) => {
    setDraftState(prev => {
      const next = { ...prev, ...partial };
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setDraftState({ ...EMPTY_DRAFT });
    try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const loadDraft = useCallback((): CollectionDraft | null => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        return sanitizeStoredDraft(JSON.parse(saved));
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  useEffect(() => {
    saveDraft(draft);
  }, [draft, saveDraft]);

  return { draft, updateDraft, resetDraft, saveDraft, loadDraft };
}
