import React from 'react';

import { Location, TRANSLATIONS } from '../../types';

import CollectionWorkbenchHeader from './CollectionWorkbenchHeader';
import {
  CoinExchangeSection,
  FinanceMetricGrid,
  FinanceNavigation,
  FinanceWarnings,
  OwnerRetentionSection,
  RevenueSummary,
  StartupDebtDeductionSection,
  TipPaymentSection,
  type FinanceSummaryCalculations,
} from './finance/FinanceSummarySections';
import WizardStepBar from './WizardStepBar';

import type { FinanceCalculationSource } from '../../services/financeCalculator';

interface FinanceSummaryCoreProps {
  selectedLocation: Location;
  lang: 'zh' | 'sw';
  currentScore: string;
  coinExchange: string;
  ownerRetention: string;
  isOwnerRetaining: boolean;
  tip: string;
  startupDebtDeduction: string;
  calculations: FinanceSummaryCalculations;
  onUpdateCoinExchange: (val: string) => void;
  onUpdateOwnerRetention: (val: string) => void;
  onUpdateIsOwnerRetaining: (val: boolean) => void;
  onUpdateTip: (val: string) => void;
  onUpdateStartupDebtDeduction: (val: string) => void;
  previewSource?: FinanceCalculationSource;
  showRevenueSummary?: boolean;
  showMetricGrid?: boolean;
}

interface FinanceSummaryProps extends FinanceSummaryCoreProps {
  onNext: () => void;
  onBack: () => void;
  onSwitchMachine?: () => void;
  nextMachine?: Location | null;
  pendingCount?: number;
}

export function FinanceSummaryContent({
  selectedLocation,
  lang,
  currentScore,
  coinExchange,
  ownerRetention,
  isOwnerRetaining,
  tip,
  startupDebtDeduction,
  calculations,
  onUpdateCoinExchange,
  onUpdateOwnerRetention,
  onUpdateIsOwnerRetaining,
  onUpdateTip,
  onUpdateStartupDebtDeduction,
  previewSource,
  showRevenueSummary = true,
  showMetricGrid = true,
}: FinanceSummaryCoreProps) {
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
    <>
      {showRevenueSummary && (
        <RevenueSummary
          {...shared}
          selectedLocation={selectedLocation}
          currentScore={currentScore}
          previewSource={previewSource}
        />
      )}

      {showMetricGrid && <FinanceMetricGrid {...shared} isOwnerRetaining={isOwnerRetaining} />}

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-caption font-black uppercase tracking-widest text-slate-400">
              {lang === 'zh' ? '金额录入' : 'Cash Inputs'}
            </p>
            <p className="mt-1 text-caption font-bold uppercase tracking-wide text-slate-300">
              {lang === 'zh' ? '分红、换币、小费、商家欠款' : 'Dividend, exchange, tip, merchant debt'}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-caption font-black uppercase text-slate-500">
            {previewSource === 'server' ? (lang === 'zh' ? '服务器' : 'server') : (lang === 'zh' ? '本地' : 'local')}
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
          <CoinExchangeSection
            {...shared}
            coinExchange={coinExchange}
            onUpdateCoinExchange={onUpdateCoinExchange}
          />
          <TipPaymentSection
            {...shared}
            tip={tip}
            onUpdateTip={onUpdateTip}
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
    </>
  );
}

const FinanceSummary: React.FC<FinanceSummaryProps> = ({
  selectedLocation,
  lang,
  onNext,
  onBack,
  onSwitchMachine,
  nextMachine,
  pendingCount,
  ...contentProps
}) => {
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

      <FinanceSummaryContent
        {...contentProps}
        selectedLocation={selectedLocation}
        lang={lang}
      />

      <FinanceNavigation
        isScoreBelowLastReading={
          !Number.isNaN(parseInt(contentProps.currentScore, 10)) &&
          parseInt(contentProps.currentScore, 10) < (selectedLocation?.lastScore ?? 0)
        }
        lang={lang}
        onBack={onBack}
        onNext={onNext}
      />
    </div>
  );
};

export default FinanceSummary;
