import { CheckCircle2, Banknote, ThumbsUp, AlertTriangle } from 'lucide-react';
import React, { useState, useMemo } from 'react';

import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { Transaction, Driver, Location, DailySettlement, User as UserType, TRANSLATIONS } from '../../types';

import AdminApprovalTaskList from './AdminApprovalTaskList';
import { useAnomalyScanResults } from './hooks/useAnomalyScanResults';
import {
  ApprovalTask,
  buildApprovalTasks,
} from './settlementApprovalTasks';

const pill = 'inline-flex items-center rounded-full px-2 py-1 text-caption font-bold uppercase tracking-wide';

interface PayrollEntry {
  driver: Driver;
  monthlyBreakdown: {
    month: string;
    totalRevenue: number;
    commission: number;
    loans: number;
    shortage: number;
    netPayout: number;
  }[];
}

interface SettlementTabProps {
  isAdmin: boolean;
  unsyncedCollectionsCount: number;
  transactions: Transaction[];
  pendingSettlements: DailySettlement[];
  settlementsForSubmissionGuard: DailySettlement[];
  pendingExpenses: Transaction[];
  anomalyTransactions: Transaction[];
  pendingResetRequests: Transaction[];
  pendingPayoutRequests: Transaction[];
  payrollStats: PayrollEntry[];
  driverMap: Map<string, Driver>;
  locationMap: Map<string, Location>;
  todayDriverTxs: Transaction[];
  myProfile: Driver | undefined;
  currentUser: UserType;
  activeDriverId: string;
  todayStr: string;
  onCreateSettlement: (settlement: DailySettlement) => Promise<void>;
  onReviewSettlement: (settlementId: string, status: 'confirmed' | 'rejected') => Promise<void>;
  onApproveExpenseRequest: (txId: string, approve: boolean) => Promise<void>;
  onReviewAnomalyTransaction: (txId: string, approve: boolean) => Promise<void>;
  onApproveResetRequest: (txId: string, approve: boolean) => Promise<void>;
  onApprovePayoutRequest: (txId: string, approve: boolean) => Promise<void>;
  isOnline: boolean;
  lang: 'zh' | 'sw';
  onNavigate?: (view: string) => void;
}

