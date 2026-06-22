import { AlertTriangle, CheckCircle2, Loader2, ReceiptText } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useAuth } from '../contexts/AuthContext';
import { useAppData } from '../contexts/DataContext';
import { useMutations } from '../contexts/MutationContext';
import { useToast } from '../contexts/ToastContext';
import type { CollectionSubmissionInput } from '../services/collectionSubmissionService';
import { logFinanceAudit } from '../services/financeAuditService';
import { CONSTANTS, safeRandomUUID, type Location, type Transaction } from '../types';
import { clampCollectionAmount } from '../utils/collectionAmountLimits';

type ReportedStatus = CollectionSubmissionInput['reportedStatus'];

const EXPENSE_CATEGORIES: Array<NonNullable<Transaction['expenseCategory']>> = [
  'fuel',
  'repair',
  'electricity',
  'transport',
  'fine',
  'allowance',
  'salary_advance',
  'office_loan',
  'tip',
  'other',
];

function money(value: number): string {
  return `TZS ${Math.round(value).toLocaleString()}`;
}

function parseAmount(field: Parameters<typeof clampCollectionAmount>[0], value: string): number {
  return clampCollectionAmount(field, value);
}

/** Unclamped numeric parse — used in admin override mode to lift driver safety caps. */
function rawAmount(value: string): number {
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const ManualCollectionEntryPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { drivers, locations, isOnline } = useAppData();
  const { submitManualCollection } = useMutations();
  const { showToast } = useToast();

  const [driverId, setDriverId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [currentScore, setCurrentScore] = useState('');
  const [expenses, setExpenses] = useState('');
  const [expenseType, setExpenseType] = useState<'public' | 'private'>('public');
  const [expenseCategory, setExpenseCategory] = useState<NonNullable<Transaction['expenseCategory']>>('other');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [coinExchange, setCoinExchange] = useState('');
  const [tip, setTip] = useState('');
  const [startupDebtDeduction, setStartupDebtDeduction] = useState('');
  const [isOwnerRetaining, setIsOwnerRetaining] = useState(false);
  const [ownerRetention, setOwnerRetention] = useState('');
  const [reportedStatus, setReportedStatus] = useState<ReportedStatus>('active');
  const [notes, setNotes] = useState('');
  const [adminOverride, setAdminOverride] = useState(false);
  const [lastSubmittedTxId, setLastSubmittedTxId] = useState<string | null>(null);

  const activeDrivers = useMemo(
    () => drivers.filter(driver => driver.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name)),
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

  const selectedLocation = useMemo(
    () => locations.find(location => location.id === locationId) ?? null,
    [locationId, locations],
  );

  const selectedDriver = useMemo(
    () => drivers.find(driver => driver.id === driverId) ?? null,
    [driverId, drivers],
  );

  const assignedDriverName = useMemo(() => {
    if (!selectedLocation?.assignedDriverId) return null;
    return drivers.find(driver => driver.id === selectedLocation.assignedDriverId)?.name ?? selectedLocation.assignedDriverId;
  }, [drivers, selectedLocation]);

  const preview = useMemo(() => {
    const amount = (field: Parameters<typeof clampCollectionAmount>[0], value: string) =>
      adminOverride ? rawAmount(value) : parseAmount(field, value);
    const previousScore = selectedLocation?.lastScore ?? 0;
    const nextScore = amount('currentScore', currentScore);
    // Override lets the reading fall below the previous one (back-entry/correction).
    const diff = adminOverride ? nextScore - previousScore : Math.max(0, nextScore - previousScore);
    const revenue = diff * CONSTANTS.COIN_VALUE_TZS;
    const commission = Math.floor(revenue * (selectedLocation?.commissionRate ?? CONSTANTS.DEFAULT_PROFIT_SHARE));
    const finalOwnerRetention = ownerRetention.trim()
      ? amount('ownerRetention', ownerRetention)
      : commission;
    const expenseAmount = amount('expenses', expenses);
    const tipAmount = amount('tip', tip);
    const debtDeduction = adminOverride
      ? amount('startupDebtDeduction', startupDebtDeduction)
      : Math.min(
          parseAmount('startupDebtDeduction', startupDebtDeduction),
          Math.max(0, selectedLocation?.remainingStartupDebt ?? 0),
        );
    const netPayable = revenue - finalOwnerRetention - expenseAmount - tipAmount + debtDeduction;
    return {
      previousScore,
      nextScore,
      diff,
      revenue,
      commission,
      finalOwnerRetention,
      expenseAmount,
      tipAmount,
      debtDeduction,
      netPayable: adminOverride ? netPayable : Math.max(0, netPayable),
    };
  }, [adminOverride, currentScore, expenses, ownerRetention, selectedLocation, startupDebtDeduction, tip]);

  const resetFormAfterSuccess = (location: Location) => {
    setCurrentScore('');
    setExpenses('');
    setExpenseType('public');
    setExpenseCategory('other');
    setExpenseDescription('');
    setCoinExchange('');
    setTip('');
    setStartupDebtDeduction('');
    setIsOwnerRetaining(false);
    setOwnerRetention('');
    setReportedStatus(location.status === 'maintenance' || location.status === 'broken' ? location.status : 'active');
    setNotes('');
  };

  const handleLocationChange = (nextLocationId: string) => {
    setLocationId(nextLocationId);
    const nextLocation = locations.find(location => location.id === nextLocationId);
    if (!nextLocation) return;
    if (!driverId && nextLocation.assignedDriverId) {
      setDriverId(nextLocation.assignedDriverId);
    }
    setReportedStatus(
      nextLocation.status === 'maintenance' || nextLocation.status === 'broken'
        ? nextLocation.status
        : 'active',
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!isOnline) {
      showToast('快速补录需要联网提交。', 'warning');
      return;
    }
    if (!selectedDriver || !selectedLocation) {
      showToast('请选择司机和机器。', 'warning');
      return;
    }
    if (currentScore.trim() === '' || !Number.isFinite(Number(currentScore.replace(/,/g, '')))) {
      showToast('请输入有效当前读数。', 'warning');
      return;
    }
    if (!adminOverride && preview.nextScore < preview.previousScore) {
      showToast('当前读数低于机器上次读数，请先走清零/异常处理流程，或开启管理员覆写。', 'error');
      return;
    }

    const manualNote = [
      adminOverride
        ? `[admin_override] 管理员 ${currentUser.name}(${currentUser.id}) 覆写补录；放松司机规则（读数/金额上限），无照片/GPS验证。`
        : `[admin_manual_entry] 管理员 ${currentUser.name}(${currentUser.id}) 快速补录；无照片/GPS验证。`,
      notes.trim() || null,
    ].filter(Boolean).join(' ');

    const input: CollectionSubmissionInput = {
      txId: `TX-${safeRandomUUID()}`,
      locationId: selectedLocation.id,
      driverId: selectedDriver.id,
      currentScore: preview.nextScore,
      expenses: preview.expenseAmount,
      tip: preview.tipAmount,
      startupDebtDeduction: preview.debtDeduction,
      isOwnerRetaining,
      ownerRetention: ownerRetention.trim() ? preview.finalOwnerRetention : null,
      coinExchange: adminOverride ? rawAmount(coinExchange) : parseAmount('coinExchange', coinExchange),
      gps: null,
      photoUrl: null,
      aiScore: null,
      anomalyFlag: false,
      notes: manualNote,
      expenseType: preview.expenseAmount > 0 ? expenseType : null,
      expenseCategory: preview.expenseAmount > 0 ? expenseCategory : null,
      expenseDescription: preview.expenseAmount > 0 ? expenseDescription.trim() || undefined : undefined,
      reportedStatus,
    };

    try {
      const transaction = await submitManualCollection.mutateAsync(input);
      setLastSubmittedTxId(transaction.id);
      if (adminOverride) {
        logFinanceAudit({
          event_type: 'admin_override_entry',
          entity_type: 'location',
          entity_id: selectedLocation.id,
          entity_name: selectedLocation.name,
          actor_id: currentUser.id,
          old_value: selectedLocation.lastScore,
          new_value: preview.nextScore,
          payload: {
            txId: transaction.id,
            driverId: selectedDriver.id,
            revenue: preview.revenue,
            ownerRetention: preview.finalOwnerRetention,
            note: notes.trim() || undefined,
          },
        });
      }
      showToast(adminOverride ? '管理员覆写补录已提交。' : '快速补录已提交。', 'success');
      resetFormAfterSuccess(selectedLocation);
    } catch (error) {
      const message = error instanceof Error ? error.message : '快速补录失败';
      showToast(message, 'error');
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-5">
      <div className="bg-white border border-[#e0d8cc] rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#171310]">司机工作快速补录</h2>
            <p className="text-sm text-[#8c7e6d] mt-1">管理员代录收款信息，跳过照片和 GPS，但保留服务端财务计算与备注审计。</p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {isOnline ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {isOnline ? '在线可提交' : '离线不可补录'}
          </div>
        </div>
        <div className={`mt-4 flex items-start justify-between gap-3 rounded-xl border p-3 ${adminOverride ? 'border-rose-200 bg-rose-50' : 'border-[#e0d8cc] bg-[#f3efe8]'}`}>
          <div>
            <p className={`text-sm font-black ${adminOverride ? 'text-rose-700' : 'text-[#3d3028]'}`}>管理员覆写 Admin Override</p>
            <p className="text-xs text-[#8c7e6d] mt-0.5">
              开启后放松司机规则：允许读数低于上次、取消金额上限。每笔覆写都会记入审计。服务端财务仍按机器配置重新计算。
            </p>
          </div>
          <button
            type="button"
            aria-pressed={adminOverride}
            onClick={() => setAdminOverride(v => !v)}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${adminOverride ? 'bg-rose-500' : 'bg-[#c0b0a0]'}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${adminOverride ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        <div className="bg-white border border-[#e0d8cc] rounded-xl p-5 shadow-sm space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">司机</span>
              <select
                value={driverId}
                onChange={event => setDriverId(event.target.value)}
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">选择司机</option>
                {activeDrivers.map(driver => (
                  <option key={driver.id} value={driver.id}>{driver.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">机器/网点</span>
              <select
                value={locationId}
                onChange={event => handleLocationChange(event.target.value)}
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">选择机器</option>
                {sortedLocations.map(location => (
                  <option key={location.id} value={location.id}>
                    {location.name} · {location.machineId || '无编号'}
                  </option>
                ))}
              </select>
              {assignedDriverName && (
                <p className="text-xs font-bold text-[#8c7e6d]">当前分配司机：{assignedDriverName}</p>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">上次读数</span>
              <input
                value={selectedLocation ? selectedLocation.lastScore.toLocaleString() : ''}
                readOnly
                className="w-full rounded-lg border border-[#e0d8cc] bg-[#f3efe8] px-3 py-2 text-sm font-bold text-[#7a6e5e]"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">当前读数</span>
              <input
                inputMode="numeric"
                value={currentScore}
                onChange={event => setCurrentScore(event.target.value)}
                placeholder="例如 12800"
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">机器状态</span>
              <select
                value={reportedStatus}
                onChange={event => setReportedStatus(event.target.value as ReportedStatus)}
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
                value={expenses}
                onChange={event => setExpenses(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">零钱兑换</span>
              <input
                inputMode="numeric"
                value={coinExchange}
                onChange={event => setCoinExchange(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">小费/现场扣款</span>
              <input
                inputMode="numeric"
                value={tip}
                onChange={event => setTip(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
          </div>

          {preview.expenseAmount > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="space-y-2">
                <span className="text-sm font-black text-[#3d3028]">支出类型</span>
                <select
                  value={expenseType}
                  onChange={event => setExpenseType(event.target.value as 'public' | 'private')}
                  className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="public">公司成本</option>
                  <option value="private">司机借支</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-black text-[#3d3028]">支出分类</span>
                <select
                  value={expenseCategory}
                  onChange={event => setExpenseCategory(event.target.value as NonNullable<Transaction['expenseCategory']>)}
                  className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#2a2420] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {EXPENSE_CATEGORIES.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-black text-[#3d3028]">支出说明</span>
                <input
                  value={expenseDescription}
                  onChange={event => setExpenseDescription(event.target.value)}
                  placeholder="可选"
                  className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">商户债务扣回</span>
              <input
                inputMode="numeric"
                value={startupDebtDeduction}
                onChange={event => setStartupDebtDeduction(event.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-black text-[#3d3028]">店主留存金额</span>
              <input
                inputMode="numeric"
                value={ownerRetention}
                onChange={event => setOwnerRetention(event.target.value)}
                placeholder={`默认 ${money(preview.commission)}`}
                className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>
            <label className="flex items-end gap-3 rounded-lg border border-[#e0d8cc] bg-[#f3efe8] px-3 py-3">
              <input
                type="checkbox"
                checked={isOwnerRetaining}
                onChange={event => setIsOwnerRetaining(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-[#c8beb0] text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-black text-[#3d3028]">计入店主分红余额</span>
            </label>
          </div>

          <label className="space-y-2 block">
            <span className="text-sm font-black text-[#3d3028]">备注</span>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
              placeholder="补录原因、纸质记录编号或异常说明"
              className="w-full rounded-lg border border-[#e0d8cc] bg-white px-3 py-2 text-sm font-bold text-[#171310] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-[#e8e0d4] pt-4">
            <p className="text-xs font-bold text-[#8c7e6d]">
              提交后会写入收款交易并更新机器 lastScore；该入口不会上传照片或 GPS。
            </p>
            <button
              type="submit"
              disabled={!isOnline || submitManualCollection.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-[#c8beb0]"
            >
              {submitManualCollection.isPending ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
              提交快速补录
            </button>
          </div>
        </div>

        <aside className="bg-white border border-[#e0d8cc] rounded-xl p-5 shadow-sm h-fit space-y-4">
          <div>
            <h3 className="text-sm font-black text-[#171310]">服务端计算预览</h3>
            <p className="text-xs font-bold text-[#8c7e6d] mt-1">最终金额以 RPC 返回为准。</p>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-[#8c7e6d]">分数差</span><strong className="text-[#171310]">{preview.diff.toLocaleString()}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[#8c7e6d]">营业额</span><strong className="text-[#171310]">{money(preview.revenue)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[#8c7e6d]">默认分成</span><strong className="text-[#171310]">{money(preview.commission)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[#8c7e6d]">店主留存</span><strong className="text-[#171310]">{money(preview.finalOwnerRetention)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[#8c7e6d]">支出</span><strong className="text-[#171310]">{money(preview.expenseAmount)}</strong></div>
            <div className="flex justify-between gap-3"><span className="text-[#8c7e6d]">债务扣回</span><strong className="text-[#171310]">{money(preview.debtDeduction)}</strong></div>
            <div className="border-t border-[#e8e0d4] pt-3 flex justify-between gap-3">
              <span className="text-[#3d3028] font-black">预计应交</span>
              <strong className="text-emerald-700">{money(preview.netPayable)}</strong>
            </div>
          </div>
          {lastSubmittedTxId && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs font-bold text-emerald-700 break-all">
              最近提交：{lastSubmittedTxId}
            </div>
          )}
        </aside>
      </form>
    </div>
  );
};

export default ManualCollectionEntryPage;
