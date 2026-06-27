import { AlertTriangle, Banknote, Calendar, CheckCircle2, Coins, Loader2, PlusCircle, ReceiptText, Save, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { useToast } from '../contexts/ToastContext';
import type { CollectionSubmissionInput } from '../services/collectionSubmissionService';
import { logFinanceAudit } from '../services/financeAuditService';
import { CONSTANTS, safeRandomUUID, type DailySettlement, type Location, type Transaction } from '../types';
import { clampCollectionAmount } from '../utils/collectionAmountLimits';
import { getTodayLocalDate } from '../utils/dateUtils';

type ReportedStatus = CollectionSubmissionInput['reportedStatus'];

const EXPENSE_CATEGORIES: Array<NonNullable<Transaction['expenseCategory']>> = [
  'fuel', 'repair', 'electricity', 'transport', 'fine',
  'allowance', 'salary_advance', 'office_loan', 'tip', 'other',
];

function money(value: number): string {
  return `TZS ${Math.round(value).toLocaleString()}`;
}

function rawAmount(value: string): number {
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Extract YYYY-MM-DD from an ISO timestamp */
function dateKey(ts: string): string {
  try { return ts.slice(0, 10); } catch { return ''; }
}

interface EntryDraft {
  id: string;
  locationId: string;
  driverId: string;
  currentScore: string;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: NonNullable<Transaction['expenseCategory']>;
  expenseDescription: string;
  coinExchange: string;
  tip: string;
  startupDebtDeduction: string;
  isOwnerRetaining: boolean;
  ownerRetention: string;
  reportedStatus: ReportedStatus;
  notes: string;
  adminOverride: boolean;
}

function emptyDraft(): EntryDraft {
  return {
    id: '',
    locationId: '',
    driverId: '',
    currentScore: '',
    expenses: '',
    expenseType: 'public',
    expenseCategory: 'other',
    expenseDescription: '',
    coinExchange: '',
    tip: '',
    startupDebtDeduction: '',
    isOwnerRetaining: false,
    ownerRetention: '',
    reportedStatus: 'active',
    notes: '',
    adminOverride: false,
  };
}

/** Preview calculation for a single draft entry */
function previewEntry(location: Location | null, draft: EntryDraft) {
  const parse = (field: Parameters<typeof clampCollectionAmount>[0], v: string) => {
    if (draft.adminOverride) return rawAmount(v);
    return clampCollectionAmount(field, v);
  };
  const previousScore = location?.lastScore ?? 0;
  const nextScore = parse('currentScore', draft.currentScore);
  const diff = draft.adminOverride
    ? nextScore - previousScore
    : Math.max(0, nextScore - previousScore);
  const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
  const commission = Math.floor(revenue * (location?.commissionRate ?? CONSTANTS.DEFAULT_PROFIT_SHARE));
  const finalRetention = draft.ownerRetention.trim()
    ? parse('ownerRetention', draft.ownerRetention)
    : commission;
  const expenseAmount = parse('expenses', draft.expenses);
  const tipAmount = parse('tip', draft.tip);
  const debtDeduction = draft.adminOverride
    ? parse('startupDebtDeduction', draft.startupDebtDeduction)
    : Math.min(
        parse('startupDebtDeduction', draft.startupDebtDeduction),
        Math.max(0, location?.remainingStartupDebt ?? 0),
      );
  const netPayable = revenue - finalRetention - expenseAmount - tipAmount + debtDeduction;
  return {
    previousScore, nextScore, diff, revenue, commission, finalRetention,
    expenseAmount, tipAmount, debtDeduction,
    netPayable: draft.adminOverride ? netPayable : Math.max(0, netPayable),
  };
}

const DailyCollectionEntryPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { drivers, locations, transactions, isOnline } = useAppData();
  const { submitManualCollection, createSettlement } = useMutations();
  const { showToast } = useToast();

  const todayStr = getTodayLocalDate();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [draft, setDraft] = useState<EntryDraft>(emptyDraft());
  const [isAdding, setIsAdding] = useState(false);
  const [lastSubmittedTxId, setLastSubmittedTxId] = useState<string | null>(null);

  // Cash reconciliation state
  const [actualCash, setActualCash] = useState('');
  const [actualCoins, setActualCoins] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [isGeneratingSettlement, setIsGeneratingSettlement] = useState(false);

  const isToday = selectedDate === todayStr;

  // Filter transactions for selected date
  const dayTransactions = useMemo(() => {
    return transactions.filter(tx => dateKey(tx.timestamp) === selectedDate);
  }, [transactions, selectedDate]);

  // Daily totals
  const dailyTotals = useMemo(() => {
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalOwnerRetention = 0;
    let totalDebtDeduction = 0;
    let totalNetPayable = 0;
    let totalTip = 0;

    for (const tx of dayTransactions) {
      totalRevenue += tx.revenue ?? 0;
      totalExpenses += tx.expenses ?? 0;
      totalOwnerRetention += tx.ownerRetention ?? 0;
      totalDebtDeduction += tx.startupDebtDeduction ?? 0;
      totalNetPayable += tx.netPayable ?? 0;
      totalTip += tx.tip ?? 0;
    }

    return { totalRevenue, totalExpenses, totalOwnerRetention, totalDebtDeduction, totalNetPayable, totalTip };
  }, [dayTransactions]);

  const activeDrivers = useMemo(
    () => drivers.filter(d => d.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)),
    [drivers],
  );

  const sortedLocations = useMemo(
    () => locations.slice().sort((a, b) => {
      const aName = `${a.name} ${a.machineId}`;
      const bName = `${b.name} ${b.machineId}`;
      return aName.localeCompare(bName);
    }),
    [locations],
  );

  const locationMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const driverMap = useMemo(() => new Map(drivers.map(d => [d.id, d])), [drivers]);

  const selectedLocationForDraft = useMemo(
    () => locations.find(l => l.id === draft.locationId) ?? null,
    [draft.locationId, locations],
  );

  const draftPreview = useMemo(
    () => previewEntry(selectedLocationForDraft, draft),
    [selectedLocationForDraft, draft],
  );

  const handleLocationChange = (locationId: string) => {
    setDraft(prev => {
      const next = { ...prev, locationId };
      const loc = locations.find(l => l.id === locationId);
      if (loc) {
        if (!prev.driverId && loc.assignedDriverId) {
          next.driverId = loc.assignedDriverId;
        }
        next.reportedStatus = (loc.status === 'maintenance' || loc.status === 'broken')
          ? loc.status : 'active';
      }
      return next;
    });
  };

  const resetDraft = () => {
    setDraft(emptyDraft());
    setIsAdding(false);
  };

  const handleSubmitEntry = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isToday) {
      showToast('非当日不可新增采集记录。请选择今天日期。', 'warning');
      return;
    }
    if (!isOnline) {
      showToast('快速补录需要联网提交。', 'warning');
      return;
    }
    const loc = selectedLocationForDraft;
    const drv = drivers.find(d => d.id === draft.driverId);
    if (!loc || !drv) {
      showToast('请选择机器和司机。', 'warning');
      return;
    }
    if (draft.currentScore.trim() === '' || !Number.isFinite(Number(draft.currentScore.replace(/,/g, '')))) {
      showToast('请输入有效当前读数。', 'warning');
      return;
    }
    if (!draft.adminOverride && draftPreview.nextScore < draftPreview.previousScore) {
      showToast('当前读数低于机器上次读数，请开启管理员覆写。', 'error');
      return;
    }

    const preview = draftPreview;
    const manualNote = [
      draft.adminOverride
        ? `[admin_override] ${currentUser.name} 覆写补录`
        : `[admin_manual_entry] ${currentUser.name} 快速补录`,
      draft.notes.trim() || null,
    ].filter(Boolean).join(' ');

    const input: CollectionSubmissionInput = {
      txId: `TX-${safeRandomUUID()}`,
      locationId: loc.id,
      driverId: drv.id,
      currentScore: preview.nextScore,
      expenses: preview.expenseAmount,
      tip: preview.tipAmount,
      startupDebtDeduction: preview.debtDeduction,
      isOwnerRetaining: draft.isOwnerRetaining,
      ownerRetention: draft.ownerRetention.trim() ? preview.finalRetention : null,
      coinExchange: draft.adminOverride ? rawAmount(draft.coinExchange) : clampCollectionAmount('coinExchange', draft.coinExchange),
      gps: null,
      photoUrl: null,
      aiScore: null,
      anomalyFlag: false,
      notes: manualNote,
      expenseType: preview.expenseAmount > 0 ? draft.expenseType : null,
      expenseCategory: preview.expenseAmount > 0 ? draft.expenseCategory : null,
      expenseDescription: preview.expenseAmount > 0 ? draft.expenseDescription.trim() || undefined : undefined,
      reportedStatus: draft.reportedStatus,
    };

    try {
      const transaction = await submitManualCollection.mutateAsync(input);
      setLastSubmittedTxId(transaction.id);
      if (draft.adminOverride) {
        logFinanceAudit({
          event_type: 'admin_override_entry',
          entity_type: 'location',
          entity_id: loc.id,
          entity_name: loc.name,
          actor_id: currentUser.id,
          old_value: loc.lastScore,
          new_value: preview.nextScore,
          payload: {
            txId: transaction.id,
            driverId: drv.id,
            revenue: preview.revenue,
            ownerRetention: preview.finalRetention,
            note: draft.notes.trim() || undefined,
          },
        });
      }
      showToast(draft.adminOverride ? '覆写补录已提交。' : '补录已提交。', 'success');
      resetDraft();
    } catch (error) {
      const message = error instanceof Error ? error.message : '补录失败';
      showToast(message, 'error');
    }
  };

  // Generate daily settlement
  const handleGenerateSettlement = async () => {
    if (!isOnline) { showToast('需要联网生成日结。', 'warning'); return; }
    if (dayTransactions.length === 0) { showToast('当日无采集记录，无法生成日结。', 'warning'); return; }

    setIsGeneratingSettlement(true);
    try {
      const cash = rawAmount(actualCash);
      const coins = rawAmount(actualCoins);
      const expectedTotal = dailyTotals.totalNetPayable;
      const shortage = expectedTotal - cash - coins;

      const settlement: DailySettlement = {
        id: `DS-${safeRandomUUID()}`,
        date: selectedDate,
        adminId: currentUser.id,
        adminName: currentUser.name,
        driverId: dayTransactions[0]?.driverId,
        driverName: dayTransactions[0]?.driverName,
        totalRevenue: dailyTotals.totalRevenue,
        totalNetPayable: dailyTotals.totalNetPayable,
        totalExpenses: dailyTotals.totalExpenses,
        driverFloat: 0,
        expectedTotal,
        expenseItems: [],
        actualCash: cash,
        actualCoins: coins,
        shortage,
        note: settlementNote.trim() || undefined,
        timestamp: new Date().toISOString(),
        status: 'pending',
      };

      await createSettlement.mutateAsync(settlement);
      showToast(`日结已生成。差额: ${money(shortage)}`, 'success');
      setActualCash('');
      setActualCoins('');
      setSettlementNote('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成日结失败', 'error');
    } finally {
      setIsGeneratingSettlement(false);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5">
      {/* ── Page Header ── */}
      <div className="bg-white border border-[#e0d8cc] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#171310]">每日采集录入</h2>
            <p className="text-sm text-[#8c7e6d] mt-1">以日期为单位批量录入机器读数，自动计算当日流水并生成日结单。</p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {isOnline ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {isOnline ? '在线可提交' : '离线不可补录'}
          </div>
        </div>
      </div>

      {/* ── Date Picker ── */}
      <div className="bg-white border border-[#e0d8cc] rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm font-black text-[#3d3028]">
            <Calendar size={18} className="text-[#8c7e6d]" />
            结算日期
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            max={todayStr}
            className="rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {isToday ? (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">今天</span>
          ) : (
            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">历史日期（只读）</span>
          )}
          <span className="text-xs text-[#8c7e6d] ml-auto">
            {dayTransactions.length} 笔采集记录
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* ── Left Column: Add Form + Entry List ── */}
        <div className="space-y-5">
          {/* Inline Add Form */}
          {isToday && isOnline && (
            <div className="bg-white border border-[#e0d8cc] rounded-xl shadow-sm overflow-hidden">
              {!isAdding ? (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="w-full flex items-center justify-center gap-2 p-4 text-sm font-bold text-emerald-600 hover:bg-emerald-50 transition-colors border-2 border-dashed border-emerald-200 rounded-xl"
                >
                  <PlusCircle size={18} />
                  添加一台机器的采集记录
                </button>
              ) : (
                <form onSubmit={handleSubmitEntry} className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-[#171310]">新增采集记录</h3>
                    <button type="button" onClick={resetDraft} className="text-[#8c7e6d] hover:text-[#2a2420]">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">机器/网点</span>
                      <select
                        value={draft.locationId}
                        onChange={e => handleLocationChange(e.target.value)}
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">选择机器</option>
                        {sortedLocations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name} · {loc.machineId || '无编号'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">司机</span>
                      <select
                        value={draft.driverId}
                        onChange={e => setDraft(prev => ({ ...prev, driverId: e.target.value }))}
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="">选择司机</option>
                        {activeDrivers.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">上次读数</span>
                      <input
                        value={selectedLocationForDraft ? selectedLocationForDraft.lastScore.toLocaleString() : ''}
                        readOnly
                        className="w-full rounded-lg border border-[#e0d8cc] bg-[#f3efe8] px-3 py-2 text-sm font-bold text-[#7a6e5e]"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">当前读数</span>
                      <input
                        inputMode="numeric"
                        value={draft.currentScore}
                        onChange={e => setDraft(prev => ({ ...prev, currentScore: e.target.value }))}
                        placeholder="例如 12800"
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">机器状态</span>
                      <select
                        value={draft.reportedStatus}
                        onChange={e => setDraft(prev => ({ ...prev, reportedStatus: e.target.value as ReportedStatus }))}
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="active">正常</option>
                        <option value="maintenance">需维护</option>
                        <option value="broken">故障</option>
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">支出</span>
                      <input
                        inputMode="numeric"
                        value={draft.expenses}
                        onChange={e => setDraft(prev => ({ ...prev, expenses: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">零钱兑换</span>
                      <input
                        inputMode="numeric"
                        value={draft.coinExchange}
                        onChange={e => setDraft(prev => ({ ...prev, coinExchange: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">小费</span>
                      <input
                        inputMode="numeric"
                        value={draft.tip}
                        onChange={e => setDraft(prev => ({ ...prev, tip: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                  </div>

                  {draftPreview.expenseAmount > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <label className="space-y-2">
                        <span className="text-sm font-black text-[#3d3028]">支出类型</span>
                        <select
                          value={draft.expenseType}
                          onChange={e => setDraft(prev => ({ ...prev, expenseType: e.target.value as 'public' | 'private' }))}
                          className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          <option value="public">公司成本</option>
                          <option value="private">司机借支</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-black text-[#3d3028]">支出分类</span>
                        <select
                          value={draft.expenseCategory}
                          onChange={e => setDraft(prev => ({ ...prev, expenseCategory: e.target.value as NonNullable<Transaction['expenseCategory']> }))}
                          className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        >
                          {EXPENSE_CATEGORIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-black text-[#3d3028]">支出说明</span>
                        <input
                          value={draft.expenseDescription}
                          onChange={e => setDraft(prev => ({ ...prev, expenseDescription: e.target.value }))}
                          placeholder="可选"
                          className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </label>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">债务扣回</span>
                      <input
                        inputMode="numeric"
                        value={draft.startupDebtDeduction}
                        onChange={e => setDraft(prev => ({ ...prev, startupDebtDeduction: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-black text-[#3d3028]">店主留存</span>
                      <input
                        inputMode="numeric"
                        value={draft.ownerRetention}
                        onChange={e => setDraft(prev => ({ ...prev, ownerRetention: e.target.value }))}
                        placeholder={`默认 ${money(draftPreview.commission)}`}
                        className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </label>
                    <label className="flex items-end gap-3 rounded-lg border border-[#e0d8cc] bg-[#f3efe8] px-3 py-3">
                      <input
                        type="checkbox"
                        checked={draft.isOwnerRetaining}
                        onChange={e => setDraft(prev => ({ ...prev, isOwnerRetaining: e.target.checked }))}
                        className="h-4 w-4 rounded border-[#c8beb0] text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-black text-[#3d3028]">计入店主分红</span>
                    </label>
                  </div>

                  <label className="space-y-2 block">
                    <span className="text-sm font-black text-[#3d3028]">备注</span>
                    <textarea
                      value={draft.notes}
                      onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                      placeholder="补录原因或异常说明"
                      className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>

                  {/* Admin Override Toggle */}
                  <div className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${draft.adminOverride ? 'border-rose-200 bg-rose-50' : 'border-[#e0d8cc] bg-[#f3efe8]'}`}>
                    <div>
                      <p className={`text-sm font-black ${draft.adminOverride ? 'text-rose-700' : 'text-[#3d3028]'}`}>管理员覆写 Admin Override</p>
                      <p className="text-xs text-[#8c7e6d] mt-0.5">允许读数低于上次、取消金额上限。覆写记录记入审计。</p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={draft.adminOverride}
                      onClick={() => setDraft(prev => ({ ...prev, adminOverride: !prev.adminOverride }))}
                      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${draft.adminOverride ? 'bg-rose-500' : 'bg-[#c0b0a0]'}`}
                    >
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${draft.adminOverride ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>

                  {/* Preview */}
                  {draft.currentScore.trim() && (
                    <div className="rounded-lg bg-[#fbf9f5] border border-[#e8e0d4] p-3 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-[#8c7e6d]">分数差</span><strong>{draftPreview.diff.toLocaleString()}</strong></div>
                      <div className="flex justify-between"><span className="text-[#8c7e6d]">营业额</span><strong>{money(draftPreview.revenue)}</strong></div>
                      <div className="flex justify-between"><span className="text-[#8c7e6d]">店主留存</span><strong>{money(draftPreview.finalRetention)}</strong></div>
                      <div className="border-t border-[#e8e0d4] pt-2 flex justify-between"><span className="text-[#3d3028] font-black">预计应交</span><strong className="text-emerald-700">{money(draftPreview.netPayable)}</strong></div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2 border-t border-[#e8e0d4]">
                    <button type="button" onClick={resetDraft} className="px-4 py-2 text-sm font-bold text-[#8c7e6d] hover:text-[#2a2420]">
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={!isOnline || submitManualCollection.isPending}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-[#c8beb0]"
                    >
                      {submitManualCollection.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      提交此笔
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Entry List */}
          <div className="bg-white border border-[#e0d8cc] rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-[#e0d8cc] bg-[#fbf9f5]">
              <h3 className="text-sm font-black text-[#171310]">
                📋 {selectedDate} 采集记录 ({dayTransactions.length} 笔)
              </h3>
            </div>

            {dayTransactions.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-14 h-14 bg-[#f3efe8] rounded-2xl flex items-center justify-center text-[#c0b0a0] mx-auto mb-3 border border-[#e0d8cc]">
                  <ReceiptText size={24} />
                </div>
                <p className="text-sm font-bold text-[#8c7e6d]">
                  {isToday ? '当日暂无采集记录，点击上方按钮添加。' : '该日期无采集记录。'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#f3efe8] max-h-[500px] overflow-y-auto">
                {dayTransactions.map(tx => {
                  const loc = locationMap.get(tx.locationId);
                  const drv = driverMap.get(tx.driverId);
                  const diff = (tx.currentScore ?? 0) - (tx.previousScore ?? 0);
                  return (
                    <div key={tx.id} className="p-4 hover:bg-[#fdfcfb] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-[#2a2420]">
                              📍 {loc?.name ?? tx.locationName ?? tx.locationId.slice(0, 8)}
                            </span>
                            {loc?.machineId && (
                              <span className="text-xs font-bold text-[#a09080]">· {loc.machineId}</span>
                            )}
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f3efe8] text-[#8c7e6d]">
                              {drv?.name ?? tx.driverName ?? '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs font-bold text-[#8c7e6d] flex-wrap">
                            <span>{tx.previousScore.toLocaleString()} → {tx.currentScore.toLocaleString()}</span>
                            <span className="text-amber-700">+{diff.toLocaleString()} 币</span>
                            <span className="text-emerald-700">{money(tx.revenue)}</span>
                            {tx.expenses > 0 && <span className="text-rose-600">支出 {money(tx.expenses)}</span>}
                            {tx.tip && tx.tip > 0 && <span className="text-rose-600">小费 {money(tx.tip)}</span>}
                            {tx.isOwnerRetaining && <span className="text-blue-600">店主留存 {money(tx.ownerRetention)}</span>}
                          </div>
                          {tx.notes && (
                            <p className="text-xs text-[#a09080] mt-1 italic">"{tx.notes}"</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-black text-emerald-700">{money(tx.netPayable)}</div>
                          <div className="text-[10px] font-bold text-[#a09080]">应交</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right Column: Daily Summary + Cash Reconciliation ── */}
        <div className="space-y-5">
          {/* Daily Summary */}
          <div className="bg-white border border-[#e0d8cc] rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-black text-[#171310] mb-4">
              <Banknote size={16} className="inline mr-1.5 -mt-0.5" />
              当日流水汇总
            </h3>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#8c7e6d]">机器数 / 笔数</span>
                <strong className="text-[#171310]">
                  {new Set(dayTransactions.map(t => t.locationId)).size} 台 / {dayTransactions.length} 笔
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8c7e6d]">营业额</span>
                <strong className="text-[#171310]">{money(dailyTotals.totalRevenue)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8c7e6d]">总支出</span>
                <strong className="text-rose-600">{money(dailyTotals.totalExpenses)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8c7e6d]">小费</span>
                <strong className="text-[#171310]">{money(dailyTotals.totalTip)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8c7e6d]">店主留存</span>
                <strong className="text-blue-600">{money(dailyTotals.totalOwnerRetention)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-[#8c7e6d]">债务扣回</span>
                <strong className="text-[#171310]">{money(dailyTotals.totalDebtDeduction)}</strong>
              </div>
              <div className="border-t border-[#e8e0d4] pt-3 flex justify-between">
                <span className="text-sm font-black text-[#3d3028]">应交现金</span>
                <strong className="text-lg font-black text-emerald-700">{money(dailyTotals.totalNetPayable)}</strong>
              </div>
            </div>
          </div>

          {/* Cash Reconciliation */}
          {dayTransactions.length > 0 && (
            <div className="bg-white border border-[#e0d8cc] rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-black text-[#171310] mb-4">
                <Coins size={16} className="inline mr-1.5 -mt-0.5" />
                现金核对
              </h3>

              <div className="space-y-4">
                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-[#3d3028]">实际现金收入 (TZS)</span>
                  <input
                    inputMode="numeric"
                    value={actualCash}
                    onChange={e => setActualCash(e.target.value)}
                    placeholder="实际收到的纸币金额"
                    className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-[#3d3028]">实际硬币收入 (TZS)</span>
                  <input
                    inputMode="numeric"
                    value={actualCoins}
                    onChange={e => setActualCoins(e.target.value)}
                    placeholder="实际收到的硬币金额"
                    className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>

                {(actualCash || actualCoins) && (
                  <div className="rounded-lg bg-[#fbf9f5] border border-[#e8e0d4] p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#8c7e6d]">应交</span>
                      <strong>{money(dailyTotals.totalNetPayable)}</strong>
                    </div>
                    <div className="flex justify-between text-sm mt-1">
                      <span className="text-[#8c7e6d]">实收</span>
                      <strong>{money(rawAmount(actualCash) + rawAmount(actualCoins))}</strong>
                    </div>
                    <div className="border-t border-[#e8e0d4] pt-2 mt-2 flex justify-between">
                      <span className="text-sm font-black text-[#3d3028]">差额</span>
                      <strong className={`text-sm font-black ${(rawAmount(actualCash) + rawAmount(actualCoins)) >= dailyTotals.totalNetPayable ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {money(dailyTotals.totalNetPayable - rawAmount(actualCash) - rawAmount(actualCoins))}
                      </strong>
                    </div>
                  </div>
                )}

                <label className="space-y-2 block">
                  <span className="text-sm font-bold text-[#3d3028]">备注</span>
                  <textarea
                    value={settlementNote}
                    onChange={e => setSettlementNote(e.target.value)}
                    rows={2}
                    placeholder="日结备注..."
                    className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleGenerateSettlement}
                  disabled={isGeneratingSettlement || !isOnline}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-[#c8beb0]"
                >
                  {isGeneratingSettlement ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                  生成日结单
                </button>
              </div>
            </div>
          )}

          {lastSubmittedTxId && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs font-bold text-emerald-700 break-all">
              最近提交：{lastSubmittedTxId}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DailyCollectionEntryPage;
