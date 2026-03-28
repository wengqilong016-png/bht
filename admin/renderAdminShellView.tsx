import React, { lazy } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { SyncMutationHandle } from '../hooks/useSyncStatus';
import type { AILog, DailySettlement, Driver, Location, Transaction, User } from '../types';
import type { AdminView } from './adminShellConfig';
import { mapAdminViewToDashboardTab } from './adminShellConfig';
import { isDashboardBackedAdminView } from './adminShellViewState';

const Dashboard = lazy(() => import('../components/Dashboard'));
const CollectionForm = lazy(() => import('../components/CollectionForm'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const DriverManagement = lazy(() => import('../components/driver-management'));

interface AdminShellViewRendererProps {
  view: AdminView;
  currentUser: User;
  lang: 'zh' | 'sw';
  activeDriverId?: string;
  isOnline: boolean;
  locations: Location[];
  drivers: Driver[];
  filteredLocations: Location[];
  filteredDrivers: Driver[];
  filteredTransactions: Transaction[];
  filteredSettlements: DailySettlement[];
  aiLogs: AILog[];
  unsyncedCount: number;
  onSetView: (view: AdminView) => void;
  syncOfflineData: SyncMutationHandle;
  updateDrivers: UseMutationResult<unknown, unknown, Driver[], unknown>;
  updateLocations: UseMutationResult<unknown, unknown, Location[], unknown>;
  deleteLocations: UseMutationResult<unknown, unknown, string[], unknown>;
  deleteDrivers: UseMutationResult<unknown, unknown, string[], unknown>;
  updateTransaction: UseMutationResult<unknown, unknown, { txId: string; updates: Partial<Transaction> }, unknown>;
  saveSettlement: UseMutationResult<unknown, unknown, DailySettlement, unknown>;
  logAI: UseMutationResult<unknown, unknown, AILog, unknown>;
}

const AdminShellViewRenderer: React.FC<AdminShellViewRendererProps> = ({
  view,
  currentUser,
  lang,
  activeDriverId,
  isOnline,
  locations,
  drivers,
  filteredLocations,
  filteredDrivers,
  filteredTransactions,
  filteredSettlements,
  aiLogs,
  unsyncedCount,
  onSetView,
  syncOfflineData,
  updateDrivers,
  updateLocations,
  deleteLocations,
  deleteDrivers,
  updateTransaction,
  saveSettlement,
  logAI,
}) => {
  if (isDashboardBackedAdminView(view)) {
    return (
      <Dashboard
        transactions={filteredTransactions}
        drivers={filteredDrivers}
        locations={filteredLocations}
        dailySettlements={filteredSettlements}
        aiLogs={aiLogs}
        currentUser={currentUser}
        onUpdateDrivers={(driversToSave) => updateDrivers.mutateAsync(driversToSave).then(() => {})}
        onUpdateLocations={(locationsToSave) => updateLocations.mutate(locationsToSave)}
        onDeleteLocations={(ids) => deleteLocations.mutate(ids)}
        onUpdateTransaction={(txId, updates) => updateTransaction.mutate({ txId, updates })}
        onNewTransaction={() => {}}
        onSaveSettlement={(settlement) => saveSettlement.mutate(settlement)}
        onSync={async () => syncOfflineData.mutate()}
        isSyncing={syncOfflineData.isPending}
        offlineCount={unsyncedCount}
        lang={lang}
        onNavigate={(nextView) => onSetView(nextView as AdminView)}
        initialTab={mapAdminViewToDashboardTab(view)}
        hideTabs={true}
      />
    );
  }

  switch (view) {
    case 'team':
      return (
        <DriverManagement
          drivers={filteredDrivers}
          locations={locations}
          transactions={filteredTransactions}
          dailySettlements={filteredSettlements}
          onUpdateDrivers={(driversToSave) => updateDrivers.mutateAsync(driversToSave).then(() => {})}
          onUpdateLocations={(locationsToSave) => updateLocations.mutate(locationsToSave)}
          onDeleteDrivers={(ids) => deleteDrivers.mutate(ids)}
        />
      );
    case 'collect':
      return (
        <CollectionForm
          locations={filteredLocations}
          currentDriver={drivers.find((driver) => driver.id === activeDriverId) || drivers[0]}
          onSubmit={() => syncOfflineData.mutate()}
          lang={lang}
          onLogAI={(log) => logAI.mutate(log)}
          isOnline={isOnline}
          allTransactions={filteredTransactions}
          onRegisterMachine={async (location) => {
            const newLocation: Location = { ...location, isSynced: false, assignedDriverId: activeDriverId };
            updateLocations.mutate([...locations, newLocation]);
          }}
        />
      );
    case 'history':
      return <TransactionHistory transactions={filteredTransactions} locations={locations} onAnalyze={() => {}} />;
    case 'debt':
      return (
        <DebtManager
          drivers={filteredDrivers}
          locations={filteredLocations}
          currentUser={currentUser}
          onUpdateLocations={(locationsToSave) => updateLocations.mutate(locationsToSave)}
          onUpdateDrivers={(driversToSave) => updateDrivers.mutateAsync(driversToSave).then(() => {})}
          lang={lang}
        />
      );
    default:
      return null;
  }
};

export default AdminShellViewRenderer;