const SettlementTab: React.FC<SettlementTabProps> = ({
  isAdmin,
  unsyncedCollectionsCount,
  transactions,
  pendingSettlements,
  settlementsForSubmissionGuard,
  pendingExpenses,
  anomalyTransactions,
  pendingResetRequests,
  pendingPayoutRequests,
  payrollStats: _payrollStats,
  driverMap: _driverMap,
  locationMap,
  todayDriverTxs,
  myProfile,
  currentUser,
  activeDriverId,
  todayStr,
  onCreateSettlement,
  onReviewSettlement,
  onApproveExpenseRequest,
  onReviewAnomalyTransaction,
  onApproveResetRequest,
  onApprovePayoutRequest,
  isOnline,
  lang,
  onNavigate,
}) => {
  const t = TRANSLATIONS[lang];
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [actualCash, setActualCash] = useState<string>('');
  const [actualCoins, setActualCoins] = useState<string>('');
  const [expenseItems, setExpenseItems] = useState<Array<{ amount: string; category: string; note: string; photoUrl?: string }>>([]);
  const [pendingActionKey, setPendingActionKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const scanResults = useAnomalyScanResults(isAdmin, anomalyTransactions, lang);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');
  const myPendingSettlements = pendingSettlements
    .filter(settlement => settlement.driverId === activeDriverId && settlement.status === 'pending')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const overduePendingSettlements = myPendingSettlements.filter((settlement) => settlement.date < todayStr);
  const overduePendingAmount = overduePendingSettlements.reduce((sum, settlement) => sum + settlement.expectedTotal, 0);
  const collectionCountByDriverDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type !== 'collection' || !tx.driverId || !tx.timestamp) continue;
      const key = `${tx.driverId}:${tx.timestamp.slice(0, 10)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [transactions]);

  // Block duplicate submissions: if a settlement already exists for today
  // (pending or confirmed), the driver should not be able to submit another one.
  const hasSubmittedToday = settlementsForSubmissionGuard.some(
    (settlement) =>
      settlement.driverId === activeDriverId &&
      settlement.date === todayStr &&
      (settlement.status === 'pending' || settlement.status === 'confirmed'),
  );

  const cashAmount = parseInt(actualCash) || 0;
  const coinAmount = parseInt(actualCoins) || 0;
  const settlementExpenseValue = expenseItems.reduce((sum, e) => sum + (parseInt(e.amount) || 0), 0);
  const totalRevenue = todayDriverTxs.reduce((sum, tx) => sum + tx.revenue, 0);
  const baseExpenses = todayDriverTxs.reduce((sum, tx) => sum + tx.expenses, 0);
  const totalNet = todayDriverTxs.reduce((sum, tx) => sum + tx.netPayable, 0);
  const expectedTotal = Math.max(0, totalNet - settlementExpenseValue);
  const submittedTotal = cashAmount + coinAmount;
  const varianceAmount = submittedTotal - expectedTotal;
  const hasSettlementInput = actualCash.trim() !== '' || actualCoins.trim() !== '' || expenseItems.length > 0;

  const runApprovalAction = async (actionKey: string, action: () => Promise<void>) => {
    if (!isOnline) {
      showToast(
        lang === 'zh'
          ? '当前处于离线状态，审批操作需要联网才能进行。'
          : 'You are offline. Approval actions require an internet connection.',
        'warning',
      );
      return;
    }
    setPendingActionKey(actionKey);
    try {
      await action();
    } catch (error) {
      console.error('Approval action failed.', error);
      showToast(t.approvalFailed, 'error');
    } finally {
      setPendingActionKey(current => (current === actionKey ? null : current));
    }
  };

  const approvalTasks = useMemo<ApprovalTask[]>(() => {
    return buildApprovalTasks(
      lang,
      pendingSettlements,
      anomalyTransactions,
      pendingResetRequests,
      pendingExpenses,
      pendingPayoutRequests,
    );
  }, [lang, pendingSettlements, anomalyTransactions, pendingResetRequests, pendingExpenses, pendingPayoutRequests]);

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4">
      {isAdmin ? (
        <AdminApprovalTaskList
          approvalTasks={approvalTasks}
          pendingSettlementsCount={pendingSettlements.length}
          anomalyTransactionsCount={anomalyTransactions.length}
          pendingResetRequestsCount={pendingResetRequests.length}
          pendingExpensesCount={pendingExpenses.length}
          pendingPayoutRequestsCount={pendingPayoutRequests.length}
          collectionCountByDriverDate={collectionCountByDriverDate}
          scanResults={scanResults}
          locationMap={locationMap}
          expandedKey={expandedKey}
          pendingActionKey={pendingActionKey}
          isOnline={isOnline}
          lang={lang}
          onToggleTask={(taskKey) => setExpandedKey(current => (current === taskKey ? null : taskKey))}
          runApprovalAction={runApprovalAction}
          onReviewSettlement={onReviewSettlement}
          onApproveExpenseRequest={onApproveExpenseRequest}
          onReviewAnomalyTransaction={onReviewAnomalyTransaction}
          onApproveResetRequest={onApproveResetRequest}
          onApprovePayoutRequest={onApprovePayoutRequest}
        />
      ) : (
        // Driver view: Today's Settlement
        <div className="space-y-4 animate-in zoom-in-95">
          {unsyncedCollectionsCount > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
              <p className="text-caption font-black uppercase tracking-[0.18em]">
                {lang === 'zh' ? '待同步提醒' : 'Sync Reminder'}
              </p>
              <p className="mt-1 text-[11px] font-bold leading-relaxed">
                {lang === 'zh'
                  ? `当前还有 ${unsyncedCollectionsCount} 条收款记录待同步，最新汇总可能还未完全计入。`
                  : `${unsyncedCollectionsCount} collection records are still waiting to sync, so the latest totals may not be final yet.`}
              </p>
            </div>
          )}

          {myPendingSettlements.length > 0 && (
            <div className="bg-amber-50 p-4 rounded-3xl border border-amber-100 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">
                    {lang === 'zh' ? '待审批结算' : 'Pending Settlements'}
                  </h3>
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.18em]">
                    {myPendingSettlements.length} {t.pendingApproval}
                  </p>
                </div>
                <div className={`${pill} bg-white text-amber-700 border border-amber-200`}>
                  {myPendingSettlements.length}
                </div>
              </div>
              <div className="space-y-2">
                {myPendingSettlements.map(settlement => {
                  const submittedTotal = settlement.actualCash + settlement.actualCoins;
                  const variance = settlement.shortage;
                  return (
                    <div key={settlement.id} className="rounded-2xl border border-amber-200 bg-white/90 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold text-[#171310] uppercase">
                            {new Date(settlement.timestamp).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB')}
                          </p>
                          <p className="text-caption font-bold text-[#a09080] uppercase">
                            {new Date(settlement.timestamp).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <div className={`${pill} bg-amber-100 text-amber-700`}>
                          {t.pendingApproval}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-[#f3efe8] p-2">
                          <p className="text-caption font-black uppercase text-[#a09080]">{t.expectedTotalLabel}</p>
                          <p className="text-caption font-black text-[#171310]">TZS {settlement.expectedTotal.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 p-2">
                          <p className="text-caption font-black uppercase text-amber-400">
                            {lang === 'zh' ? '已提交' : 'Submitted'}
                          </p>
                          <p className="text-caption font-black text-amber-700">TZS {submittedTotal.toLocaleString()}</p>
                        </div>
                        <div className={`rounded-xl p-2 ${variance === 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                          <p className={`text-caption font-black uppercase ${variance === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {t.varianceLabel}
                          </p>
                          <p className={`text-caption font-black ${variance === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            TZS {Math.abs(variance).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {overduePendingSettlements.length > 0 && (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 space-y-3">
              <div>
                <p className="text-sm font-black text-rose-900 uppercase tracking-tight">
                  {t.overdueSettlementAlert}
                </p>
                <p className="mt-1 text-[11px] font-bold text-rose-600 leading-relaxed">
                  {lang === 'zh'
                    ? '昨日及更早提交的结账还在等待管理员确认，今天提交前请一并核对。'
                    : 'Older settlement submissions are still waiting for admin approval. Review them before closing today.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/90 p-3 border border-rose-100">
                  <p className="text-caption font-black uppercase text-rose-400">
                    {t.overdueSettlementCountLabel}
                  </p>
                  <p className="text-sm font-black text-rose-700">
                    {overduePendingSettlements.length.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/90 p-3 border border-rose-100">
                  <p className="text-caption font-black uppercase text-rose-400">
                    {t.overdueSettlementAmountLabel}
                  </p>
                  <p className="text-sm font-black text-rose-700">
                    TZS {overduePendingAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white p-4 md:p-6 rounded-3xl border border-[#e0d8cc] space-y-4">
            {hasSubmittedToday ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mx-auto mb-4 border border-emerald-100">
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-xl font-black text-[#2a2420] uppercase tracking-tight">
                  {lang === 'zh' ? '今日已提交结算' : 'Settlement Submitted Today'}
                </h2>
                <p className="text-[10px] font-bold text-[#a09080] uppercase tracking-[0.2em] mt-2">
                  {lang === 'zh' ? '等待主管审批，今日不可重复提交。' : 'Awaiting supervisor approval. No duplicate submission allowed today.'}
                </p>
              </div>
            ) : todayDriverTxs.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-[#f3efe8] rounded-2xl flex items-center justify-center text-[#c0b0a0] mx-auto mb-4 border border-[#e0d8cc]">
                  <Banknote size={32} />
                </div>
                <h2 className="text-lg font-black text-[#8c7e6d] uppercase tracking-tight">
                  {lang === 'zh' ? '今日暂无收款记录' : 'No Collections Today'}
                </h2>
                <p className="text-caption font-bold text-[#a09080] mt-2 max-w-xs mx-auto">
                  {lang === 'zh'
                    ? '请先前往 HARAKA 或 COLLECT 完成机器收款，再回到此页进行日结。'
                    : 'Go to HARAKA or COLLECT first to submit machine readings, then come back here for settlement.'}
                </p>
                <div className="mt-4 flex gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => onNavigate?.('quick')}
                    className="px-5 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-black uppercase shadow-sm hover:bg-amber-700 transition-colors"
                  >
                    {lang === 'zh' ? '去 HARAKA 收款 →' : 'Go to HARAKA →'}
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div className="text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 mx-auto mb-4 border border-amber-100">
              <Banknote size={40} />
            </div>
            <h2 className="text-xl font-black text-[#2a2420] uppercase tracking-tight">{t.dailySettlement}</h2>
                <p className="text-[10px] font-bold text-[#a09080] uppercase tracking-[0.2em] mt-2">{todayStr} • {todayDriverTxs.length} {t.collectionsCount}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#f3efe8] p-4 rounded-2xl border border-[#e8e0d4]">
                <p className="text-caption font-black text-[#a09080] uppercase mb-1 tracking-widest">{t.revenue}</p>
                <p className="text-xl font-black text-[#2a2420]">TZS {totalRevenue.toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100">
                <p className="text-caption font-black text-amber-400 uppercase mb-1 tracking-widest">{t.cashInHand}</p>
                <p className="text-xl font-black text-amber-700">TZS {totalNet.toLocaleString()}</p>
              </div>
            </div>

            {/* ── 每日收款对账单 (Daily Invoice) ────────────────────── */}
            {todayDriverTxs.length > 0 && (
              <div className="rounded-2xl border border-[#e0d8cc] bg-[#fbf9f5] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsInvoiceOpen(open => !open)}
                  className="w-full flex items-center justify-between gap-3 p-4 bg-[#f3efe8] hover:bg-[#ebdcc8] transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">🧾</span>
                    <div>
                      <h3 className="text-sm font-black text-[#2a2420] uppercase tracking-tight">
                        {t.dailyInvoiceTitle}
                      </h3>
                      <p className="text-[10px] font-bold uppercase text-[#a09080] tracking-wide">
                        {t.dailyInvoiceDesc} ({todayDriverTxs.length})
                      </p>
                    </div>
                  </div>
                  <span className="text-[#a09080] font-black text-sm flex-shrink-0">
                    {isInvoiceOpen ? '▲' : '▼'}
                  </span>
                </button>

                {isInvoiceOpen && (
                  <div className="p-3 space-y-3 animate-in slide-in-from-top-2">
                    {todayDriverTxs.map((tx) => {
                      const loc = locationMap.get(tx.locationId);
                      const diff = (tx.currentScore ?? 0) - (tx.previousScore ?? 0);
                      const status = loc?.status ?? 'active';
                      const statusColor =
                        status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : status === 'broken'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : status === 'maintenance'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200';
                      const isEditing = editingTxId === tx.id;
                      return (
                        <div key={tx.id} className="rounded-2xl border border-[#e0d8cc] bg-white p-3 space-y-2">
                          {/* Header: machine name + status switch */}
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-[#2a2420] min-w-0 truncate">
                              {loc?.name ?? tx.locationName ?? tx.locationId.slice(0, 8)}
                              {loc?.machineId ? ` • ${loc.machineId}` : ''}
                            </p>
                            <select
                              aria-label={t.machineStatus}
                              value={status}
                              onChange={() => { /* wired to updateLocations in Task 4 */ }}
                              className={`text-[10px] font-bold px-2 py-1 rounded-xl border focus:outline-none flex-shrink-0 ${statusColor}`}
                            >
                              <option value="active">{lang === 'zh' ? '🟢 运行中' : '🟢 Active'}</option>
                              <option value="maintenance">{lang === 'zh' ? '🟡 维护中' : '🟡 Matengenezo'}</option>
                              <option value="broken">{lang === 'zh' ? '🔴 故障中' : '🔴 Imeharibika'}</option>
                              <option value="inactive">{lang === 'zh' ? '⚫ 未启用' : '⚫ Imefungwa'}</option>
                            </select>
                          </div>

                          {/* Meter comparison */}
                          <div className="grid grid-cols-2 gap-2 bg-[#fdfcfb] rounded-xl p-2 border border-[#f3efe8] text-caption font-bold text-[#8c7e6d]">
                            <div>
                              {t.previousMetra}: <span className="font-extrabold text-[#2a2420]">{tx.previousScore ?? 0}</span>
                            </div>
                            <div>
                              {t.currentMetra}: <span className="font-extrabold text-[#2a2420]">{tx.currentScore ?? 0}</span>
                            </div>
                            <div className="col-span-2 border-t border-[#f3efe8] pt-1 flex justify-between items-center">
                              <span>
                                {t.metraDiff}:{' '}
                                <span className="font-black text-amber-700">
                                  {diff >= 0 ? '+' : ''}{diff} {lang === 'zh' ? '币' : 'sarafu'}
                                </span>
                              </span>
                              <span className="font-black text-[#171310]">
                                TZS {(tx.revenue ?? 0).toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Notes block */}
                          <div className="border-t border-dashed border-[#e0d8cc] pt-2">
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  value={tempNotes}
                                  onChange={e => setTempNotes(e.target.value)}
                                  rows={2}
                                  maxLength={200}
                                  placeholder={t.writeNotesPlaceholder}
                                  className="w-full text-xs p-2 border border-[#ebdcc8] rounded-xl outline-none focus:ring-1 focus:ring-amber-500 bg-amber-50/20 font-bold"
                                />
                                <div className="flex justify-end gap-2 text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() => setEditingTxId(null)}
                                    className="px-2.5 py-1 text-gray-500 font-bold uppercase"
                                  >
                                    {lang === 'zh' ? '取消' : 'Futa'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setEditingTxId(null); }}
                                    className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg uppercase"
                                  >
                                    {t.saveChanges}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3 text-caption font-bold">
                                <p className="text-gray-500 leading-relaxed italic pr-4 min-w-0">
                                  {tx.notes ? `"${tx.notes}"` : (lang === 'zh' ? '无工作备注' : 'Bila maelezo')}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => { setEditingTxId(tx.id); setTempNotes(tx.notes ?? ''); }}
                                  className="text-amber-700 hover:text-amber-800 flex-shrink-0 font-extrabold flex items-center gap-1"
                                >
                                  <span aria-hidden="true">✍️</span> {t.editDailyNotes}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="rounded-2xl border border-[#e0d8cc] bg-[#f3efe8] px-4 py-3">
              <p className="text-caption font-black uppercase tracking-[0.18em] text-[#8c7e6d]">
                {lang === 'zh' ? '日结提交后会发生什么' : 'What happens after settlement submit'}
              </p>
              <div className="mt-2 space-y-1.5 text-caption font-bold leading-relaxed text-[#7a6e5e]">
                <p>
                  {lang === 'zh'
                    ? '1. 今日普通收款仍先保持“待结清”。'
                    : '1. Today’s normal collections stay pending first.'}
                </p>
                <p>
                  {lang === 'zh'
                    ? '2. 管理员确认后，今日收款才会更新为已结清。'
                    : '2. They become settled only after admin confirms the settlement.'}
                </p>
                <p>
                  {lang === 'zh'
                    ? '3. 实收硬币会变成司机次日流动硬币；短款/长款会保留在本次日结结果里。'
                    : '3. Submitted coins become the driver’s next-day float, while shortage/surplus stays recorded on this settlement.'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-[#f3efe8] p-5 rounded-2xl border border-[#e8e0d4]">
                <label className="text-caption font-black text-[#8c7e6d] uppercase block mb-3 tracking-widest text-center">{t.inputCash} (TZS {t.notesUnit})</label>
                <input
                  type="number"
                  min={0}
                  value={actualCash}
                  onChange={e => setActualCash(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full text-4xl font-black bg-transparent text-center outline-none text-[#2a2420] placeholder:text-[#c0b0a0]"
                  placeholder="0"
                />
              </div>
              <div className="bg-[#f3efe8] p-5 rounded-2xl border border-[#e8e0d4]">
                <label className="text-caption font-black text-[#8c7e6d] uppercase block mb-3 tracking-widest text-center">{t.inputCoins} (TZS {t.coinsUnitLabel})</label>
                <input
                  type="number"
                  min={0}
                  value={actualCoins}
                  onChange={e => setActualCoins(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full text-4xl font-black bg-transparent text-center outline-none text-[#2a2420] placeholder:text-[#c0b0a0]"
                  placeholder="0"
                />
              </div>
            </div>

            {expenseItems.map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-caption font-black uppercase tracking-[0.18em] text-rose-500">
                    {t.settlementExpenseLabel} #{idx + 1}
                  </p>
                  <button onClick={() => setExpenseItems(prev => prev.filter((_, i) => i !== idx))}
                    className="text-caption font-black text-rose-400">×</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-caption font-bold uppercase text-rose-500">{t.settlementExpenseCategoryLabel}</span>
                    <select value={item.category}
                      onChange={e => setExpenseItems(prev => prev.map((it,i) => i===idx ? {...it, category: e.target.value} : it))}
                      className="w-full rounded-btn border border-rose-200 bg-white px-3 py-2 text-[11px] font-bold uppercase text-rose-700">
                      <option value="fuel">{t.fuelLabel}</option>
                      <option value="repair">{t.repairLabel}</option>
                      <option value="electricity">{t.electricityLabel}</option>
                      <option value="transport">{t.transportLabel}</option>
                      <option value="allowance">{t.allowanceLabel}</option>
                      <option value="other">{t.otherLabel}</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-caption font-bold uppercase text-rose-500">{t.settlementExpenseAmountLabel}</span>
                    <input type="number" min={0} value={item.amount}
                      onChange={e => setExpenseItems(prev => prev.map((it,i) => i===idx ? {...it, amount: e.target.value.replace(/[^0-9]/g,'')} : it))}
                      placeholder="0" className="w-full rounded-btn border border-rose-200 bg-white px-3 py-2 text-sm font-black text-rose-900" />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-caption font-bold uppercase text-rose-500">{t.settlementExpenseNoteLabel}</span>
                  <textarea value={item.note} rows={2} maxLength={120}
                    onChange={e => setExpenseItems(prev => prev.map((it,i) => i===idx ? {...it, note: e.target.value} : it))}
                    className="w-full rounded-btn border border-rose-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-900" />
                </label>
              </div>
            ))}
            <button onClick={() => setExpenseItems(prev => [...prev, { amount: '', category: 'fuel', note: '' }])}
              className="w-full py-3 border-2 border-dashed border-rose-200 rounded-2xl text-caption font-black uppercase text-rose-400">
              + {lang === 'zh' ? '添加支出' : 'Add Expense'}
            </button>

            {hasSettlementInput && (
              <div className={`p-4 rounded-2xl flex justify-between items-center animate-in slide-in-from-top-4 border ${varianceAmount === 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                <div>
                  <p className={`text-caption font-black uppercase ${varianceAmount === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.varianceLabel}</p>
                  <p className={`text-2xl font-black ${varianceAmount === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>TZS {varianceAmount.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption font-black uppercase text-[#a09080]">
                    {t.expectedTotalLabel}
                  </p>
                  <p className="text-sm font-black text-[#171310]">TZS {expectedTotal.toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-2xl bg-white ${varianceAmount === 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {varianceAmount === 0 ? <ThumbsUp size={32} /> : <AlertTriangle size={32} />}
                </div>
              </div>
            )}

            <button
              disabled={!hasSettlementInput || pendingActionKey === 'driver:settlement-submit'}
              onClick={async () => {
                const ok = await confirm({
                  title: lang === 'zh' ? '确认提交日结' : 'Confirm Settlement',
                  message: lang === 'zh'
                    ? `今日营收 TZS ${totalRevenue.toLocaleString()}\n应缴现金 TZS ${totalNet.toLocaleString()}\n实收现金 TZS ${cashAmount.toLocaleString()}\n实收硬币 TZS ${coinAmount.toLocaleString()}\n\n差额 TZS ${varianceAmount.toLocaleString()}${varianceAmount < 0 ? ' (短款)' : varianceAmount > 0 ? ' (盈余)' : ''}\n\n提交后不可撤销，确认？`
                    : `Revenue TZS ${totalRevenue.toLocaleString()}\nNet Payable TZS ${totalNet.toLocaleString()}\nActual Cash TZS ${cashAmount.toLocaleString()}\nActual Coins TZS ${coinAmount.toLocaleString()}\n\nVariance TZS ${varianceAmount.toLocaleString()}${varianceAmount < 0 ? ' (Short)' : varianceAmount > 0 ? ' (Surplus)' : ''}\n\nSubmit now? Cannot undo.`,
                  confirmLabel: lang === 'zh' ? '确认提交' : 'Submit',
                  cancelLabel: lang === 'zh' ? '取消' : 'Cancel',
                });
                if (!ok) return;
                setPendingActionKey('driver:settlement-submit');
                const actual = submittedTotal;
                const settlement: DailySettlement = {
                  id: `STL-${Date.now()}`,
                  date: todayStr,
                  driverId: activeDriverId,
                  driverName: currentUser.name,
                  totalRevenue,
                  totalNetPayable: totalNet,
                  totalExpenses: baseExpenses + settlementExpenseValue,
                  driverFloat: myProfile?.dailyFloatingCoins || 0,
                  expectedTotal,
                  expenseItems: expenseItems.map(e => ({
                    amount: parseInt(e.amount) || 0,
                    category: e.category as any,
                    note: e.note || undefined,
                    photoUrl: e.photoUrl || undefined,
                  })),
                  actualCash: cashAmount,
                  actualCoins: coinAmount,
                  shortage: actual - expectedTotal,
                  status: 'pending',
                  timestamp: new Date().toISOString(),
                  isSynced: false,
                };
                try {
                  await onCreateSettlement(settlement);
                  showToast(lang === 'zh' ? '结算已提交，等待审批。' : 'Settlement submitted. Waiting for approval.', 'success');
                  setActualCash('');
                  setActualCoins('');
                  setExpenseItems([]);
                } catch (error) {
                  console.error('Settlement submission failed.', error);
                  showToast(t.settlementSubmitFailed, 'error');
                } finally {
                  setPendingActionKey(current => (current === 'driver:settlement-submit' ? null : current));
                }
              }}
              className="w-full py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-sm transition-all disabled:opacity-30"
            >
              ✓ {t.settlementSubmitCta}
            </button>
            </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(SettlementTab);
