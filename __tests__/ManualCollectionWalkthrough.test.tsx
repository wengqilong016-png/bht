import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DailyCollectionEntryPage from '../admin/DailyCollectionEntryPage';
import ManualCollectionEntryPage from '../admin/ManualCollectionEntryPage';

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'admin-1', name: 'Admin', role: 'admin' }, lang: 'zh' }),
}));
jest.mock('../contexts/DataContext', () => ({
  useAppData: () => ({
    drivers: [
      { id: 'd1', name: 'Rajabu', status: 'active', dailyFloatingCoins: 0 },
    ],
    locations: [
      { id: 'loc-1', name: 'Spot 12', machineId: 'M54', lastScore: 83900, commissionRate: 0.15, assignedDriverId: 'd1', status: 'active' },
      { id: 'loc-2', name: 'Spot 8', machineId: 'M22', lastScore: 52100, commissionRate: 0.15, assignedDriverId: 'd1', status: 'active' },
    ],
    transactions: [
      { id: 'tx-1', driverId: 'd1', locationId: 'loc-1', currentScore: 84250, previousScore: 83900, revenue: 70000, isOwnerRetaining: true, tip: 0, expenses: 0, coinExchange: 0, ownerRetention: 10500, timestamp: '2026-06-01T10:00:00Z', type: 'collection' },
    ],
    isOnline: true,
  }),
}));
jest.mock('../contexts/MutationContext', () => {
  const mutateAsync = jest.fn().mockResolvedValue({ id: 'new-tx' });
  return {
    useMutations: () => ({
      submitManualCollection: { mutateAsync, isPending: false },
      createSettlement: { mutateAsync: jest.fn(), isPending: false },
    }),
    __getSubmitManualCollectionMock: () => mutateAsync,
  };
});
jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock('../services/financeAuditService', () => ({
  logFinanceAudit: jest.fn(),
}));

const getSubmitMock = () =>
  (jest.requireMock('../contexts/MutationContext') as {
    __getSubmitManualCollectionMock: () => jest.Mock;
  }).__getSubmitManualCollectionMock();

describe('ManualCollectionWalkthrough', () => {
  beforeEach(() => {
    getSubmitMock().mockClear();
  });

  it('renders driver select and date picker on load', () => {
    render(<ManualCollectionEntryPage />);
    expect(screen.getByText(/逐项收款核查/i)).toBeInTheDocument();
    expect(screen.getByText(/Rajabu/i)).toBeInTheDocument();
  });

  it('after selecting driver shows machine list', () => {
    render(<ManualCollectionEntryPage />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd1' } });
    expect(screen.getByText(/Spot 12/i)).toBeInTheDocument();
    expect(screen.getByText(/Spot 8/i)).toBeInTheDocument();
  });

  it('enters walkthrough and shows step 1', () => {
    render(<ManualCollectionEntryPage />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByText(/Spot 12/i));
    expect(screen.getByText(/今日分数/i)).toBeInTheDocument();
    expect(screen.getByText(/83,900/)).toBeInTheDocument();
  });

  it('passes the selected historical date and admin override when submitting', async () => {
    render(<ManualCollectionEntryPage />);
    fireEvent.change(screen.getByLabelText(/日期/), { target: { value: '2026-05-31' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByText(/Spot 12/i));
    fireEvent.change(screen.getByPlaceholderText(/输入读数/), { target: { value: '84250' } });

    for (let step = 1; step < 7; step += 1) {
      const buttons = screen.getAllByRole('button');
      fireEvent.click(buttons[buttons.length - 1]);
    }
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => expect(getSubmitMock()).toHaveBeenCalledTimes(1));
    expect(getSubmitMock()).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: '2026-05-31T12:00:00+03:00',
        adminOverride: true,
      }),
    );
  });

  it('advances through all 7 steps', () => {
    render(<ManualCollectionEntryPage />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByText(/Spot 12/i));

    // Step 1: enter score
    const input = screen.getByPlaceholderText(/输入读数/);
    fireEvent.change(input, { target: { value: '84250' } });
    const btns1 = screen.getAllByRole('button');
    fireEvent.click(btns1[btns1.length - 1]); // 确定 → button

    // Step 2: dividend
    expect(screen.getAllByText(/分红计算/i).length).toBeGreaterThanOrEqual(1);
    const btns2 = screen.getAllByRole('button');
    fireEvent.click(btns2[btns2.length - 1]);

    // Step 3: revenue
    expect(screen.getAllByText(/营业额/).length).toBeGreaterThanOrEqual(1);
    const btns3 = screen.getAllByRole('button');
    fireEvent.click(btns3[btns3.length - 1]);

    // Step 4: retention
    expect(screen.getAllByText(/分红处理/).length).toBeGreaterThanOrEqual(1);
    const btns4 = screen.getAllByRole('button');
    fireEvent.click(btns4[btns4.length - 1]);

    // Step 5: tip
    expect(screen.getAllByText(/小费支出/).length).toBeGreaterThanOrEqual(1);
    const btns5 = screen.getAllByRole('button');
    fireEvent.click(btns5[btns5.length - 1]);

    // Step 6: other expenses
    expect(screen.getAllByText(/其他支出/).length).toBeGreaterThanOrEqual(1);
    const btns6 = screen.getAllByRole('button');
    fireEvent.click(btns6[btns6.length - 1]);

    // Step 7: coin exchange + submit
    expect(screen.getAllByText(/换币/).length).toBeGreaterThanOrEqual(1);
  });
});

describe('DailyCollectionEntryPage', () => {
  beforeEach(() => {
    getSubmitMock().mockClear();
  });

  it('passes admin override when the toggle is enabled', async () => {
    render(<DailyCollectionEntryPage />);
    fireEvent.click(screen.getByRole('button', { name: /添加一台机器的采集记录/ }));

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'loc-1' } });
    fireEvent.change(screen.getByPlaceholderText(/例如 12800/), { target: { value: '83000' } });
    fireEvent.click(screen.getByRole('button', { pressed: false }));
    fireEvent.click(screen.getByRole('button', { name: /提交此笔/ }));

    await waitFor(() => expect(getSubmitMock()).toHaveBeenCalledTimes(1));
    expect(getSubmitMock()).toHaveBeenCalledWith(
      expect.objectContaining({ adminOverride: true }),
    );
  });
});
