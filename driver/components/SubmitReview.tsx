import { Send, Loader2, CheckCircle2, ArrowRight, AlertTriangle, Satellite, RotateCcw } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';
import { useCollectionSubmission } from '../../hooks/useCollectionSubmission';
import { extractGpsFromExif, estimateLocationFromContext } from '../../offlineQueue';
import { Location, Driver, TRANSLATIONS } from '../../types';

import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import WizardStepBar from './WizardStepBar';


import type { DriverFlowEventInput } from '../../services/driverFlowTelemetry';
import type { Transaction } from '../../types';
import type { AIReviewData } from '../hooks/useCollectionDraft';


interface SubmitReviewProps {
  selectedLocation: Location;
  currentDriver: Driver;
  lang: 'zh' | 'sw';
  isOnline: boolean;
  currentScore: string;
  photoData: string | null;
  aiReviewData: AIReviewData | null;
  coinExchange: string;
  tip: string;
  startupDebtDeduction: string;
  draftTxId: string;
  gpsCoords: { lat: number; lng: number } | null;
  gpsPermission: 'prompt' | 'granted' | 'denied';
  /** Raw owner-retention inputs — forwarded to the server write path as-is. */
  isOwnerRetaining: boolean;
  ownerRetention: string;
  calculations: {
    diff: number;
    revenue: number;
    commission: number;
    finalRetention: number;
    startupDebtDeduction: number;
    netPayable: number;
    remainingCoins: number;
    isCoinStockNegative: boolean;
  };
  onSubmit: (result: CompletionResult) => void | Promise<void>;
  onBack: () => void;
  onSwitchMachine?: () => void;
  onReset: () => void;
  onReturnHome?: () => void;
  onRequestGps: () => void;
  nextMachine?: Location | null;
  pendingCount?: number;
  embedded?: boolean;
  submissionBlockers?: string[];
  allTransactions: Transaction[];
  todayStr: string;
  onTelemetryEvent?: (
    eventName: DriverFlowEventInput['eventName'],
    options?: Partial<Omit<DriverFlowEventInput, 'driverId' | 'flowId' | 'eventName' | 'onlineStatus'>>,
  ) => void;
}

export type CompletionResult = {
  source: 'server' | 'offline';
  transaction: Transaction;
};

