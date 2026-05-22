import { render, screen } from '@testing-library/react';

import { FinanceSummaryContent } from '../driver/components/FinanceSummary';
import { Money } from '../utils/money';

import { makeLocation } from './helpers/fixtures';

describe('FinanceSummaryContent', () => {
  it('formats Money calculation values as numeric TZS amounts', () => {
    const selectedLocation = makeLocation({
      id: 'loc-1',
      name: 'Machine A',
      lastScore: 1000,
      dividendBalance: 2000,
      remainingStartupDebt: 5000,
    });

    render(
      <FinanceSummaryContent
        selectedLocation={selectedLocation}
        lang="zh"
        currentScore="1200"
        coinExchange="0"
        ownerRetention=""
        isOwnerRetaining
        tip="0"
        startupDebtDeduction="0"
        calculations={{
          diff: Money.tzs(200),
          revenue: Money.tzs(40000),
          commission: Money.tzs(6000),
          finalRetention: Money.tzs(6000),
          startupDebtDeduction: Money.tzs(0),
          netPayable: Money.tzs(34000),
          remainingCoins: Money.tzs(100),
          isCoinStockNegative: false,
        }}
        onUpdateCoinExchange={jest.fn()}
        onUpdateOwnerRetention={jest.fn()}
        onUpdateIsOwnerRetaining={jest.fn()}
        onUpdateTip={jest.fn()}
        onUpdateStartupDebtDeduction={jest.fn()}
      />,
    );

    expect(screen.getByText('TZS 40,000')).toBeInTheDocument();
    expect(screen.getAllByText('TZS 6,000').length).toBeGreaterThan(0);
    expect(screen.getByText('TZS 34,000')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(':TZS');
  });
});
