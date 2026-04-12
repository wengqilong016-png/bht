import { ArrowRight, HandCoins, Banknote, Coins, Trophy, ChevronRight, ShieldAlert } from 'lucide-react';
import React from 'react';

import { Location, TRANSLATIONS, Transaction } from '../../types';

import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import WizardStepBar from './WizardStepBar';


import type { FinanceCalculationSource } from '../../services/financeCalculator';

// Tip anomaly thresholds: warn if tip > TIP_WARNING_THRESHOLD and revenue < REVENUE_WARNING_THRESHOLD
const TIP_WARNING_THRESHOLD = 2000;
const REVENUE_WARNING_THRESHOLD = 40000;

interface FinanceSummaryProps {
  selectedLocation: Location;
  lang: 'zh' | 'sw';
  currentScore: string;
  expenses: string;
  expenseType: 'public' | 'private';
  expenseCategory: Transaction['expenseCategory'];
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  startupDebtDeduction: string;
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
  onUpdateExpenses: (val: string) => void;
  onUpdateExpenseType: (val: 'public' | 'private') => void;
  onUpdateExpenseCategory: (val: Transaction['expenseCategory']) => void;
  onUpdateExpenseDescription: (val: string) => void;
  expenseDescription: string;
  onUpdateCoinExchange: (val: string) => void;
  onUpdateOwnerRetention: (val: string) => void;
  onUpdateIsOwnerRetaining: (val: boolean) => void;
  onUpdateTip: (val: string) => void;
  onUpdateStartupDebtDeduction: (val: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSwitchMachine?: () => void;
  previewSource?: FinanceCalculationSource;
  nextMachine?: Location | null;
  pendingCount?: number;
}

const FinanceSummary: React.FC<FinanceSummaryProps> = ({
  selectedLocation, lang, currentScore, expenses, expenseType, expenseCategory,
  coinExchange, ownerRetention, isOwnerRetaining, tip, startupDebtDeduction, calculations,
  onUpdateExpenses, onUpdateExpenseType, onUpdateExpenseCategory, onUpdateExpenseDescription, expenseDescription,
  onUpdateCoinExchange, onUpdateOwnerRetention, onUpdateIsOwnerRetaining, onUpdateTip, onUpdateStartupDebtDeduction,
  onNext, onBack, onSwitchMachine, previewSource, nextMachine, pendingCount,
}) => {
  const t = TRANSLATIONS[lang];
  const isTipExpense = expenseCategory === 'tip';
  const displayedExpenseValue = isTipExpense ? tip : expenses;
  const currentDividendBalance = Number(selectedLocation.dividendBalance || 0);
  const projectedDividendBalance = currentDividendBalance + calculations.finalRetention;
  const shouldShowComputedOwnerAmount =
    ownerRetention === '' || (ownerRetention === '0' && calculations.commission > 0);
  const displayedOwnerAmount = shouldShowComputedOwnerAmount
    ? String(calculations.commission)
    : ownerRetention;
  const parsedCurrentScore = parseInt(currentScore, 10);
  const hasNumericScore = !isNaN(parsedCurrentScore);
  const isScoreBelowLastReading = hasNumericScore && parsedCurrentScore < (selectedLocation?.lastScore ?? 0);
  const expenseAmount = parseInt(displayedExpenseValue, 10) || 0;
  const nextDividendBalance = isOwnerRetaining ? projectedDividendBalance : currentDividendBalance;

  return (
    <div className="max-w-md mx-auto py-2.5 px-3 pb-24 animate-in fade-in space-y-2.5">
      <WizardStepBar current="amounts" lang={lang} />

      <CollectionWorkbenchHeader
        selectedLocation={selectedLocation}
        lang={lang}
        onBack={onBack}
        onSwitchMachine={onSwitchMachine}
        nextMachine={nextMachine}
        pendingCount={pendingCount}
      />

      {/* Revenue summary */}
      <div className={`px-3 py-2.5 rounded-2xl text-white flex justify-between items-center ${calculations.revenue > 50000 ? 'bg-amber-600' : 'bg-slate-800'}`}>
        <div>
          <p className="text-caption font-black uppercase opacity-60">{t.formula}</p>
          <p className="text-caption font-bold opacity-50">({currentScore} − {selectedLocation?.lastScore}) × 200</p>
          {previewSource && (
              <span
              className={`inline-block mt-1 px-1.5 py-0.5 rounded text-caption font-black uppercase tracking-wide ${previewSource === 'server' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'}`}
              title={previewSource === 'server' ? 'Preview calculated by server' : 'Preview calculated locally'}
            >
              {previewSource === 'server' ? '⬡ server' : '◎ local'}
            </span>
          )}
        </div>
        <div className="text-right">
          {calculations.revenue > 50000 && (
            <div className="flex items-center gap-1 justify-end mb-1">
              <Trophy size={10} className="text-yellow-300" />
              <span className="text-caption font-black text-yellow-300 uppercase">High Value</span>
            </div>
          )}
          <p className="text-2xl font-black">TZS {calculations.revenue.toLocaleString()}</p>
          <p className="text-caption opacity-60 uppercase">{t.revenue}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.retention}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {calculations.finalRetention.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.expenses}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {(parseInt(displayedExpenseValue) || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-caption font-black uppercase tracking-wide text-slate-400">{t.net}</p>
          <p className="mt-1 text-sm font-black text-slate-900">TZS {calculations.netPayable.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-caption font-black uppercase tracking-widest text-slate-400">
          {lang === 'zh' ? '本次账目如何流转' : 'How this money moves'}
        </p>
        <div className="mt-2 space-y-2 text-caption font-bold leading-relaxed text-slate-600">
          <p>
            {lang === 'zh'
              ? `1. 机器营收 TZS ${calculations.revenue.toLocaleString()} 先算出。`
              : `1. Revenue starts at TZS ${calculations.revenue.toLocaleString()}.`}
          </p>
          <p>
            {isOwnerRetaining
              ? (lang === 'zh'
                  ? `2. 商家留存 TZS ${calculations.finalRetention.toLocaleString()} 先记入当前点位分红余额，不会在本次直接支付。`
                  : `2. Owner share TZS ${calculations.finalRetention.toLocaleString()} is added to this location's dividend balance, not paid out immediately.`)
              : (lang === 'zh'
                  ? `2. 商家分红 TZS ${calculations.finalRetention.toLocaleString()} 视为本次直接支付，不累加到分红余额。`
                  : `2. Owner share TZS ${calculations.finalRetention.toLocaleString()} is treated as a direct payout this run, not added to dividend balance.`)}
          </p>
          <p>
            {expenseAmount > 0
              ? (expenseType === 'public'
                  ? (lang === 'zh'
                      ? `3. 本次费用 TZS ${expenseAmount.toLocaleString()} 记为公司支出，需管理员审批。`
                      : `3. Expense TZS ${expenseAmount.toLocaleString()} is recorded as a company cost and requires admin approval.`)
                  : (lang === 'zh'
                      ? `3. 本次费用 TZS ${expenseAmount.toLocaleString()} 记为司机借支/私账，审批后会进入后续工资扣减口径。`
                      : `3. Expense TZS ${expenseAmount.toLocaleString()} is recorded as a driver loan/private item and will flow into later payroll deductions after approval.`))
              : (lang === 'zh'
                  ? '3. 本次没有额外费用申报。'
                  : '3. No extra expense is being requested on this run.')}
          </p>
          <p>
            {lang === 'zh'
              ? `4. 最终应缴现金为 TZS ${calculations.netPayable.toLocaleString()}，管理员确认日结后，这笔收款才会记为已结清。`
              : `4. Final cash to hand in is TZS ${calculations.netPayable.toLocaleString()}, and it becomes settled only after admin confirms the daily settlement.`}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-caption font-black uppercase tracking-widest text-slate-400">
              {lang === 'zh' ? '金额录入' : 'Cash Inputs'}
            </p>
            <p className="mt-1 text-caption font-bold uppercase tracking-wide text-slate-300">
              {lang === 'zh' ? '分红、公账支出、换币、商家欠款' : 'Retention, company expenses, exchange, merchant debt'}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
            {previewSource === 'server' ? 'server' : 'local'}
          </span>
        </div>

      {/* Owner Retention */}
      <div className={`p-3 rounded-2xl border transition-all ${isOwnerRetaining ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
        <div className="flex justify-between items-center mb-3">
          <label className={`text-caption font-black uppercase flex items-center gap-2 ${isOwnerRetaining ? 'text-amber-600' : 'text-emerald-600'}`}>
            <HandCoins size={13} /> {isOwnerRetaining ? t.retention : (lang === 'zh' ? '支付商家分红' : 'Pay Owner Share')}
          </label>
          <button
            type="button"
            onClick={() => onUpdateIsOwnerRetaining(!isOwnerRetaining)}
            className={`relative w-9 h-5 rounded-full transition-colors ${isOwnerRetaining ? 'bg-amber-500' : 'bg-emerald-500'}`}
          >
            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${isOwnerRetaining ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-1">
            <span className={`text-xs font-black ${isOwnerRetaining ? 'text-amber-300' : 'text-emerald-300'}`}>TZS</span>
            <input
              type="number"
              step="0.01"
              value={displayedOwnerAmount}
              onChange={e => onUpdateOwnerRetention(e.target.value)}
              className={`w-full text-2xl font-black bg-transparent outline-none placeholder:opacity-40 ${isOwnerRetaining ? 'text-amber-900 placeholder:text-amber-200' : 'text-emerald-900 placeholder:text-emerald-200'}`}
              placeholder={String(calculations.commission)}
            />
          </div>
          <p className={`text-caption font-black uppercase ${isOwnerRetaining ? 'text-amber-500' : 'text-emerald-500'}`}>
            {isOwnerRetaining
              ? (lang === 'zh'
                  ? `默认按系统计算 TZS ${calculations.commission.toLocaleString()}，可直接修改`
                  : `Defaulted to system amount TZS ${calculations.commission.toLocaleString()}, editable`)
              : (lang === 'zh'
                  ? `默认按系统计算 TZS ${calculations.commission.toLocaleString()}，本次支付给商家`
                  : `Defaulted to system amount TZS ${calculations.commission.toLocaleString()} to pay the owner`)}
          </p>
          <div className={`grid grid-cols-2 gap-2 rounded-2xl border px-3 py-2 ${isOwnerRetaining ? 'border-amber-200 bg-white/70' : 'border-emerald-200 bg-white/70'}`}>
            <div>
              <p className="text-caption font-black uppercase text-slate-400">{lang === 'zh' ? '当前点位分红余额' : 'Current Location Balance'}</p>
              <p className="mt-1 text-[11px] font-black text-slate-900">
                TZS {currentDividendBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-caption font-black uppercase text-slate-400">
                {isOwnerRetaining ? (lang === 'zh' ? '留存后余额' : 'Projected Balance') : (lang === 'zh' ? '本次直接支付' : 'Paid This Run')}
              </p>
              <p className={`mt-1 text-[11px] font-black ${isOwnerRetaining ? 'text-amber-700' : 'text-emerald-700'}`}>
                TZS {(isOwnerRetaining ? nextDividendBalance : calculations.finalRetention).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <p className={`text-caption font-bold leading-relaxed ${isOwnerRetaining ? 'text-amber-700' : 'text-emerald-700'}`}>
            {isOwnerRetaining
              ? (lang === 'zh'
                  ? '留存模式：金额累计到当前点位的分红余额，店主后续通过“分红提现申请”发起支付，由管理员审批后扣减。'
                  : 'Retention mode: this amount stays on the current location as dividend balance. The owner must request payout later, and admin approval deducts the balance.')
              : (lang === 'zh'
                  ? '直付模式：本次就视为已支付给店主，不进入分红余额。'
                  : 'Direct-pay mode: this amount is treated as paid to the owner now and does not enter the dividend balance.')}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Expenses */}
      <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100">
        <div className="flex items-center justify-between mb-3">
          <label className="text-caption font-black text-rose-500 uppercase flex items-center gap-2">
            <Banknote size={13} /> {lang === 'zh' ? '费用 / 借支' : 'Expense / Loan'}
          </label>
          {expenseAmount > 0 && (
            <span className="px-2 py-0.5 bg-rose-200 text-rose-800 rounded-tag text-caption font-black uppercase">{t.pendingApproval}</span>
          )}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdateExpenseType('public')}
            className={`rounded-btn border px-3 py-2 text-caption font-black uppercase transition-colors ${
              expenseType === 'public'
                ? 'border-rose-300 bg-white text-rose-700'
                : 'border-rose-100 bg-rose-50 text-rose-300'
            }`}
          >
            {t.companyLabel}
          </button>
          <button
            type="button"
            onClick={() => onUpdateExpenseType('private')}
            className={`rounded-btn border px-3 py-2 text-caption font-black uppercase transition-colors ${
              expenseType === 'private'
                ? 'border-amber-300 bg-white text-amber-700'
                : 'border-amber-100 bg-amber-50 text-amber-300'
            }`}
          >
            {t.loanLabel}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={expenseCategory}
            onChange={e => onUpdateExpenseCategory(e.target.value as any)}
            className="bg-white border border-rose-100 rounded-btn px-2 py-2 text-caption font-black text-rose-600 outline-none uppercase w-28 flex-shrink-0"
            >
              <option value="tip">{lang === 'zh' ? '小费支出' : 'Tip / Gratuity'}</option>
              <option value="fuel">{t.fuelLabel}</option>
              <option value="repair">{t.repairLabel}</option>
              <option value="fine">{t.fineLabel}</option>
              <option value="transport">{t.transportLabel}</option>
              <option value="allowance">{t.allowanceLabel}</option>
              <option value="salary_advance">{t.salaryAdvanceLabel}</option>
              <option value="other">{t.otherLabel}</option>
            </select>
          <div className="flex-1 flex items-baseline gap-1 border-b border-rose-200 px-1">
            <span className="text-xs font-black text-rose-300">TZS</span>
            <input
              type="number"
              value={displayedExpenseValue}
              onChange={e => {
                if (isTipExpense) {
                  onUpdateTip(e.target.value);
                  onUpdateExpenses('');
                } else {
                  onUpdateExpenses(e.target.value);
                  onUpdateTip('');
                }
              }}
              className="w-full text-xl font-black bg-transparent outline-none text-rose-900 placeholder:text-rose-200"
              placeholder="0"
            />
          </div>
        </div>
        <p className={`mt-2 text-caption font-black uppercase ${expenseType === 'public' ? 'text-rose-400' : 'text-amber-500'}`}>
          {expenseType === 'public'
            ? (lang === 'zh'
                ? '公账：管理员审批后计为公司成本。'
                : 'Company: admin approval records this as a company cost.')
            : (lang === 'zh'
                ? '借支：管理员审批后计入司机私账，并进入后续工资扣减口径。'
                : 'Loan: admin approval records this as a driver/private advance for later payroll deduction.')}
        </p>
        {!isTipExpense && (
          <input
            type="text"
            value={expenseDescription}
            onChange={e => onUpdateExpenseDescription(e.target.value)}
            maxLength={80}
            placeholder={lang === 'zh' ? '费用备注（可选）' : 'Expense note (optional)'}
            className="mt-2 w-full bg-white border border-rose-100 rounded-btn px-3 py-2 text-[10px] font-bold text-rose-700 outline-none placeholder:text-rose-200"
          />
        )}
        {isTipExpense && (parseInt(tip) || 0) > TIP_WARNING_THRESHOLD && calculations.revenue < REVENUE_WARNING_THRESHOLD && (
          <p className="mt-2 text-caption font-black uppercase text-amber-700">
            ⚠️ {lang === 'zh' ? '小费偏高，请确认' : 'High tip for this revenue – confirm with admin'}
          </p>
        )}
      </div>

      {/* Coin Exchange */}
      <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100">
        <label className="text-caption font-black text-emerald-600 uppercase block mb-2 tracking-widest">{t.exchange}</label>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500 rounded-btn text-white flex-shrink-0"><Coins size={16} /></div>
          <input
            type="number"
            value={coinExchange}
            onChange={e => onUpdateCoinExchange(e.target.value)}
            className="w-full text-2xl font-black bg-transparent outline-none text-emerald-900 placeholder:text-emerald-200"
            placeholder="0"
          />
        </div>
      </div>

      <div className="bg-amber-50 p-3 rounded-2xl border border-amber-100">
        <div className="flex items-center justify-between mb-2">
          <label className="text-caption font-black text-amber-600 uppercase flex items-center gap-2 tracking-widest">
            <ShieldAlert size={13} /> {lang === 'zh' ? '商家欠款手动扣减' : 'Manual Merchant Debt Deduction'}
          </label>
          <span className="text-caption font-black text-amber-400 uppercase">
            {lang === 'zh'
              ? `剩余 ${selectedLocation.remainingStartupDebt.toLocaleString()}`
              : `Balance ${selectedLocation.remainingStartupDebt.toLocaleString()}`}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1 border-b border-amber-200 px-1 flex-1">
            <span className="text-xs font-black text-amber-300">TZS</span>
            <input
              type="number"
              value={startupDebtDeduction}
              onChange={e => onUpdateStartupDebtDeduction(e.target.value)}
              className="w-full text-2xl font-black bg-transparent outline-none text-amber-900 placeholder:text-amber-200"
              placeholder="0"
            />
          </div>
        </div>
        <p className="text-caption font-black text-amber-400 uppercase mt-2">
          {lang === 'zh'
            ? '手动填写，本次只会按可扣上限和剩余商家欠款计入。'
            : 'Manual entry. This run is capped by available cash and remaining merchant debt.'}
        </p>
      </div>
      </div>
      </div>

      {/* Navigation */}
      {isScoreBelowLastReading && (
        <div className="p-3 rounded-subcard border border-rose-200 bg-rose-50">
          <p className="text-caption font-black uppercase text-rose-600">
            {lang === 'zh'
              ? `当前读数低于上次记录 (${selectedLocation.lastScore.toLocaleString()})，请返回重新核对读数或改走重置申请。`
              : `Current reading is below the last recorded score (${selectedLocation.lastScore.toLocaleString()}). Go back and confirm the reading or use the reset request flow.`}
          </p>
        </div>
      )}
      {calculations.startupDebtDeduction > 0 && (
        <div className="p-3 rounded-subcard border border-amber-200 bg-amber-50">
          <p className="text-caption font-black uppercase text-amber-700">
            {lang === 'zh'
              ? `本次将代商家回收欠款 TZS ${calculations.startupDebtDeduction.toLocaleString()}。`
              : `This collection will recover TZS ${calculations.startupDebtDeduction.toLocaleString()} of merchant debt.`}
          </p>
        </div>
      )}
      <div className="sticky bottom-0 z-20 -mx-3 mt-4 border-t border-slate-200 bg-white/95 px-3 pb-2 pt-3 backdrop-blur">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onBack}
            className="py-4 bg-white border border-slate-200 text-slate-500 rounded-btn font-black uppercase text-xs shadow-field hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowRight size={15} className="rotate-180" />
            {lang === 'zh' ? '返回' : 'Back'}
          </button>
          <button
            onClick={onNext}
            disabled={isScoreBelowLastReading}
            data-testid="driver-finance-next"
            className="py-4 bg-amber-600 text-white rounded-btn font-black uppercase text-xs shadow-field-md active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {lang === 'zh' ? '复核并提交' : 'Review & Submit'}
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default FinanceSummary;
