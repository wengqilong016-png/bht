import React from 'react';

import { Location, TRANSLATIONS } from '../../types';

import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import {
  CoinExchangeSection,
  CollectionExpenseNoticeSection,
  FinanceFlowExplanation,
  FinanceMetricGrid,
  FinanceNavigation,
  FinanceWarnings,
  OwnerRetentionSection,
  RevenueSummary,
  StartupDebtDeductionSection,
  type FinanceSummaryCalculations,
} from './finance/FinanceSummarySections';
import WizardStepBar from './WizardStepBar';

import type { FinanceCalculationSource } from '../../services/financeCalculator';

interface FinanceSummaryProps {
  selectedLocation: Location;
  lang: 'zh' | 'sw';
  currentScore: string;
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  startupDebtDeduction: string;
  calculations: FinanceSummaryCalculations;
  onUpdateCoinExchange: (val: string) => void;
  onUpdateOwnerRetention: (val: string) => void;
  onUpdateIsOwnerRetaining: (val: boolean) => void;
  onUpdateStartupDebtDeduction: (val: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSwitchMachine?: () => void;
  previewSource?: FinanceCalculationSource;
  nextMachine?: Location | null;
  pendingCount?: number;
}

const FinanceSummary: React.FC<FinanceSummaryProps> = ({
  selectedLocation,
  lang,
  currentScore,
  coinExchange,
  ownerRetention,
  isOwnerRetaining,
  startupDebtDeduction,
  calculations,
  onUpdateCoinExchange,
  onUpdateOwnerRetention,
  onUpdateIsOwnerRetaining,
  onUpdateStartupDebtDeduction,
  onNext,
  onBack,
  onSwitchMachine,
  previewSource,
  nextMachine,
  pendingCount,
}) => {
  const t = TRANSLATIONS[lang];
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
  const nextDividendBalance = isOwnerRetaining ? projectedDividendBalance : currentDividendBalance;
  const shared = { lang, t, calculations };

  return (
    <div className="mx-auto max-w-md animate-in fade-in space-y-2.5">
      <WizardStepBar current="amounts" lang={lang} />

      <CollectionWorkbenchHeader
        selectedLocation={selectedLocation}
        lang={lang}
        onBack={onBack}
        onSwitchMachine={onSwitchMachine}
        nextMachine={nextMachine}
        pendingCount={pendingCount}
      />

      <RevenueSummary
        {...shared}
        selectedLocation={selectedLocation}
        currentScore={currentScore}
        previewSource={previewSource}
      />

      <FinanceMetricGrid {...shared} />

      <FinanceFlowExplanation
        {...shared}
        isOwnerRetaining={isOwnerRetaining}
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-caption font-black uppercase tracking-widest text-slate-400">
              {lang === 'zh' ? '金额录入' : 'Cash Inputs'}
            </p>
            <p className="mt-1 text-caption font-bold uppercase tracking-wide text-slate-300">
              {lang === 'zh' ? '分红、换币、商家欠款' : 'Retention, exchange, merchant debt'}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
            {previewSource === 'server' ? 'server' : 'local'}
          </span>
        </div>

        <OwnerRetentionSection
          {...shared}
          currentDividendBalance={currentDividendBalance}
          displayedOwnerAmount={displayedOwnerAmount}
          isOwnerRetaining={isOwnerRetaining}
          nextDividendBalance={nextDividendBalance}
          onUpdateIsOwnerRetaining={onUpdateIsOwnerRetaining}
          onUpdateOwnerRetention={onUpdateOwnerRetention}
        />

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <CollectionExpenseNoticeSection {...shared} />
          <CoinExchangeSection
            {...shared}
            coinExchange={coinExchange}
            onUpdateCoinExchange={onUpdateCoinExchange}
          />
          <StartupDebtDeductionSection
            {...shared}
            onUpdateStartupDebtDeduction={onUpdateStartupDebtDeduction}
            selectedLocation={selectedLocation}
            startupDebtDeduction={startupDebtDeduction}
          />
        </div>
      </div>

      <FinanceWarnings
        {...shared}
        isScoreBelowLastReading={isScoreBelowLastReading}
        selectedLocation={selectedLocation}
      />

      <FinanceNavigation
        isScoreBelowLastReading={isScoreBelowLastReading}
        lang={lang}
        onBack={onBack}
        onNext={onNext}
      />
    </div>
  );
};

export default FinanceSummary;
