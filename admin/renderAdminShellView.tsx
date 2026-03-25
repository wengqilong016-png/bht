import React, { lazy } from 'react';
import type { AdminView } from './adminShellConfig';
import { isDashboardBackedAdminView, } from './adminShellViewState';
import { mapAdminViewToDashboardTab } from './adminShellConfig';

const Dashboard = lazy(() => import('../components/Dashboard'));
const CollectionForm = lazy(() => import('../components/CollectionForm'));
const TransactionHistory = lazy(() => import('../components/TransactionHistory'));
const FinancialReports = lazy(() => import('../components/FinancialReports'));
const AIHub = lazy(() => import('../components/ai-hub'));
const DebtManager = lazy(() => import('../components/DebtManager'));
const BillingReconciliation = lazy(() => import('../components/BillingReconciliation'));
const DriverManagement = lazy(() => import('../components/driver-management'));
const LocationChangeReview = lazy(() => import('./pages/LocationChangeReview'));
const QueueDiagnostics = lazy(() => import('./components/QueueDiagnostics'));
const FleetDiagnostics = lazy(() => import('./components/FleetDiagnostics'));
const HealthAlerts = lazy(() => import('./components/HealthAlerts'));
const AuditTrail = lazy(() => import('./components/AuditTrail'));
const SupportCases = lazy(() => import('./components/SupportCases'));
const CaseDetail = lazy(() => import('./components/CaseDetail'));

interface AdminShellViewRendererProps {
  view: AdminView;
  currentUser: any;
  lang: 'zh' | 'sw';
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
  aiContextId: string;
  auditCaseFilter: string;
  selectedCaseId: string;
  onSetView: (view: AdminView) => void;
  onClearAiContext: () => void;
  onConsumeAuditCaseFilter: () => void;
  onSelectCaseId: (caseId: string) => void;
  onSetAuditCaseFilter: (caseId: string) => void;
  syncOfflineData: any;
  updateDrivers: any;
  updateLocations: any;
  deleteLocations: any;
  deleteDrivers: any;
  updateTransaction: any;
  saveSettlement: any;
  logAI: any;
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
  aiContextId,
  auditCaseFilter,
  selectedCaseId,
  onSetView,
  onClearAiContext,
  onConsumeAuditCaseFilter,
  onSelectCaseId,
  onSetAuditCaseFilter,
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
          onUpdateDrivers={(d) => updateDrivers.mutateAsync(d).then(() => {})}
          onUpdateLocations={(l) => updateLocations.mutate(l)}
          onDeleteDrivers={(ids) => deleteDrivers.mutate(ids)}
        />
      );
    case 'billing':
      return (
        <BillingReconciliation
          drivers={filteredDrivers}
          transactions={filteredTransactions}
          dailySettlements={filteredSettlements}
        />
      );
    case 'collect':
      return (
        <CollectionForm
          locations={filteredLocations}
          currentDriver={drivers.find((d) => d.id === activeDriverId) || drivers[0]}
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
    case 'history':
      return <TransactionHistory transactions={filteredTransactions} locations={locations} onAnalyze={() => {}} />;
    case 'reports':
      return (
        <FinancialReports
          transactions={filteredTransactions}
          drivers={filteredDrivers}
          locations={filteredLocations}
          dailySettlements={filteredSettlements}
          lang={lang}
        />
      );
    case 'debt':
      return (
        <DebtManager
          drivers={filteredDrivers}
          locations={filteredLocations}
          currentUser={currentUser}
          onUpdateLocations={(l) => updateLocations.mutate(l)}
          onUpdateDrivers={(d) => updateDrivers.mutateAsync(d).then(() => {})}
          lang={lang}
        />
      );
    case 'ai':
      return (
        <AIHub
          drivers={filteredDrivers}
          locations={filteredLocations}
          transactions={filteredTransactions}
          onLogAI={(l) => logAI.mutate(l)}
          currentUser={currentUser}
          initialContextId={aiContextId}
          onClearContext={onClearAiContext}
        />
      );
    case 'change-review':
      return <LocationChangeReview locations={locations} lang={lang} />;
    case 'diagnostics':
      return <QueueDiagnostics />;
    case 'fleet-diagnostics':
      return <FleetDiagnostics />;
    case 'health-alerts':
      return <HealthAlerts />;
    case 'support-cases':
      return (
        <SupportCases
          onNavigateToAudit={(caseId) => {
            onSetAuditCaseFilter(caseId);
            onSetView('audit-trail');
          }}
          onNavigateToCaseDetail={(caseId) => {
            onSelectCaseId(caseId);
            onSetView('case-detail');
          }}
        />
      );
    case 'case-detail':
      return selectedCaseId ? (
        <CaseDetail
          caseId={selectedCaseId}
          onBack={() => onSetView('support-cases')}
          onNavigateToAudit={(caseId) => {
            onSetAuditCaseFilter(caseId);
            onSetView('audit-trail');
          }}
          currentOperator={currentUser.id}
        />
      ) : null;
    case 'audit-trail':
      return (
        <AuditTrail
          initialCaseFilter={auditCaseFilter}
          onCaseFilterConsumed={onConsumeAuditCaseFilter}
          onNavigateToCases={() => onSetView('support-cases')}
        />
      );
    default:
      return null;
  }
};

export default AdminShellViewRenderer;
