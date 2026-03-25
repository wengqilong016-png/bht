import React, { lazy } from 'react';
import type { DriverView } from './driverShellConfig';
import { resolveCurrentDriver } from './driverShellViewState';

const Dashboard = lazy(() => import('../components/Dashboard'));
const DriverCollectionFlow = lazy(() => import('../driver/pages/DriverCollectionFlow'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const LocationChangeRequestForm = lazy(() => import('../driver/components/LocationChangeRequestForm'));
const DriverStatusPanel = lazy(() => import('../driver/components/DriverStatusPanel'));

interface DriverShellViewRendererProps {
  view: DriverView;
  lang: 'zh' | 'sw';
  currentUser: any;
  activeDriverId?: string;
  isOnline: boolean;
  locations: any[];
  drivers: any[];
  filteredLocations: any[];
  filteredDrivers: any[];
  filteredTransactions: any[];
  filteredSettlements: any[];
  aiLogs: any[];
  unsyncedCount: number;
  syncOfflineData: any;
  updateDrivers: any;
  updateLocations: any;
  deleteLocations: any;
  updateTransaction: any;
  saveSettlement: any;
  logAI: any;
  onSetView: (view: DriverView) => void;
}

const DriverShellViewRenderer: React.FC<DriverShellViewRendererProps> = ({
  view,
  lang,
  currentUser,
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
  syncOfflineData,
  updateDrivers,
  updateLocations,
  deleteLocations,
  updateTransaction,
  saveSettlement,
  logAI,
  onSetView,
}) => {
  const activeDriver = drivers.find((d) => d.id === activeDriverId);
  const currentDriver = resolveCurrentDriver(drivers, activeDriverId);

  switch (view) {
    case 'collect':
      return (
        <DriverCollectionFlow
          locations={filteredLocations}
          currentDriver={currentDriver}
          onSubmit={() => syncOfflineData.mutate()}
          lang={lang}
          onLogAI={(l) => logAI.mutate(l)}
          isOnline={isOnline}
          allTransactions={filteredTransactions}
          onRegisterMachine={async (loc) => {
            const newLoc = { ...loc, isSynced: false, assignedDriverId: activeDriverId };
            updateLocations.mutate([...locations, newLoc]);
          }}
        />
      );
    case 'settlement':
      return (
        <Dashboard
          transactions={filteredTransactions}
          drivers={filteredDrivers}
          locations={filteredLocations}
          dailySettlements={filteredSettlements}
          aiLogs={aiLogs}
          currentUser={currentUser}
          onUpdateDrivers={(d) => updateDrivers.mutateAsync(d).then(() => {})}
          onUpdateLocations={(l) => updateLocations.mutate(l)}
          onDeleteLocations={(ids) => deleteLocations.mutate(ids)}
          onUpdateTransaction={(id, updates) => updateTransaction.mutate({ txId: id, updates })}
          onNewTransaction={() => {}}
          onSaveSettlement={(s) => saveSettlement.mutate(s)}
          onSync={async () => syncOfflineData.mutate()}
          isSyncing={syncOfflineData.isPending}
          offlineCount={unsyncedCount}
          lang={lang}
          onNavigate={(nextView) => onSetView(nextView as DriverView)}
          initialTab="settlement"
          hideTabs={true}
        />
      );
    case 'debt':
      return (
        <DebtManager
          drivers={filteredDrivers}
          locations={filteredLocations}
          currentUser={currentUser}
          onUpdateLocations={(l) => updateLocations.mutate(l)}
          lang={lang}
        />
      );
    case 'history':
      return <TransactionHistory transactions={filteredTransactions} locations={locations} onAnalyze={() => {}} />;
    case 'requests':
      return (
        <LocationChangeRequestForm
          locations={filteredLocations}
          currentUser={currentUser}
          lang={lang}
          isOnline={isOnline}
        />
      );
    case 'status':
      return (
        <DriverStatusPanel
          driver={activeDriver}
          locations={locations}
          transactions={filteredTransactions}
          lang={lang}
        />
      );
    default:
      return null;
  }
};

export default DriverShellViewRenderer;
