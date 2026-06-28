import { CheckCircle2, ChevronRight } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { useToast } from '../contexts/ToastContext';
import type { CollectionSubmissionInput } from '../services/collectionSubmissionService';
import { CONSTANTS, safeRandomUUID, TRANSLATIONS, type Location, type Transaction } from '../types';

type SubStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const SUB_STEP_LABELS: Record<SubStep, string> = {
  1: 'walkthroughStepScore',
  2: 'walkthroughStepDividend',
  3: 'walkthroughStepRevenue',
  4: 'walkthroughStepRetention',
  5: 'walkthroughStepTip',
  6: 'walkthroughStepExpense',
  7: 'walkthroughStepCoinExchange',
};

interface MachineEntry {
  location: Location;
  tx?: Transaction;
}

const ManualCollectionEntryPage: React.FC = () => {
  const { currentUser, lang } = useAuth();
  const { drivers, locations, transactions, isOnline } = useAppData();
  const { submitManualCollection } = useMutations();
  const { showToast } = useToast();
  const t = TRANSLATIONS[lang];

  const [driverId, setDriverId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [adminOverride, setAdminOverride] = useState(true);
  const [currentMachineIdx, setCurrentMachineIdx] = useState<number | null>(null);
  const [subStep, setSubStep] = useState<SubStep>(1);
  const [showComplete, setShowComplete] = useState(false);

  // Draft state
  const [draftScore, setDraftScore] = useState('');
  const [draftOwnerRetention, setDraftOwnerRetention] = useState('');
  const [draftIsOwnerRetaining, setDraftIsOwnerRetaining] = useState(false);
  const [draftTip, setDraftTip] = useState('');
  const [draftExpenses, setDraftExpenses] = useState('');
  const [draftExpenseCategory, setDraftExpenseCategory] = useState<NonNullable<Transaction['expenseCategory']>>('other');
  const [draftCoinExchange, setDraftCoinExchange] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [completedMachines, setCompletedMachines] = useState<Set<string>>(new Set());

  // Machine list
  const machineList = useMemo((): MachineEntry[] => {
    if (!driverId) return [];
    const dateStr = selectedDate;
    const driverTxs = transactions.filter(
      tx => tx.driverId === driverId && tx.timestamp?.startsWith(dateStr),
    );
    const merged = new Map<string, MachineEntry>();
    const allAssigned = locations.filter(l => l.assignedDriverId === driverId);
    for (const loc of allAssigned) merged.set(loc.id, { location: loc });
    for (const tx of driverTxs) {
      const loc = locations.find(l => l.id === tx.locationId);
      if (loc) merged.set(loc.id, { location: loc, tx });
    }
    return Array.from(merged.values()).sort(
      (a, b) => a.location.name.localeCompare(b.location.name),
    );
  }, [driverId, selectedDate, transactions, locations]);

  const selectedMachine = currentMachineIdx !== null ? machineList[currentMachineIdx] : null;
  const loc = selectedMachine?.location;

  const lastScore = loc?.lastScore ?? 0;
  const currScore = parseInt(draftScore) || 0;
  const diff = adminOverride ? currScore - lastScore : Math.max(0, currScore - lastScore);
  const revenue = Math.max(0, diff * CONSTANTS.COIN_VALUE_TZS);
  const commissionRate = loc?.commissionRate ?? CONSTANTS.DEFAULT_PROFIT_SHARE;
  const commission = Math.floor(Math.max(0, diff) * CONSTANTS.COIN_VALUE_TZS * commissionRate);
  const ownerRetention = draftOwnerRetention.trim()
    ? parseInt(draftOwnerRetention) || 0
    : commission;

  const initDraftFromTx = (tx?: Transaction) => {
    setDraftScore(tx?.currentScore?.toString() ?? '');
    setDraftOwnerRetention(tx?.ownerRetention?.toString() ?? '');
    setDraftIsOwnerRetaining(tx?.isOwnerRetaining ?? false);
    setDraftTip(tx?.tip?.toString() ?? '');
    setDraftExpenses(tx?.expenses?.toString() ?? '');
    setDraftCoinExchange(tx?.coinExchange?.toString() ?? '');
    setDraftNotes(tx?.notes ?? '');
  };

  const startMachine = (idx: number) => {
    setCurrentMachineIdx(idx);
    setSubStep(1);
    initDraftFromTx(machineList[idx]?.tx);
  };

  const nextSubStep = () => setSubStep(s => Math.min(s + 1, 7) as SubStep);

  const prevSubStep = () => {
    if (subStep > 1) {
      setSubStep(s => (s - 1) as SubStep);
    } else if (currentMachineIdx !== null && currentMachineIdx > 0) {
      const prevIdx = currentMachineIdx - 1;
      setCurrentMachineIdx(prevIdx);
      setSubStep(7);
      initDraftFromTx(machineList[prevIdx]?.tx);
    }
  };

  const skipMachine = () => {
    if (currentMachineIdx !== null && currentMachineIdx < machineList.length - 1) {
      startMachine(currentMachineIdx + 1);
    } else {
      setShowComplete(true);
    }
  };

  const submitCurrentMachine = async () => {
    if (!isOnline) {
      showToast(lang === 'zh' ? '离线无法提交' : 'Haiwezi kuwasilisha nje ya mtandao', 'warning');
      return;
    }
    if (!loc || !driverId) return;

    const input: CollectionSubmissionInput = {
      txId: `TX-${safeRandomUUID()}`,
      locationId: loc.id,
      driverId,
      currentScore: currScore,
      expenses: parseInt(draftExpenses) || 0,
      tip: parseInt(draftTip) || 0,
      startupDebtDeduction: 0,
      isOwnerRetaining: draftIsOwnerRetaining,
      ownerRetention: draftOwnerRetention.trim() ? ownerRetention : null,
      coinExchange: parseInt(draftCoinExchange) || 0,
      gps: null,
      photoUrl: null,
      aiScore: null,
      anomalyFlag: false,
      notes: `[admin_walkthrough] ${currentUser?.name ?? ''} ${draftNotes}`.trim(),
      expenseType: (parseInt(draftExpenses) || 0) > 0 ? 'public' : null,
      expenseCategory: (parseInt(draftExpenses) || 0) > 0 ? draftExpenseCategory : null,
      expenseDescription: undefined,
      reportedStatus: 'active',
      adminOverride: adminOverride,
    };

    try {
      await submitManualCollection.mutateAsync(input);
      setCompletedMachines(prev => new Set(prev).add(loc.id));
      showToast(lang === 'zh' ? '已提交' : 'Imewasilishwa', 'success');

      if (currentMachineIdx !== null && currentMachineIdx < machineList.length - 1) {
        startMachine(currentMachineIdx + 1);
      } else {
        setShowComplete(true);
      }
    } catch (e: any) {
      showToast(e?.message || (lang === 'zh' ? '提交失败' : 'Imeshindwa'), 'error');
    }
  };

  const resetAll = () => {
    setCurrentMachineIdx(null);
    setShowComplete(false);
    setDriverId('');
    setCompletedMachines(new Set());
  };

  // ── Selecting phase ──
  if (currentMachineIdx === null && !showComplete) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-5 p-5">
        <h2 className="text-lg font-black text-[#171310]">{t.walkthroughTitle}</h2>

        <label className="block space-y-2">
          <span className="text-sm font-black text-[#3d3028]">{lang === 'zh' ? '司机' : 'Dereva'}</span>
          <select
            aria-label={lang === 'zh' ? '司机' : 'Dereva'}
            value={driverId}
            onChange={e => setDriverId(e.target.value)}
            className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold"
          >
            <option value="">{lang === 'zh' ? '选择司机' : 'Chagua Dereva'}</option>
            {drivers.filter(d => d.status !== 'inactive').map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-black text-[#3d3028]">{lang === 'zh' ? '日期' : 'Tarehe'}</span>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold"
          />
        </label>

        <div className="flex items-center justify-between rounded-xl border border-[#e0d8cc] bg-[#f3efe8] p-3">
          <div>
            <p className="text-sm font-black text-[#3d3028]">{lang === 'zh' ? '管理员覆写' : 'Admin Override'}</p>
            <p className="text-xs text-[#8c7e6d]">{lang === 'zh' ? '开启后放松读数/金额限制' : 'Inaruhusu kupita mipaka ya usomaji'}</p>
          </div>
          <button
            type="button"
            aria-pressed={adminOverride}
            onClick={() => setAdminOverride(v => !v)}
            className={`relative h-6 w-11 rounded-full transition-colors ${adminOverride ? 'bg-rose-500' : 'bg-[#c0b0a0]'}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${adminOverride ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        {driverId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-[#3d3028]">
                {machineList.length} {t.walkthroughMachine}
              </p>
              <span className={`text-xs font-bold ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`}>
                {isOnline ? '● ' : '○ '}
                {isOnline ? (lang === 'zh' ? '在线可提交' : 'Mtandaoni') : (lang === 'zh' ? '离线' : 'Nje ya mtandao')}
              </span>
            </div>
            {machineList.length === 0 ? (
              <div className="rounded-xl border border-[#e0d8cc] bg-[#f3efe8] p-4 text-center">
                <p className="text-sm font-bold text-[#8c7e6d]">{t.walkthroughNoData}</p>
              </div>
            ) : (
              machineList.map((m, idx) => (
                <button
                  key={m.location.id}
                  onClick={() => startMachine(idx)}
                  className={`w-full text-left rounded-xl border p-3 flex items-center justify-between transition-colors ${
                    completedMachines.has(m.location.id)
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-white border-[#e0d8cc] hover:bg-[#fbf9f5]'
                  }`}
                >
                  <div>
                    <p className="text-sm font-black text-[#171310]">
                      {m.location.name} · {m.location.machineId || '—'}
                    </p>
                    <p className="text-xs text-[#8c7e6d]">
                      {t.walkthroughPrevScore}: {m.location.lastScore.toLocaleString()}
                      {m.tx && ` · ${t.walkthroughDiff}: ${(m.tx.currentScore ?? 0) - (m.tx.previousScore ?? 0)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {completedMachines.has(m.location.id) && (
                      <CheckCircle2 size={16} className="text-emerald-600" />
                    )}
                    <ChevronRight size={16} className="text-[#c0b0a0]" />
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Completion phase ──
  if (showComplete) {
    const completedCount = completedMachines.size;
    return (
      <div className="w-full max-w-2xl mx-auto text-center space-y-5 p-5">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-[#171310]">{t.walkthroughComplete}</h2>
          <p className="text-sm text-[#8c7e6d] mt-1">
            {completedCount}/{machineList.length} {t.walkthroughMachine}
          </p>
        </div>
        <button
          onClick={resetAll}
          className="px-6 py-3 bg-amber-600 text-white rounded-xl text-sm font-black hover:bg-amber-700"
        >
          {t.walkthroughReturn}
        </button>
      </div>
    );
  }

  // ── Walkthrough phase ──
  const stepLabel = t[SUB_STEP_LABELS[subStep] as keyof typeof t] || `Step ${subStep}`;
  const nextStepLabel = subStep < 7
    ? t[SUB_STEP_LABELS[(subStep + 1) as SubStep] as keyof typeof t]
    : '';

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 p-5">
      {/* Header */}
      <div className="flex items-center justify-between text-sm">
        <button onClick={prevSubStep} className="text-[#8c7e6d] font-bold">
          ← {lang === 'zh' ? '上一步' : 'Nyuma'}
        </button>
        <span className="font-black text-[#171310] text-center">
          {loc?.name} · {loc?.machineId || '—'}
        </span>
        <button onClick={skipMachine} className="text-rose-500 font-bold">
          {t.walkthroughSkip} →
        </button>
      </div>
      <p className="text-xs text-[#a09080] text-center font-bold uppercase">
        {t.walkthroughStep} {subStep}/7 · {stepLabel}
      </p>

      {/* ── Step 1: Score ── */}
      {subStep === 1 && (
        <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-[#f3efe8] p-3 rounded-xl">
              <p className="text-xs text-[#a09080] font-bold">{t.walkthroughPrevScore}</p>
              <p className="text-xl font-black">{lastScore.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-[#a09080] font-bold">{t.walkthroughCurrScore}</p>
              <input
                inputMode="numeric"
                value={draftScore}
                onChange={e => setDraftScore(e.target.value)}
                placeholder={lang === 'zh' ? '输入读数' : 'Weka alama'}
                autoFocus
                className="w-full rounded-xl border border-[#e0d8cc] p-3 text-xl font-black focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
          {draftScore.trim() && (
            <div className="text-center text-sm font-bold text-[#8c7e6d]">
              {t.walkthroughDiff}:{' '}
              <span className={`font-black ${diff >= 0 ? 'text-amber-700' : 'text-rose-600'}`}>
                {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
              </span>
            </div>
          )}
          <button
            onClick={nextSubStep}
            disabled={!draftScore.trim()}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-black disabled:opacity-30"
          >
            {t.walkthroughNext} {nextStepLabel}
          </button>
        </div>
      )}

      {/* ── Step 2: Dividend ── */}
      {subStep === 2 && (
        <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
          <div className="text-center">
            <p className="text-xs text-[#a09080] font-bold">{t.walkthroughStepDividend}</p>
            <p className="text-3xl font-black text-amber-700">TZS {commission.toLocaleString()}</p>
            <p className="text-xs text-[#a09080] mt-1">
              {Math.abs(diff)} × TZS {CONSTANTS.COIN_VALUE_TZS} × {(commissionRate * 100).toFixed(0)}%
            </p>
          </div>
          <input
            inputMode="numeric"
            value={draftOwnerRetention}
            onChange={e => setDraftOwnerRetention(e.target.value)}
            placeholder={`${lang === 'zh' ? '默认' : 'Default'} ${commission.toLocaleString()}`}
            className="w-full rounded-xl border border-[#e0d8cc] p-3 text-lg font-black text-center focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={nextSubStep}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-black"
          >
            {t.walkthroughNext} {nextStepLabel}
          </button>
        </div>
      )}

      {/* ── Step 3: Revenue ── */}
      {subStep === 3 && (
        <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5 text-center">
          <p className="text-xs text-[#a09080] font-bold">{t.walkthroughStepRevenue}</p>
          <p className="text-4xl font-black text-emerald-700">TZS {revenue.toLocaleString()}</p>
          <p className="text-xs text-[#a09080]">{Math.abs(diff)} × TZS {CONSTANTS.COIN_VALUE_TZS}</p>
          <button
            onClick={nextSubStep}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-black"
          >
            {t.walkthroughNext} {nextStepLabel}
          </button>
        </div>
      )}

      {/* ── Step 4: Retain or Pay ── */}
      {subStep === 4 && (
        <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
          <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepRetention}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setDraftIsOwnerRetaining(true)}
              className={`p-4 rounded-xl border-2 font-black text-sm transition-colors ${
                draftIsOwnerRetaining
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-[#e0d8cc] text-[#8c7e6d] hover:border-emerald-200'
              }`}
            >
              {t.walkthroughRetain}
            </button>
            <button
              onClick={() => setDraftIsOwnerRetaining(false)}
              className={`p-4 rounded-xl border-2 font-black text-sm transition-colors ${
                !draftIsOwnerRetaining
                  ? 'border-amber-500 bg-amber-50 text-amber-700'
                  : 'border-[#e0d8cc] text-[#8c7e6d] hover:border-amber-200'
              }`}
            >
              {t.walkthroughPayOut}
            </button>
          </div>
          <button
            onClick={nextSubStep}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-black"
          >
            {t.walkthroughNext} {nextStepLabel}
          </button>
        </div>
      )}

      {/* ── Step 5: Tip ── */}
      {subStep === 5 && (
        <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
          <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepTip}</p>
          <input
            inputMode="numeric"
            value={draftTip}
            onChange={e => setDraftTip(e.target.value)}
            placeholder="0"
            autoFocus
            className="w-full rounded-xl border border-[#e0d8cc] p-3 text-2xl font-black text-center focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={nextSubStep}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-black"
          >
            {t.walkthroughNext} {nextStepLabel}
          </button>
        </div>
      )}

      {/* ── Step 6: Other Expenses ── */}
      {subStep === 6 && (
        <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
          <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepExpense}</p>
          <input
            inputMode="numeric"
            value={draftExpenses}
            onChange={e => setDraftExpenses(e.target.value)}
            placeholder="0"
            autoFocus
            className="w-full rounded-xl border border-[#e0d8cc] p-3 text-2xl font-black text-center focus:ring-2 focus:ring-amber-500"
          />
          {(parseInt(draftExpenses) || 0) > 0 && (
            <select
              value={draftExpenseCategory}
              onChange={e => setDraftExpenseCategory(e.target.value as any)}
              className="w-full rounded-xl border border-[#e0d8cc] p-2 text-sm font-bold"
            >
              {[
                'fuel', 'repair', 'electricity', 'transport',
                'fine', 'allowance', 'salary_advance', 'office_loan', 'tip', 'other',
              ].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <button
            onClick={nextSubStep}
            className="w-full py-3 bg-amber-600 text-white rounded-xl font-black"
          >
            {t.walkthroughNext} {nextStepLabel}
          </button>
        </div>
      )}

      {/* ── Step 7: Coin Exchange + Submit ── */}
      {subStep === 7 && (
        <div className="space-y-4 bg-white border border-[#e0d8cc] rounded-2xl p-5">
          <p className="text-sm font-black text-center text-[#171310]">{t.walkthroughStepCoinExchange}</p>
          <input
            inputMode="numeric"
            value={draftCoinExchange}
            onChange={e => setDraftCoinExchange(e.target.value)}
            placeholder="0"
            autoFocus
            className="w-full rounded-xl border border-[#e0d8cc] p-3 text-2xl font-black text-center focus:ring-2 focus:ring-amber-500"
          />
          <button
            onClick={submitCurrentMachine}
            disabled={!isOnline || submitManualCollection.isPending}
            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-black text-lg disabled:opacity-30"
          >
            {submitManualCollection.isPending
              ? (lang === 'zh' ? '提交中...' : 'Inawasilisha...')
              : t.walkthroughSubmitNext}
          </button>
        </div>
      )}
    </div>
  );
};

export default ManualCollectionEntryPage;
