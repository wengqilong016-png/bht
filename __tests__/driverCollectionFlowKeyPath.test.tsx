import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import DriverCollectionFlow from '../driver/pages/DriverCollectionFlow';

import type { Transaction } from '../types';

const mockSetQueryData = jest.fn();
const mockGetQueryData = jest.fn();
const mockUpdateLocationsMutateAsync = jest.fn<() => Promise<void>>();
const mockLogAIMutate = jest.fn();
const mockSubmitTransactionMutateAsync = jest.fn<(transaction: Transaction) => Promise<void>>();
const mockSyncOfflineDataMutate = jest.fn();
const mockRequestGps = jest.fn<() => Promise<{ lat: number; lng: number } | null>>();

const mockDriver = {
  id: 'drv-1',
  name: 'Driver One',
  username: 'driver',
  phone: '0711000000',
  initialDebt: 0,
  remainingDebt: 0,
  dailyFloatingCoins: 1000,
  vehicleInfo: { model: 'Bajaj', plate: 'T123' },
  status: 'active' as const,
  baseSalary: 300000,
  commissionRate: 0.05,
};

const mockLocations = [
  {
    id: 'loc-1',
    name: 'Bahati Shop',
    machineId: 'M-100',
    area: 'Kariakoo',
    lastScore: 1000,
    status: 'active' as const,
    commissionRate: 0.15,
    assignedDriverId: 'drv-1',
  },
];

const mockAppData = {
  filteredLocations: mockLocations,
  filteredTransactions: [] as Transaction[],
  isOnline: true,
  drivers: [mockDriver],
};

const mockMutations = {
  logAI: { mutate: mockLogAIMutate },
  submitTransaction: { mutateAsync: mockSubmitTransactionMutateAsync },
  syncOfflineData: { mutate: mockSyncOfflineDataMutate },
  updateLocations: { mutateAsync: mockUpdateLocationsMutateAsync },
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: mockGetQueryData,
    setQueryData: mockSetQueryData,
  }),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    lang: 'zh',
    activeDriverId: 'drv-1',
  }),
}));

jest.mock('../contexts/DataContext', () => ({
  useAppData: () => mockAppData,
}));

jest.mock('../contexts/MutationContext', () => ({
  useMutations: () => mockMutations,
}));

jest.mock('../driver/hooks/useGpsCapture', () => ({
  useGpsCapture: () => ({
    coords: null,
    status: 'prompt',
    request: mockRequestGps,
  }),
}));

jest.mock('../services/financeCalculator', () => ({
  calculateCollectionFinanceLocal: () => ({
    source: 'local',
    diff: 200,
    revenue: 40000,
    commission: 6000,
    finalRetention: 34000,
    startupDebtDeduction: 0,
    netPayable: 34000,
    remainingCoins: 1000,
    isCoinStockNegative: false,
  }),
  calculateCollectionFinancePreview: () =>
    Promise.resolve({
      source: 'server',
      diff: 200,
      revenue: 40000,
      commission: 6000,
      finalRetention: 34000,
      startupDebtDeduction: 0,
      netPayable: 34000,
      remainingCoins: 1000,
      isCoinStockNegative: false,
    }),
}));

jest.mock('../driver/components/MachineSelector', () => ({
  __esModule: true,
  default: ({
    onSelectMachine,
    onCreateOfficeLoan,
  }: {
    onSelectMachine: (locId: string) => void;
    onCreateOfficeLoan?: (locId: string, amount: number, note: string) => Promise<void>;
  }) => (
    <div>
      <p>STEP:selection</p>
      <button type="button" onClick={() => onSelectMachine('loc-1')}>
        Select Machine
      </button>
      <button
        type="button"
        onClick={() => {
          void onCreateOfficeLoan?.('loc-1', 3500, 'Office float top-up').catch(() => {});
        }}
      >
        Create Office Loan
      </button>
    </div>
  ),
}));

jest.mock('../driver/components/ReadingCapture', () => ({
  __esModule: true,
  default: ({ onNext }: { onNext: () => void }) => (
    <div>
      <p>STEP:capture</p>
      <button type="button" onClick={onNext}>
        To Amounts
      </button>
    </div>
  ),
}));

jest.mock('../driver/components/FinanceSummary', () => ({
  __esModule: true,
  default: ({ onNext }: { onNext: () => void }) => (
    <div>
      <p>STEP:amounts</p>
      <button type="button" onClick={onNext}>
        To Confirm
      </button>
    </div>
  ),
}));

jest.mock('../driver/components/SubmitReview', () => ({
  __esModule: true,
  default: function MockSubmitReview({
    onSubmit,
    onReturnHome,
  }: {
    onSubmit: (result: { source: 'server' | 'offline'; transaction: Transaction }) => Promise<void>;
    onReturnHome?: () => void;
  }) {
    const React = require('react');
    const [done, setDone] = React.useState(false);
    return (
      <div>
        <p>STEP:confirm</p>
        {!done ? (
          <button
            type="button"
            onClick={async () => {
              await onSubmit({
                source: 'server',
                transaction: {
                  id: 'tx-key-path',
                  timestamp: '2026-04-10T10:00:00.000Z',
                  locationId: 'loc-1',
                  locationName: 'Bahati Shop',
                  driverId: 'drv-1',
                  currentScore: 1200,
                  netPayable: 34000,
                  type: 'collection',
                  isSynced: true,
                } as Transaction,
              });
              setDone(true);
            }}
          >
            Submit
          </button>
        ) : (
          <div>
            <p>TASK_COMPLETED</p>
            <button type="button" onClick={onReturnHome}>
              Back Home
            </button>
          </div>
        )}
      </div>
    );
  },
}));

describe('driver collection flow key path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetQueryData.mockReturnValue([]);
    mockUpdateLocationsMutateAsync.mockResolvedValue(undefined);
    mockSubmitTransactionMutateAsync.mockResolvedValue(undefined);
    mockRequestGps.mockResolvedValue({ lat: -6.81, lng: 39.28 });
  });

  it('walks through selection/capture/amounts/confirm and returns to selection after completion', async () => {
    render(<DriverCollectionFlow />);

    expect(screen.getByText('STEP:selection')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Select Machine' }));
    expect(screen.getByText('STEP:capture')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'To Amounts' }));
    expect(screen.getByText('STEP:amounts')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'To Confirm' }));
    expect(screen.getByText('STEP:confirm')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByText('TASK_COMPLETED')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Back Home' }));
    await waitFor(() => expect(screen.getByText('STEP:selection')).toBeTruthy());
  });

  it('waits for fresh GPS before creating an office loan transaction', async () => {
    render(<DriverCollectionFlow />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Office Loan' }));

    await waitFor(() => expect(mockSubmitTransactionMutateAsync).toHaveBeenCalledTimes(1));
    const transaction = mockSubmitTransactionMutateAsync.mock.calls[0][0] as Transaction;
    expect(mockRequestGps).toHaveBeenCalledTimes(1);
    expect(transaction.gps).toEqual({ lat: -6.81, lng: 39.28 });
    expect(transaction.expenseCategory).toBe('office_loan');
  });

  it('does not create an office loan transaction when GPS cannot be resolved', async () => {
    mockRequestGps.mockResolvedValueOnce(null);

    render(<DriverCollectionFlow />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Office Loan' }));

    await waitFor(() => expect(mockRequestGps).toHaveBeenCalledTimes(1));
    expect(mockSubmitTransactionMutateAsync).not.toHaveBeenCalled();
  });
});