const SubmitReview: React.FC<SubmitReviewProps> = ({
  selectedLocation, currentDriver, lang, isOnline, currentScore, photoData,
  aiReviewData, coinExchange, tip, startupDebtDeduction: _startupDebtDeduction, draftTxId,
  gpsCoords, gpsPermission, isOwnerRetaining, ownerRetention, calculations,
  onSubmit, onBack, onSwitchMachine, onReset, onReturnHome, onRequestGps, nextMachine, pendingCount,
  embedded = false, submissionBlockers = [], allTransactions, todayStr, onTelemetryEvent,
}) => {
  const t = TRANSLATIONS[lang];
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);
  // GPS-acquisition local state (distinct from the submission state machine)
  const [gpsResolving, setGpsResolving] = useState(false);
  const { state: submissionState, submit: submitCollection, reset: resetSubmissionState } = useCollectionSubmission();
  const [completionResult, setCompletionResult] = useState<CompletionResult | null>(null);
  const [completionPending, setCompletionPending] = useState(false);

  // Idempotency lock — prevents a second submission while the success/error
  // useEffect is pending (e.g. user taps Submit again while alert() is open).
  const submittedRef = React.useRef(false);
  const consumedSubmissionRef = React.useRef<string | null>(null);
  const mountedRef = React.useRef(true);
  const onSubmitRef = React.useRef(onSubmit);
  const showToastRef = React.useRef(showToast);

  React.useEffect(() => {
    onSubmitRef.current = onSubmit;
    showToastRef.current = showToast;
  }, [onSubmit, showToast]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset the idempotency lock whenever the draftTxId changes (new collection).
  React.useEffect(() => {
    submittedRef.current = false;
    consumedSubmissionRef.current = null;
    setCompletionResult(null);
    setCompletionPending(false);
  }, [draftTxId]);

  // Derived boolean used to disable the submit button and spinner gating
  const isProcessing = gpsResolving || completionPending || submissionState.status === 'submitting';

  const handleReturnHome = () => {
    setCompletionResult(null);
    submittedRef.current = false;
    resetSubmissionState();
    if (onReturnHome) {
      onReturnHome();
      return;
    }
    onReset();
  };

  // Consume success / error transitions and run UI side effects
  useEffect(() => {
    if (submissionState.status === 'success') {
      const { source, transaction } = submissionState;
      const submissionKey = `${source}:${transaction.id}`;
      if (consumedSubmissionRef.current === submissionKey) return;
      consumedSubmissionRef.current = submissionKey;

      const completion = { source, transaction };
      setCompletionPending(true);

      void (async () => {
        try {
          await onSubmitRef.current(completion);
          if (!mountedRef.current) return;
          setCompletionResult(completion);
          if (source === 'server') {
            showToastRef.current(lang === 'zh' ? '已提交到云端' : 'Imetumwa kwenye seva', 'success');
          } else {
            showToastRef.current(lang === 'zh' ? '已加入待同步队列' : 'Imeongezwa kwenye foleni', 'success');
          }
        } catch (error) {
          if (!mountedRef.current) return;
          console.error('Submission completion handler failed', error);
          submittedRef.current = false;
          setCompletionResult(null);
          onTelemetryEvent?.('submit_failed', {
            step: 'complete',
            errorCategory: 'completion_handler_failed',
          });
          showToastRef.current(lang === 'zh' ? '提交后处理失败，请重试' : 'Post-submit update failed, please retry', 'error');
        } finally {
          if (mountedRef.current) {
            setCompletionPending(false);
            resetSubmissionState();
          }
        }
      })();
    } else if (submissionState.status === 'error') {
      submittedRef.current = false;
      setCompletionResult(null);
      setCompletionPending(false);
      resetSubmissionState();
      onTelemetryEvent?.('submit_failed', {
        step: 'confirm',
        errorCategory: submissionState.message || 'submission_error',
      });
      showToastRef.current(
        submissionState.message || (lang === 'zh' ? '提交失败，请重试' : 'Imeshindwa, jaribu tena'),
        'error',
      );
    }
  }, [submissionState, lang, resetSubmissionState, onTelemetryEvent]);

  if (completionResult) {
    const { source, transaction } = completionResult;
    const returnLabel = lang === 'zh' ? '返回收款首页' : 'Back to collection home';
    const completionTitle = lang === 'zh' ? '任务完成' : 'Task completed';
    const completionSubtitle = source === 'server'
      ? (lang === 'zh' ? '已成功提交到云端。' : 'Successfully saved to the cloud.')
      : (lang === 'zh' ? '已加入待同步队列。' : 'Added to the offline sync queue.');
    const sourceLabel = source === 'server'
      ? (lang === 'zh' ? '云端已保存' : 'Saved online')
      : (lang === 'zh' ? '待同步' : 'Pending sync');

    return (
      <div data-testid="driver-submit-complete" className="mx-auto max-w-md animate-in fade-in space-y-3">
        <div className="rounded-card border border-emerald-200 bg-white px-4 py-5 shadow-field">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-subcard bg-emerald-500 text-white shadow-field">
              <CheckCircle2 size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-caption font-black uppercase tracking-[0.18em] text-emerald-700">{completionTitle}</p>
              <h2 className="truncate text-base font-black text-slate-900">{transaction.locationName}</h2>
              <p className="text-caption font-black uppercase tracking-[0.15em] text-slate-500">
                {selectedLocation.machineId} · {sourceLabel}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-600">{completionSubtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-card border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{lang === 'zh' ? '机器读数' : 'Reading'}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{transaction.currentScore.toLocaleString()}</p>
          </div>
          <div className="rounded-card border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.net}</p>
            <p className="mt-1 text-sm font-black text-slate-900">TZS {transaction.netPayable.toLocaleString()}</p>
          </div>
          <div className="rounded-card border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{lang === 'zh' ? '提交状态' : 'Status'}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{sourceLabel}</p>
          </div>
          <div className="rounded-card border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-caption font-black uppercase tracking-wide text-slate-400">{lang === 'zh' ? '网点' : 'Site'}</p>
            <p className="mt-1 text-sm font-black text-slate-900">{selectedLocation.area || transaction.locationName}</p>
          </div>
        </div>

        <button aria-label="返回收款首页"
           type="button"
           onClick={handleReturnHome}
           data-testid="driver-return-home"
           className="w-full rounded-card bg-amber-600 px-4 py-4 text-sm font-black uppercase text-white shadow-field-md transition-all active:scale-95"
         >
          {returnLabel}
        </button>
      </div>
    );
  }

  const processSubmission = async (
    resolvedGps: { lat: number; lng: number },
    gpsSourceType: 'live' | 'exif' | 'estimated' | 'none' = 'live',
  ) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    await submitCollection({
      selectedLocation,
      currentDriver,
      isOnline,
      currentScore,
      photoData,
      aiReviewData,
      expenses: '',
      expenseType: 'public',
      expenseCategory: undefined,
      expenseDescription: undefined,
      coinExchange,
      tip,
      draftTxId,
      isOwnerRetaining,
      ownerRetention,
      calculations,
      resolvedGps,
      gpsSourceType,
    });
  };

  const handleSubmit = async () => {
    if (!selectedLocation || isProcessing || submittedRef.current) return;
    onTelemetryEvent?.('submit_clicked', { step: 'confirm' });
    // Validate score is numeric before proceeding (orchestrator also validates,
    // but giving clear feedback here saves the user going through GPS flow first).
    const trimmedScore = currentScore.trim();
    if (!trimmedScore || isNaN(parseInt(trimmedScore, 10))) {
      showToast(
        lang === 'zh'
          ? '请输入有效的机器读数（纯数字）。'
          : 'Please enter a valid numeric machine score.',
        'error',
      );
      onTelemetryEvent?.('submit_validation_error', {
        step: 'confirm',
        errorCategory: 'invalid_score',
      });
      return;
    }
    if (isScoreBelowLastReading) {
      showToast(
        lang === 'zh'
          ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请返回核对读数或提交重置申请。`
          : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Go back to verify the reading or submit a reset request.`,
        'error',
      );
      onTelemetryEvent?.('submit_validation_error', {
        step: 'confirm',
        errorCategory: 'score_below_last_reading',
      });
      return;
    }
    if (!photoData) {
      const ok = await confirm({
        message: lang === 'zh'
          ? '未附加照片，照片可作为收款凭证。是否仍要提交？'
          : 'No photo attached. A photo serves as proof of collection. Continue anyway?',
        confirmLabel: lang === 'zh' ? '继续提交' : 'Submit anyway',
        cancelLabel: lang === 'zh' ? '返回添加' : 'Go back',
      });
      if (!ok) {
        onTelemetryEvent?.('submit_confirmation_cancelled', {
          step: 'confirm',
          errorCategory: 'missing_photo_cancelled',
        });
        return;
      }
    }
    if (calculations.isCoinStockNegative) {
      const ok = await confirm({
        message: lang === 'zh' ? '零钱库存不足，是否继续？' : 'Coin stock insufficient, continue?',
        confirmLabel: lang === 'zh' ? '继续' : 'Continue',
      });
      if (!ok) {
        onTelemetryEvent?.('submit_confirmation_cancelled', {
          step: 'confirm',
          errorCategory: 'coin_stock_negative_cancelled',
        });
        return;
      }
    }

    const alreadyCollectedToday = allTransactions.some(
      tx => tx.locationId === selectedLocation.id && tx.type === 'collection' && tx.timestamp.startsWith(todayStr),
    );
    if (alreadyCollectedToday) {
      const ok = await confirm({
        message: lang === 'zh'
          ? `今天（${todayStr}）已对此机器提交过一次收款记录。是否确认再次提交？`
          : `A collection for this machine was already submitted today (${todayStr}). Are you sure you want to submit again?`,
        confirmLabel: lang === 'zh' ? '确认再次提交' : 'Submit again',
        destructive: true,
      });
      if (!ok) {
        onTelemetryEvent?.('submit_confirmation_cancelled', {
          step: 'confirm',
          errorCategory: 'duplicate_collection_cancelled',
        });
        return;
      }
    }

    if (gpsCoords) { processSubmission(gpsCoords, 'live'); return; }

    if (photoData) {
      setGpsResolving(true);
      const exifGps = await extractGpsFromExif(photoData);
      setGpsResolving(false);
      if (exifGps) { processSubmission(exifGps, 'exif'); return; }
    }

    const estimated = estimateLocationFromContext(gpsCoords, selectedLocation?.coords || null);
    if (estimated) {
      const confirmEst = await confirm({
        message: lang === 'zh' ? '无法获取GPS，将使用网点坐标估算位置。继续提交？' : 'No GPS available. Will use site coordinates as estimated location. Continue?',
        confirmLabel: lang === 'zh' ? '继续' : 'Continue',
      });
      if (confirmEst) { processSubmission(estimated, 'estimated'); return; }
      onTelemetryEvent?.('submit_confirmation_cancelled', {
        step: 'confirm',
        errorCategory: 'estimated_gps_cancelled',
      });
      return;
    }

    const confirmNoGps = await confirm({
      message: lang === 'zh' ? '无GPS信号。是否仍要保存记录？（将标注为无位置）' : 'No GPS signal. Save record without location? (marked as offline)',
      confirmLabel: lang === 'zh' ? '仍要保存' : 'Save anyway',
    });
    if (confirmNoGps) { processSubmission({ lat: 0, lng: 0 }, 'none'); }
    else {
      onTelemetryEvent?.('submit_confirmation_cancelled', {
        step: 'confirm',
        errorCategory: 'no_gps_cancelled',
      });
      onRequestGps();
    }
  };

  const isSubmitBlocked = isProcessing || !currentScore || isScoreBelowLastReading || submissionBlockers.length > 0;

  return (
    <div className={embedded ? 'space-y-2.5' : 'mx-auto max-w-md animate-in fade-in space-y-2.5'}>
      {!embedded && (
        <>
          <WizardStepBar current="confirm" lang={lang} />

          <CollectionWorkbenchHeader
            selectedLocation={selectedLocation}
            lang={lang}
            onBack={onBack}
            onSwitchMachine={onSwitchMachine}
            nextMachine={nextMachine}
            pendingCount={pendingCount}
          />
        </>
      )}

      {!embedded && (
        <>
          <div className="bg-slate-900 rounded-2xl px-4 py-3 text-white flex justify-between items-center">
            <div>
              <p className="text-caption font-black uppercase opacity-60">{t.net}</p>
              <p className="text-caption font-bold opacity-40 uppercase mt-0.5">{t.cashToHandIn}</p>
            </div>
            <p className="text-4xl font-black">TZS {calculations.netPayable.toLocaleString()}</p>
          </div>

          {photoData && (
            <div className="h-20 rounded-2xl overflow-hidden border border-slate-200 relative">
              <img src={photoData} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt={t.paymentProof} />
              <div className="absolute top-2 right-2 bg-emerald-500 text-white text-caption font-black uppercase px-2 py-0.5 rounded-tag flex items-center gap-1">
                <CheckCircle2 size={9} /> {t.photoReady}
              </div>
            </div>
          )}
          {!photoData && draftTxId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
              <p className="text-caption font-black text-amber-700 leading-tight">
                {lang === 'zh'
                  ? '照片在刷新后丢失，请返回上一步重新拍照。'
                  : 'Photo was lost after page refresh. Please go back and retake it.'}
              </p>
            </div>
          )}

          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${
            gpsPermission === 'denied' ? 'bg-rose-50 border-rose-200' :
            gpsCoords ? 'bg-emerald-50 border-emerald-200' :
            'bg-slate-50 border-slate-200'
          }`}>
            <div className={`p-1.5 rounded-btn flex-shrink-0 ${
              gpsPermission === 'denied' ? 'bg-rose-500 text-white animate-pulse' :
              gpsCoords ? 'bg-emerald-500 text-white' :
              'bg-slate-400 text-white'
            }`}>
              <Satellite size={13} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-caption font-black uppercase ${
                gpsPermission === 'denied' ? 'text-rose-600' :
                gpsCoords ? 'text-emerald-700' :
                'text-slate-500'
              }`}>
                {gpsPermission === 'denied'
                  ? t.gpsDenied
                  : gpsCoords
                    ? t.gpsLocked
                    : t.gpsAcquiring}
              </p>
            </div>
            {!gpsCoords && gpsPermission !== 'denied' && (
              <button
                type="button"
                onClick={onRequestGps}
                aria-label={t.gpsAcquiring}
                className="p-1.5 bg-white rounded-xl border border-slate-200 text-amber-600 flex-shrink-0"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>

          {isScoreBelowLastReading && (
            <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-subcard">
              <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
              <p className="text-caption font-black text-rose-700 uppercase">
                {lang === 'zh'
                  ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，不能按普通收款提交。`
                  : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}); normal collection submit is blocked.`}
              </p>
            </div>
          )}
        </>
      )}

      {embedded && (
        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-caption font-bold text-slate-500">
          {lang === 'zh' ? '提交后由管理员复核入账。' : 'Admin reviews and posts this collection after submit.'}
        </p>
      )}

      {submissionBlockers.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-caption font-black uppercase tracking-[0.18em] text-amber-700">
            {lang === 'zh' ? '提交前需要补充' : 'Required before submit'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {submissionBlockers.map((blocker) => (
              <span key={blocker} className="rounded-full bg-white px-2 py-1 text-caption font-black text-amber-700">
                {blocker}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="sticky bottom-[calc(var(--mobile-nav-height,4.75rem)+env(safe-area-inset-bottom))] z-20 mt-4 rounded-card border border-slate-200 bg-white/95 p-2 backdrop-blur md:bottom-0">
        {embedded && (
          <div className="mb-2 flex items-center justify-between rounded-2xl bg-slate-900 px-3 py-2 text-white">
            <div>
              <p className="text-caption font-black uppercase opacity-60">{t.net}</p>
              <p className="text-caption font-bold uppercase opacity-40">{t.cashToHandIn}</p>
            </div>
            <p className="text-xl font-black">TZS {calculations.netPayable.toLocaleString()}</p>
          </div>
        )}
        <div className={`grid gap-3 ${embedded ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!embedded && (
            <button
              type="button"
              onClick={onBack}
              className="py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-xs hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowRight size={15} className="rotate-180" />
              {lang === 'zh' ? '返回上一步' : 'Back'}
            </button>
          )}
          <button
            type="button"
            aria-label="提交报告"
            aria-disabled={isSubmitBlocked}
            onClick={handleSubmit}
            disabled={isSubmitBlocked}
            data-testid="driver-submit-button"
            className="py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-sm disabled:bg-slate-300 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-200/40"
          >
            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {submissionState.status === 'submitting' ? t.saving :
             submissionBlockers.length > 0 ? (lang === 'zh' ? '资料不完整' : 'Incomplete') :
             !gpsCoords && gpsPermission !== 'denied' ? t.acquiringGps :
             t.confirmSubmit}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmitReview;
