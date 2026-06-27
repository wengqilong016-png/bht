import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import SettlementTab from '../components/dashboard/SettlementTab';
import { Transaction, DailySettlement, Driver, Location, User } from '../types';

// Mock contexts
jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('../contexts/ConfirmContext', () => ({
  useConfirm: () => ({ confirm: jest.fn().mockResolvedValue(true) }),
}));

// Simple mock values
const mockLocationMap = new Map<string, Location>([
  [
    'loc-123',
    {
      id: 'loc-123',
      name: 'Spot 12',
      machineId: 'M54',
      commissionRate: 0.15,
      lastScore: 84250,
      status: 'active',
      coords: null,
      created_at: new Date().toISOString(),
    },
  ],
]);

const mockTodayDriverTxs: Transaction[] = [
  {
    id: 'tx-456',
    timestamp: new Date().toISOString(),
    locationId: 'loc-123',
    locationName: 'Spot 12',
    driverId: 'driver-999',
    driverName: 'John',
    previousScore: 83900,
    currentScore: 84250,
    revenue: 70000,
    commission: 10500,
    netPayable: 59500,
    paymentStatus: 'unpaid',
    type: 'collection',
  },
];

const defaultProps = {
  isAdmin: false,
  unsyncedCollectionsCount: 0,
  transactions: [],
  pendingSettlements: [],
  settlementsForSubmissionGuard: [],
  pendingExpenses: [],
  anomalyTransactions: [],
  pendingResetRequests: [],
  pendingPayoutRequests: [],
  payrollStats: [],
  driverMap: new Map(),
  locationMap: mockLocationMap,
  todayDriverTxs: mockTodayDriverTxs,
  myProfile: undefined,
  currentUser: { id: 'u-1', email: 'test@bht.com', role: 'driver', driverId: 'driver-999' } as User,
  activeDriverId: 'driver-999',
  todayStr: '2026-06-27',
  onCreateSettlement: jest.fn(),
  onReviewSettlement: jest.fn(),
  onApproveExpenseRequest: jest.fn(),
  onReviewAnomalyTransaction: jest.fn(),
  onApproveResetRequest: jest.fn(),
  onApprovePayoutRequest: jest.fn(),
  isOnline: true,
  lang: 'zh' as const,
};

describe('Driver Daily Invoice Test Suite', () => {
  it('renders daily invoice accordion and allows collapse toggle', () => {
    render(<SettlementTab {...defaultProps} />);

    // TDD Expectation 1: Accordion should render with the correct title
    const accordionHeader = screen.getByText(/每日收款对账单/i);
    expect(accordionHeader).toBeInTheDocument();

    // Confirm that by default, the list details are closed/collapsed
    expect(screen.queryByText(/今日最新读数/i)).not.toBeInTheDocument();

    // TDD Expectation 2: Trigger expansion click
    fireEvent.click(accordionHeader);

    // After Click, Daily metra difference calculation lines must show
    expect(screen.getByText(/今日最新读数/i)).toBeInTheDocument();
    expect(screen.getByText(/84250/i)).toBeInTheDocument();
    expect(screen.getByText(/83900/i)).toBeInTheDocument();
    expect(screen.getByText(/\+350 币/i)).toBeInTheDocument();
    expect(screen.getByText(/Spot 12/i)).toBeInTheDocument();
  });

  it('fires onUpdateLocationStatus when machine status dropdown changes', () => {
    const onUpdateLocationStatus = jest.fn().mockResolvedValue(undefined);
    render(<SettlementTab {...defaultProps} onUpdateLocationStatus={onUpdateLocationStatus} />);

    fireEvent.click(screen.getByText(/每日收款对账单/i));
    const statusSelect = screen.getByLabelText(/机器实体状态/i);
    fireEvent.change(statusSelect, { target: { value: 'broken' } });

    expect(onUpdateLocationStatus).toHaveBeenCalledWith('loc-123', 'broken');
  });

  it('fires onUpdateTransactionNotes when saving edited notes', () => {
    const onUpdateTransactionNotes = jest.fn().mockResolvedValue(undefined);
    render(<SettlementTab {...defaultProps} onUpdateTransactionNotes={onUpdateTransactionNotes} />);

    fireEvent.click(screen.getByText(/每日收款对账单/i));
    fireEvent.click(screen.getByText(/补写日结备注/i));

    const textarea = screen.getByPlaceholderText(/在此输入补写备注/i);
    fireEvent.change(textarea, { target: { value: '机器卡币已修好' } });
    fireEvent.click(screen.getByText(/^保存$/i));

    expect(onUpdateTransactionNotes).toHaveBeenCalledWith('tx-456', '机器卡币已修好');
  });
});
