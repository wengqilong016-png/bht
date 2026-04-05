import React from 'react';
import { describe, it, expect, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import DriverSyncDock from '../shared/DriverSyncDock';
import type { SyncStatus } from '../hooks/useSyncStatus';

function makeSyncStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    isOnline: true,
    isSyncing: false,
    syncFailed: false,
    unsyncedCount: 0,
    lastSyncedAt: null,
    trigger: jest.fn(),
    ...overrides,
  };
}

describe('DriverSyncDock', () => {
  it('shows pending sync state and triggers manual sync', () => {
    const trigger = jest.fn();
    render(<DriverSyncDock syncStatus={makeSyncStatus({ unsyncedCount: 3, trigger })} lang="zh" />);

    expect(screen.getByText('3 条记录待同步')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }));
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('shows offline state without a sync button', () => {
    render(<DriverSyncDock syncStatus={makeSyncStatus({ isOnline: false, unsyncedCount: 2 })} lang="zh" />);

    expect(screen.getByText('离线队列已开启')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '立即同步' })).toBeNull();
  });
});
