import { Search, Pencil, Trash2, Save, Loader2, Store, X, Image as ImageIcon, ToggleLeft, ToggleRight, AlertTriangle, User, Users } from 'lucide-react';
import React, { useMemo, useState } from 'react';

import { useConfirm } from '../../contexts/ConfirmContext';
import { useToast } from '../../contexts/ToastContext';
import { logFinanceAuditBatch } from '../../services/financeAuditService';
import { Money } from '../../utils/money';
import { Location, Driver, Transaction } from '../../types';
import { getOptimizedImageUrl } from '../../utils/imageUtils';
import { getLocationDeletionDiagnostics, normalizeMachineId } from '../../utils/locationWorkflow';

interface SitesTabProps {
  managedLocations: Location[];
  siteSearch: string;
  setSiteSearch: (v: string) => void;
  isAdmin: boolean;
  driverMap: Map<string, Driver>;
  drivers: Driver[];
  locations: Location[];
  onUpdateLocations: (locations: Location[]) => Promise<void> | void;
  onDeleteLocations?: (ids: string[]) => Promise<void> | void;
  transactions: Transaction[];
  pendingResetRequests: Transaction[];
  pendingPayoutRequests: Transaction[];
  isOnline: boolean;
  isLoadingLocations?: boolean;
  lang: 'zh' | 'sw';
  actorId?: string;
}

const SitesTab: React.FC<SitesTabProps> = ({
  managedLocations,
  siteSearch,
  setSiteSearch,
  isAdmin,
  driverMap,
  drivers,
  locations,
  onUpdateLocations,
  onDeleteLocations,
  transactions,
  pendingResetRequests,
  pendingPayoutRequests,
  isOnline,
  isLoadingLocations,
  lang,
  actorId,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [viewingPhotoLoc, setViewingPhotoLoc] = useState<Location | null>(null);
  const [locEditForm, setLocEditForm] = useState({
    name: '',
    area: '',
    machineId: '',
    latitude: '',
    longitude: '',
    commissionRate: '',
    lastScore: '',
    status: 'active' as Location['status'],
    ownerName: '',
    shopOwnerPhone: '',
    assignedDriverId: '',
    initialStartupDebt: '',
    remainingStartupDebt: '',
    dividendBalance: '',
    isNewOffice: false,
    lastRevenueDate: '',
    adminNote: '',
  });
  const [isSavingLoc, setIsSavingLoc] = useState(false);
  const [statusIssueFilter, setStatusIssueFilter] = useState<'all' | 'issue' | 'maintenance' | 'broken'>('all');
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null); // null=all, '__unassigned__'=unassigned

  /** Driver → machine count for chip badges */
  const driverMachineCounts = useMemo(() => {
    const map = new Map<string, { driver: Driver; count: number }>();
    for (const loc of managedLocations) {
      if (loc.assignedDriverId) {
        const d = driverMap.get(loc.assignedDriverId);
        if (d) {
          const entry = map.get(d.id) || { driver: d, count: 0 };
          entry.count++;
          map.set(d.id, entry);
        }
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [managedLocations, driverMap]);

  const unassignedMachineCount = useMemo(
    () => managedLocations.filter(l => !l.assignedDriverId).length,
    [managedLocations],
  );

  /** Filter by selected driver first, then by status */
  const filteredByDriver = useMemo(() => {
    if (!selectedDriverId) return managedLocations;
    if (selectedDriverId === '__unassigned__') return managedLocations.filter(l => !l.assignedDriverId);
    return managedLocations.filter(l => l.assignedDriverId === selectedDriverId);
  }, [managedLocations, selectedDriverId]);
  const deletionDiagnosticsById = useMemo(() => {
    return new Map(
      managedLocations.map((loc) => [
        loc.id,
        getLocationDeletionDiagnostics({
          location: loc,
          transactions,
          pendingResetRequests,
          pendingPayoutRequests,
          isAdminOverride: true,
        }),
      ]),
    );
  }, [managedLocations, pendingPayoutRequests, pendingResetRequests, transactions]);

  /** Latest non-active reportedStatus per location, from recent transactions */
  const locationReportMap = useMemo(() => {
    const map = new Map<string, { status: string; timestamp: string }>();
    // Walk transactions newest-first; first hit per locationId wins
    const sorted = [...transactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    for (const tx of sorted) {
      if (!tx.locationId || map.has(tx.locationId)) continue;
      if (tx.reportedStatus && tx.reportedStatus !== 'active') {
        map.set(tx.locationId, { status: tx.reportedStatus, timestamp: tx.timestamp });
      }
    }
    return map;
  }, [transactions]);

  /** Filter by status issue on top of driver selection */
  const filteredByStatusIssue = useMemo(() => {
    if (statusIssueFilter === 'all') return filteredByDriver;
    return filteredByDriver.filter((loc) => {
      const report = locationReportMap.get(loc.id);
      if (!report) return false;
      if (statusIssueFilter === 'issue') return true;
      return report.status === statusIssueFilter;
    });
  }, [filteredByDriver, locationReportMap, statusIssueFilter]);

  const handleEditLocation = (loc: Location) => {
    setEditingLoc(loc);
    setLocEditForm({
      name: loc.name,
      area: loc.area || '',
      machineId: loc.machineId || '',
      latitude: loc.coords?.lat?.toString() || '',
      longitude: loc.coords?.lng?.toString() || '',
      commissionRate: (loc.commissionRate * 100).toString(),
      lastScore: loc.lastScore.toString(),
      status: loc.status,
      ownerName: loc.ownerName || '',
      shopOwnerPhone: loc.shopOwnerPhone || '',
      assignedDriverId: loc.assignedDriverId || '',
      initialStartupDebt: loc.initialStartupDebt.toString(),
      remainingStartupDebt: loc.remainingStartupDebt.toString(),
      dividendBalance: (loc.dividendBalance ?? 0).toString(),
      isNewOffice: loc.isNewOffice || false,
      lastRevenueDate: loc.lastRevenueDate || '',
      adminNote: '',
    });
  };

  const handleSaveLocation = async () => {
    if (!editingLoc) return;
    const normalizedMachineId = normalizeMachineId(locEditForm.machineId);
    const parsedLat = Number.parseFloat(locEditForm.latitude);
    const parsedLng = Number.parseFloat(locEditForm.longitude);
    const hasManualCoords = locEditForm.latitude.trim() !== '' || locEditForm.longitude.trim() !== '';

    if (!normalizedMachineId) {
      showToast(lang === 'zh' ? '请输入有效机器编号' : 'Weka nambari sahihi ya mashine', 'warning');
      return;
    }

    const duplicateMachineExists = locations.some(
      (location) =>
        location.id !== editingLoc.id &&
        normalizeMachineId(location.machineId) === normalizedMachineId,
    );

    if (duplicateMachineExists) {
      showToast(`机器编号 ${normalizedMachineId} 已存在。\nMachine ID ${normalizedMachineId} already exists.`, 'error');
      return;
    }

    if (hasManualCoords) {
      const coordsValid =
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        Math.abs(parsedLat) <= 90 &&
        Math.abs(parsedLng) <= 180;

      if (!coordsValid) {
        showToast(lang === 'zh' ? '请输入有效坐标' : 'Weka viwianishi sahihi', 'warning');
        return;
      }
    }

    setIsSavingLoc(true);
    const rate = parseFloat(locEditForm.commissionRate) / 100;
    const updated: Location = {
      ...editingLoc,
      name: locEditForm.name,
      area: locEditForm.area,
      machineId: normalizedMachineId,
      coords: hasManualCoords
        ? { lat: parsedLat, lng: parsedLng }
        : editingLoc.coords,
      commissionRate: isNaN(rate) ? editingLoc.commissionRate : rate,
      lastScore: (v => Number.isNaN(v) ? editingLoc.lastScore : v)(parseInt(locEditForm.lastScore, 10)),
      status: locEditForm.status,
      ownerName: locEditForm.ownerName,
      shopOwnerPhone: locEditForm.shopOwnerPhone,
      assignedDriverId: locEditForm.assignedDriverId || undefined,
      initialStartupDebt: parseInt(locEditForm.initialStartupDebt) || 0,
      remainingStartupDebt: parseInt(locEditForm.remainingStartupDebt) || 0,
      dividendBalance: (v => Number.isNaN(v) ? (editingLoc.dividendBalance ?? 0) : v)(parseInt(locEditForm.dividendBalance, 10)),
      isNewOffice: locEditForm.isNewOffice,
      lastRevenueDate: locEditForm.lastRevenueDate.trim() || undefined,
      isSynced: false,
    };
    try {
      await onUpdateLocations(locations.map(l => l.id === updated.id ? updated : l));

      // Fire-and-forget audit entries for financial field changes
      const auditEntries: Parameters<typeof logFinanceAuditBatch>[0] = [];
      if (editingLoc.commissionRate !== updated.commissionRate) {
        auditEntries.push({
          event_type: 'commission_rate_change',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: editingLoc.commissionRate,
          new_value: updated.commissionRate,
        });
      }
      if ((editingLoc.remainingStartupDebt ?? 0) !== (updated.remainingStartupDebt ?? 0)) {
        auditEntries.push({
          event_type: 'startup_debt_edit',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: Money.tzs(editingLoc.remainingStartupDebt ?? 0),
          new_value: Money.tzs(updated.remainingStartupDebt ?? 0),
        });
      }
      if ((editingLoc.dividendBalance ?? 0) !== (updated.dividendBalance ?? 0)) {
        auditEntries.push({
          event_type: 'dividend_balance_edit',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: Money.tzs(editingLoc.dividendBalance ?? 0),
          new_value: Money.tzs(updated.dividendBalance ?? 0),
        });
      }
      if (editingLoc.lastScore !== updated.lastScore) {
        auditEntries.push({
          event_type: 'last_score_edit',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: editingLoc.lastScore,
          new_value: updated.lastScore,
        });
      }
      if (editingLoc.status !== updated.status) {
        auditEntries.push({
          event_type: 'location_status_change',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: null,
          new_value: null,
          payload: { from: editingLoc.status, to: updated.status },
        });
      }
      const trimmedNote = locEditForm.adminNote.trim();
      if (trimmedNote) {
        auditEntries.push({
          event_type: 'admin_machine_note',
          entity_type: 'location',
          entity_id: updated.id,
          entity_name: updated.name,
          actor_id: actorId ?? 'unknown',
          old_value: null,
          new_value: null,
          payload: { note: trimmedNote },
        });
      }
      if (auditEntries.length > 0) logFinanceAuditBatch(auditEntries);

      setEditingLoc(null);
      showToast(lang === 'zh' ? '点位已保存' : 'Location saved', 'success');
    } catch (error) {
      console.error('Failed to save location changes:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast(`${lang === 'zh' ? '点位保存失败' : 'Imeshindwa kuhifadhi eneo'}：${message}`, 'error');
    } finally {
      setIsSavingLoc(false);
    }
  };

  const handleDeleteLocation = async (locId: string) => {
    if (!isAdmin) {
      showToast(
        lang === 'zh'
          ? '只有管理员可以删除机器点位。'
          : 'Only administrators can delete locations.',
        'error',
      );
      return;
    }
    if (!isOnline) {
      showToast(
        lang === 'zh'
          ? '当前处于离线状态，无法删除机器。请联网后再操作。'
          : 'You are offline. Cannot delete a machine while offline. Please reconnect.',
        'warning',
      );
      return;
    }
    const diagnostics = deletionDiagnosticsById.get(locId);
    if (!diagnostics) return;

    if (diagnostics.blockers.length > 0) {
      showToast(`当前机器还不能删除：${diagnostics.blockers[0]}`, 'error');
      return;
    }

    const loc = managedLocations.find((l) => l.id === locId);
    if (!loc) return;

    const relatedDetails: string[] = [];
    if (diagnostics.related.assignedDriverId) {
      const assignedDriverName = driverMap.get(diagnostics.related.assignedDriverId)?.name ?? diagnostics.related.assignedDriverId;
      relatedDetails.push(
        lang === 'zh'
          ? `绑定司机：${assignedDriverName}（删除时会先解绑）`
          : `Assigned driver: ${assignedDriverName} (will be unassigned before deletion)`,
      );
    }
    if (diagnostics.related.totalTransactions > 0) {
      relatedDetails.push(
        lang === 'zh'
          ? `历史交易：${diagnostics.related.totalTransactions} 条（保留历史，不删除；系统会自动解除地点关联）`
          : `Historical transactions: ${diagnostics.related.totalTransactions} (kept for reporting; the location link will be removed automatically)`,
      );
    }
    if (diagnostics.related.pendingApprovalTransactions > 0) {
      relatedDetails.push(
        lang === 'zh'
          ? `待审批交易：${diagnostics.related.pendingApprovalTransactions} 条`
          : `Pending approval transactions: ${diagnostics.related.pendingApprovalTransactions}`,
      );
    }
    if (diagnostics.related.unsettledCollections > 0) {
      relatedDetails.push(
        lang === 'zh'
          ? `未结算收款：${diagnostics.related.unsettledCollections} 条`
          : `Unsettled collections: ${diagnostics.related.unsettledCollections}`,
      );
    }
    if (diagnostics.related.pendingResetRequests > 0) {
      relatedDetails.push(
        lang === 'zh'
          ? `待处理重置申请：${diagnostics.related.pendingResetRequests} 条`
          : `Pending reset requests: ${diagnostics.related.pendingResetRequests}`,
      );
    }
    if (diagnostics.related.pendingPayoutRequests > 0) {
      relatedDetails.push(
        lang === 'zh'
          ? `待处理提现申请：${diagnostics.related.pendingPayoutRequests} 条`
          : `Pending payout requests: ${diagnostics.related.pendingPayoutRequests}`,
      );
    }

    const relatedText =
      relatedDetails.length > 0
        ? `\n\n${lang === 'zh' ? '关联明细' : 'Related records'}:\n- ${relatedDetails.join('\n- ')}`
        : '';
    const warningText =
      diagnostics.warnings.length > 0
        ? `\n\n${lang === 'zh' ? '删除提醒' : 'Deletion notes'}:\n- ${diagnostics.warnings.join('\n- ')}`
        : '';

    const ok = await confirm({
      title: lang === 'zh' ? '确认删除机器点位' : 'Confirm Delete Location',
      message:
        lang === 'zh'
          ? `机器「${loc.name}」删除后将从点位列表移除，且不可恢复。${relatedText}${warningText}`
          : `Location "${loc.name}" will be removed from the active site list and cannot be restored.${relatedText}${warningText}`,
      confirmLabel: lang === 'zh' ? '确认删除' : 'Delete',
      cancelLabel: lang === 'zh' ? '取消' : 'Cancel',
      destructive: true,
    });
    if (!ok || !onDeleteLocations) return;

    try {
      if (loc.assignedDriverId) {
        const unassigned: Location = { ...loc, assignedDriverId: undefined, isSynced: false };
        await onUpdateLocations(locations.map((location) => (location.id === locId ? unassigned : location)));
      }

      await onDeleteLocations([locId]);
      await logFinanceAuditBatch([{
        event_type: 'location_delete',
        entity_type: 'location',
        entity_id: locId,
        entity_name: loc.name,
        actor_id: actorId ?? 'admin',
        old_value: 1,
        new_value: 0,
        payload: {
          action: 'location_delete',
          unassignedDriverId: diagnostics.related.assignedDriverId ?? null,
          historicalTransactionsRetained: diagnostics.related.totalTransactions,
          pendingApprovalTransactions: diagnostics.related.pendingApprovalTransactions,
          unsettledCollections: diagnostics.related.unsettledCollections,
          pendingResetRequests: diagnostics.related.pendingResetRequests,
          pendingPayoutRequests: diagnostics.related.pendingPayoutRequests,
          unlinkMode: 'transactions.locationId -> NULL on delete',
        },
      }]);
      setEditingLoc(null);
      showToast(lang === 'zh' ? '机器已删除' : 'Location deleted', 'success');
    } catch (error) {
      console.error('Failed to delete location:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast(`${lang === 'zh' ? '删除失败' : 'Imeshindwa kufuta'}：${message}`, 'error');
    }
  };

  const handleForceClearBlockers = async (locId: string) => {
    if (!isOnline) {
      showToast(lang === 'zh' ? '离线状态无法执行此操作' : 'Cannot clear while offline', 'warning');
      return;
    }
    const loc = managedLocations.find((l) => l.id === locId);
    if (!loc) return;

    const diagnostics = deletionDiagnosticsById.get(locId);
    if (!diagnostics || diagnostics.blockers.length === 0) {
      showToast(lang === 'zh' ? '该机器当前没有删除阻塞项' : 'No blockers found for this machine', 'warning');
      return;
    }

    const ok = await confirm({
      title: lang === 'zh' ? '强制清除删除阻塞' : 'Force Clear Blockers',
      message: lang === 'zh'
        ? `将对机器「${loc.name}」执行以下操作：\n• 启动债务清零\n• 分红余额清零\n• 解除重置锁定\n\n此操作不可撤销，请确认。`
        : `This will clear startup debt, dividend balance and reset lock for "${loc.name}".\nThis cannot be undone.`,
      confirmLabel: lang === 'zh' ? '确认清除' : 'Clear',
      cancelLabel: lang === 'zh' ? '取消' : 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    try {
      const cleared: Location = {
        ...loc,
        remainingStartupDebt: 0,
        dividendBalance: 0,
        resetLocked: false,
        isSynced: false,
      };
      await onUpdateLocations(locations.map((l) => (l.id === locId ? cleared : l)));

      // Audit trail
      await logFinanceAuditBatch([{
        event_type: 'force_clear_blockers',
        entity_type: 'location',
        entity_id: locId,
        entity_name: loc.name,
        actor_id: actorId ?? 'admin',
        old_value: Money.tzs(loc.remainingStartupDebt),
        new_value: Money.zero('TZS'),
        payload: {
          action: 'force_clear_blockers',
          cleared: {
            remainingStartupDebt: loc.remainingStartupDebt,
            dividendBalance: loc.dividendBalance,
            resetLocked: loc.resetLocked,
          },
        },
      }]);

      showToast(lang === 'zh' ? '阻塞项已清除，现在可以删除该机器' : 'Blockers cleared, machine can now be deleted', 'success');
    } catch (error) {
      console.error('Failed to clear blockers:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      showToast(`${lang === 'zh' ? '清除失败' : 'Imeshindwa kusafisha'}：${message}`, 'error');
    }
  };

  return (
    <>
      <div className="space-y-3 animate-in fade-in">
        {/* ── Driver Chip Selector ──────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#e0d8cc] shadow-sm p-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {/* All */}
            <button
              onClick={() => setSelectedDriverId(null)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all ${
                !selectedDriverId
                  ? 'bg-[#171310] text-white shadow-md'
                  : 'bg-[#f3efe8] text-[#8c7e6d] hover:bg-[#ede6dc]'
              }`}
            >
              <Users size={14} />
              <span>{lang === 'zh' ? '全部' : 'All'}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-caption font-black ${!selectedDriverId ? 'bg-white/20 text-white' : 'bg-[#e0d8cc] text-[#7a6e5e]'}`}>
                {managedLocations.length}
              </span>
            </button>

            {/* Unassigned */}
            {unassignedMachineCount > 0 && (
              <button
                onClick={() => setSelectedDriverId('__unassigned__')}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all ${
                  selectedDriverId === '__unassigned__'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <User size={14} />
                <span>{lang === 'zh' ? '未分配' : 'Unassigned'}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-caption font-black ${selectedDriverId === '__unassigned__' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-700'}`}>
                  {unassignedMachineCount}
                </span>
              </button>
            )}

            {/* Driver chips */}
            {driverMachineCounts.map(({ driver, count }) => (
              <button
                key={driver.id}
                onClick={() => setSelectedDriverId(driver.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase transition-all ${
                  selectedDriverId === driver.id
                    ? 'bg-[#171310] text-white shadow-md'
                    : 'bg-[#f3efe8] text-[#8c7e6d] hover:bg-[#ede6dc]'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-caption font-black ${
                  selectedDriverId === driver.id ? 'bg-white/20 text-white' : 'bg-[#e0d8cc] text-[#7a6e5e]'
                }`}>
                  {driver.name.charAt(0)}
                </span>
                <span className="max-w-[100px] truncate">{driver.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-caption font-black ${selectedDriverId === driver.id ? 'bg-white/20 text-white' : 'bg-[#e0d8cc] text-[#7a6e5e]'}`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Search + Status Filter ────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-white p-3 rounded-2xl border border-[#e0d8cc] shadow-sm">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 w-full md:w-64">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a09080]" />
              <input type="text" placeholder="Search machines..." value={siteSearch} onChange={e => setSiteSearch(e.target.value)} className="w-full bg-[#f3efe8] border border-[#e0d8cc] rounded-xl py-2.5 pl-11 pr-4 text-xs font-bold" />
            </div>
            <select value={statusIssueFilter} onChange={e => { setStatusIssueFilter(e.target.value as 'all' | 'issue' | 'maintenance' | 'broken'); setSiteSearch(''); }} className="bg-[#f3efe8] border border-[#e0d8cc] rounded-xl py-2.5 px-4 text-xs font-bold uppercase outline-none flex-shrink-0">
              <option value="all">{lang === 'zh' ? '全部状态' : 'All Status'}</option>
              <option value="issue">⚠️ {lang === 'zh' ? '有异常报告' : 'Has Issue'}</option>
              <option value="maintenance">🔧 {lang === 'zh' ? '维护中' : 'Maintenance'}</option>
              <option value="broken">💔 {lang === 'zh' ? '故障' : 'Broken'}</option>
            </select>
          </div>
          <p className="text-caption font-bold text-[#a09080] flex-shrink-0">
            {filteredByStatusIssue.length} / {managedLocations.length} {lang === 'zh' ? '台机器' : 'machines'}
          </p>
        </div>
        {isLoadingLocations && managedLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#a09080]">
            <Loader2 size={32} className="animate-spin" />
            <span className="text-caption font-bold uppercase tracking-widest">
              {lang === 'zh' ? '加载网点数据...' : 'Loading machines...'}
            </span>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredByStatusIssue.map(loc => {
            const sitePhotoUrl = loc.machinePhotoUrl || loc.ownerPhotoUrl;
            const deletionDiagnostics = deletionDiagnosticsById.get(loc.id);
            const deleteBlocked = (deletionDiagnostics?.blockers.length ?? 0) > 0;
            const debtPct = loc.initialStartupDebt > 0
              ? Math.round((1 - loc.remainingStartupDebt / loc.initialStartupDebt) * 100)
              : 100;
            return (
            <div key={loc.id} className="bg-white rounded-2xl border border-[#e0d8cc] shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
              {/* Photo / placeholder header */}
              <div className="h-40 bg-[#ede6dc] relative rounded-t-2xl overflow-hidden flex-shrink-0">
                {sitePhotoUrl ? (
                  <img src={getOptimizedImageUrl(sitePhotoUrl, 400, 400)} alt={loc.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                    <Store size={36} className="text-[#c0b0a0]" />
                    <span className="text-caption font-bold uppercase tracking-widest text-[#c0b0a0]">No Photo</span>
                  </div>
                )}
                {/* Status badge */}
                <div className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-caption font-black uppercase backdrop-blur-sm ${loc.status === 'active' ? 'bg-emerald-500/90 text-white' : loc.status === 'maintenance' ? 'bg-amber-500/90 text-white' : 'bg-rose-500/90 text-white'}`}>
                  {loc.status === 'active' ? (lang === 'zh' ? '运营中' : 'Active') : loc.status === 'maintenance' ? (lang === 'zh' ? '维护中' : 'Maint.') : (lang === 'zh' ? '停用' : 'Inactive')}
                </div>
                {/* View photo button */}
                {sitePhotoUrl && (
                  <button type="button" aria-label="View photo location" onClick={() => setViewingPhotoLoc(loc)} className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-xl bg-[#0f0d0a]/70 px-2.5 py-1.5 text-caption font-black uppercase text-white backdrop-blur-sm">
                    <ImageIcon size={10} />
                    {lang === 'zh' ? '查看' : 'View'}
                  </button>
                )}
              </div>

              {/* Card body */}
              <div className="p-4 flex-1 flex flex-col gap-3">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-black text-[#171310] uppercase tracking-wide leading-tight">{loc.machineId || '—'}</p>
                    <p className="text-xs text-[#8c7e6d] mt-0.5 truncate">{loc.name}</p>
                    {loc.area && <p className="text-caption font-bold text-[#a09080] uppercase mt-0.5">{loc.area}</p>}
                    {loc.assignedDriverId && (
                      <p className="text-caption font-bold text-amber-600 mt-1">
                        👤 {driverMap.get(loc.assignedDriverId)?.name || loc.assignedDriverId}
                      </p>
                    )}
                  </div>
                  {/* Edit button only in top-right; delete is in footer */}
                  <button type="button" aria-label="Edit site" onClick={() => handleEditLocation(loc)} className="flex-shrink-0 p-2.5 text-[#a09080] hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-colors">
                    <Pencil size={15} />
                  </button>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-[#f3efe8] p-2.5 rounded-xl text-center">
                    <p className="text-caption font-black text-[#a09080] uppercase mb-0.5">{lang === 'zh' ? '分数' : 'Score'}</p>
                    <p className="text-sm font-black text-[#2a2420]">{loc.lastScore.toLocaleString()}</p>
                  </div>
                  <div className="bg-amber-50 p-2.5 rounded-xl text-center border border-amber-100">
                    <p className="text-caption font-black text-amber-500 uppercase mb-0.5">{lang === 'zh' ? '佣金' : 'Comm.'}</p>
                    <p className="text-sm font-black text-amber-700">{(loc.commissionRate * 100).toFixed(0)}%</p>
                  </div>
                  <div className={`p-2.5 rounded-xl text-center ${loc.remainingStartupDebt > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                    <p className={`text-caption font-black uppercase mb-0.5 ${loc.remainingStartupDebt > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{lang === 'zh' ? '启动债' : 'Debt'}</p>
                    <p className={`text-sm font-black ${loc.remainingStartupDebt > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{loc.remainingStartupDebt > 0 ? `${debtPct}%` : '✓'}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl text-center ${(loc.dividendBalance ?? 0) > 0 ? 'bg-teal-50' : 'bg-[#f3efe8]'}`}>
                    <p className={`text-caption font-black uppercase mb-0.5 ${(loc.dividendBalance ?? 0) > 0 ? 'text-teal-400' : 'text-[#a09080]'}`}>{lang === 'zh' ? '留存' : 'Retain'}</p>
                    <p className={`text-sm font-black ${(loc.dividendBalance ?? 0) > 0 ? 'text-teal-700' : 'text-[#a09080]'}`}>{(loc.dividendBalance ?? 0) > 0 ? `${(loc.dividendBalance ?? 0).toLocaleString()}` : '0'}</p>
                  </div>
                </div>

                {/* Startup debt detail (only if has debt) */}
                {loc.remainingStartupDebt > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-caption font-black text-amber-700 uppercase">{lang === 'zh' ? '启动债务余额' : 'Startup Debt Remaining'}</span>
                      <span className="text-caption font-bold text-amber-600">{debtPct}% {lang === 'zh' ? '已还' : 'repaid'}</span>
                    </div>
                    <div className="w-full bg-amber-200 rounded-full h-1.5 mb-1">
                      <div className="bg-amber-500 h-1.5 rounded-full transition-all" style={{ width: `${debtPct}%` }} />
                    </div>
                    <p className="text-caption text-amber-700 font-bold">
                      TZS {loc.remainingStartupDebt.toLocaleString()} / {loc.initialStartupDebt.toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Info pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${loc.shopOwnerPhone ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f3efe8] text-[#c0b0a0]'}`}>📞 {loc.shopOwnerPhone || (lang === 'zh' ? '无' : 'None')}</span>
                  <span className={`inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${loc.ownerPhotoUrl ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f3efe8] text-[#c0b0a0]'}`}>📷 {loc.ownerPhotoUrl ? (lang === 'zh' ? '已上传' : 'Photo') : (lang === 'zh' ? '无' : 'None')}</span>
                  <span className={`inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${loc.coords?.lat ? 'bg-emerald-50 text-emerald-600' : 'bg-[#f3efe8] text-[#c0b0a0]'}`}>📍 {loc.coords?.lat ? (lang === 'zh' ? '已定位' : 'GPS') : (lang === 'zh' ? '无' : 'None')}</span>
                  {loc.resetLocked && (
                    <span className="inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">🔒 {lang === 'zh' ? '已锁定' : 'Locked'}</span>
                  )}
                  {loc.isNewOffice && (
                    <span className="inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-600">🆕 {lang === 'zh' ? '新点位' : 'New'}</span>
                  )}
                  {loc.lastRevenueDate && (
                    <span className="inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">📅 {loc.lastRevenueDate}</span>
                  )}
                  {(() => {
                    const report = locationReportMap.get(loc.id);
                    if (!report) return null;
                    return (
                      <span className={`inline-flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${report.status === 'broken' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                        <AlertTriangle size={10} /> {lang === 'zh' ? '司机报' : 'Reported'}: {report.status === 'maintenance' ? (lang === 'zh' ? '维护' : 'Maint') : (lang === 'zh' ? '故障' : 'Broken')}
                      </span>
                    );
                  })()}
                </div>

                {/* Owner name */}
                {loc.ownerName && (
                  <p className="text-xs text-[#8c7e6d] truncate">👤 {loc.ownerName}</p>
                )}
              </div>

              {/* Footer: delete button */}
              <div className="px-4 pb-4">
                {deleteBlocked ? (
                  <div className="space-y-1.5">
                    <button
                      disabled
                      title={deletionDiagnostics?.blockers.join(' | ')}
                      className="w-full bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 text-center cursor-not-allowed"
                    >
                      <p className="text-caption font-bold text-rose-400">{lang === 'zh' ? '⚠️ 无法删除：' : '⚠️ Blocked: '}{deletionDiagnostics?.blockers[0]}</p>
                      {(deletionDiagnostics?.blockers.length ?? 0) > 1 && (
                        <p className="text-caption text-rose-300 mt-0.5">+{(deletionDiagnostics?.blockers.length ?? 1) - 1} {lang === 'zh' ? '个阻塞项' : 'more'}</p>
                      )}
                    </button>
                    <button
                      onClick={() => void handleForceClearBlockers(loc.id)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 text-caption font-bold transition-colors"
                    >
                      🔓 {lang === 'zh' ? '强制清除阻塞（清零债务/余额/锁定）' : 'Force Clear Blockers'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => void handleDeleteLocation(loc.id)}
                    title={lang === 'zh' ? '删除点位' : 'Delete location'}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-rose-100 bg-rose-50 text-rose-400 hover:bg-rose-100 hover:text-rose-600 text-xs font-bold transition-colors"
                  >
                    <Trash2 size={13} />
                    {lang === 'zh' ? '删除此点位' : 'Delete Location'}
                  </button>
                )}
              </div>
            </div>
          );
          })}
        </div>
        )}
      </div>

      {/* Location Edit Modal */}
      {editingLoc && (
        <div className="fixed inset-0 z-[80] bg-[#171310]/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-card shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="flex items-center justify-between p-5 border-b border-[#e8e0d4] bg-[#f3efe8]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-amber-600 rounded-xl text-white shrink-0"><Store size={18} /></div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-[#171310] truncate">编辑点位 · Edit Location</h3>
                  <p className="text-caption font-bold text-[#a09080] uppercase truncate">{editingLoc.name} · {editingLoc.machineId}</p>
                </div>
              </div>
              <button aria-label="Close" onClick={() => setEditingLoc(null)} className="p-2 bg-white rounded-full text-[#a09080] shadow-sm hover:text-rose-500 transition-colors shrink-0"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-5 max-h-[68vh] overflow-y-auto">
              {/* ── 基本信息 Basics ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#171310]">基本信息</span>
                  <span className="text-caption font-bold text-[#a09080] uppercase">Basics</span>
                  <div className="flex-1 h-px bg-[#e8e0d4]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">点位名称 Name</label>
                    <input value={locEditForm.name} onChange={e => setLocEditForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">区域 Area</label>
                    <input value={locEditForm.area} onChange={e => setLocEditForm(f => ({ ...f, area: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">机器编号 Machine ID</label>
                    <input value={locEditForm.machineId} onChange={e => setLocEditForm(f => ({ ...f, machineId: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">状态 Status</label>
                    <select value={locEditForm.status} onChange={e => setLocEditForm(f => ({ ...f, status: e.target.value as Location['status'] }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors">
                      <option value="active">🟢 正常 Active</option>
                      <option value="maintenance">🔧 维护 Maintenance</option>
                      <option value="broken">💔 故障 Broken</option>
                      <option value="inactive">⏸️ 停用 Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-caption font-black text-[#a09080] uppercase ml-1">分配司机 Assigned Driver</label>
                  <select value={locEditForm.assignedDriverId} onChange={e => setLocEditForm(f => ({ ...f, assignedDriverId: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors">
                    <option value="">-- 未分配 Unassigned --</option>
                    {drivers.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  aria-pressed={locEditForm.isNewOffice}
                  onClick={() => setLocEditForm(f => ({ ...f, isNewOffice: !f.isNewOffice }))}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors ${locEditForm.isNewOffice ? 'bg-sky-50 border-sky-200' : 'bg-[#f3efe8] border-[#e0d8cc]'}`}
                >
                  <span className="text-caption font-black text-[#a09080] uppercase">新点位 New Office</span>
                  {locEditForm.isNewOffice ? <ToggleRight size={28} className="text-sky-500" /> : <ToggleLeft size={28} className="text-[#c0b0a0]" />}
                </button>
              </div>

              {/* ── 读数与位置 Reading & Location ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#171310]">读数与位置</span>
                  <span className="text-caption font-bold text-[#a09080] uppercase">Reading & Location</span>
                  <div className="flex-1 h-px bg-[#e8e0d4]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">上次读数 Last Score</label>
                    <input type="number" inputMode="numeric" value={locEditForm.lastScore} onChange={e => setLocEditForm(f => ({ ...f, lastScore: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">最近营收日 Last Revenue</label>
                    <input value={locEditForm.lastRevenueDate} onChange={e => setLocEditForm(f => ({ ...f, lastRevenueDate: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" placeholder="e.g. 2026-05-09" />
                  </div>
                </div>
                <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 space-y-3">
                  <div>
                    <p className="text-caption font-black text-sky-600 uppercase">GPS 坐标 Coordinates</p>
                    <p className="text-caption font-bold text-[#a09080]">管理端可手动粘贴定位 / paste coordinates</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-caption font-black text-[#a09080] uppercase ml-1">Latitude</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={locEditForm.latitude}
                        onChange={e => setLocEditForm(f => ({ ...f, latitude: e.target.value.replace(/[^0-9.-]/g, '') }))}
                        className="w-full bg-white border border-sky-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-sky-400 transition-colors"
                        placeholder="-6.823490"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-caption font-black text-[#a09080] uppercase ml-1">Longitude</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={locEditForm.longitude}
                        onChange={e => setLocEditForm(f => ({ ...f, longitude: e.target.value.replace(/[^0-9.-]/g, '') }))}
                        className="w-full bg-white border border-sky-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-sky-400 transition-colors"
                        placeholder="39.269510"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 财务设置 Finance（敏感字段，改动均记入审计） ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-700">财务设置</span>
                  <span className="text-caption font-bold text-amber-500/80 uppercase">Finance · audited</span>
                  <div className="flex-1 h-px bg-amber-200/70" />
                </div>
                <div className="space-y-1">
                  <label className="text-caption font-black text-[#a09080] uppercase ml-1">分红比例 Commission</label>
                  {/* type=text + inputMode=decimal: a controlled type=number input mangles decimals
                      like 16.66 (trailing-dot reads back empty), silently reverting on save. */}
                  <div className="flex items-center bg-white border border-[#e0d8cc] rounded-xl pl-3 pr-2 focus-within:border-amber-400 transition-colors">
                    <input type="text" inputMode="decimal" value={locEditForm.commissionRate} onChange={e => setLocEditForm(f => ({ ...f, commissionRate: e.target.value.replace(/[^0-9.]/g, '') }))} className="flex-1 min-w-0 bg-transparent py-2.5 text-xs font-bold outline-none" />
                    <span className="text-xs font-black text-amber-500 shrink-0">%</span>
                  </div>
                  <p className="text-caption font-bold text-[#a09080] ml-1">司机收款时按此比例计算店主理论分红 · 支持小数(如 16.66)</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                  <p className="text-caption font-black text-amber-600 uppercase">启动押金 Startup Capital · TZS</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-caption font-black text-[#a09080] uppercase ml-1">初始 Initial</label>
                      <input type="number" inputMode="numeric" value={locEditForm.initialStartupDebt} onChange={e => setLocEditForm(f => ({ ...f, initialStartupDebt: e.target.value }))} className="w-full bg-white border border-amber-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-caption font-black text-[#a09080] uppercase ml-1">剩余 Remaining</label>
                      <input type="number" inputMode="numeric" value={locEditForm.remainingStartupDebt} onChange={e => setLocEditForm(f => ({ ...f, remainingStartupDebt: e.target.value }))} className="w-full bg-white border border-amber-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-teal-50 rounded-2xl border border-teal-100 space-y-1">
                  <label className="text-caption font-black text-teal-600 uppercase ml-1">分红余额 Dividend Balance · TZS</label>
                  <input type="number" inputMode="numeric" value={locEditForm.dividendBalance} onChange={e => setLocEditForm(f => ({ ...f, dividendBalance: e.target.value }))} className="w-full bg-white border border-teal-100 rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-teal-400 transition-colors" />
                  <p className="text-caption font-bold text-teal-500/80 ml-1">管理员可直接调整站点分红余额 · 改动会记入审计</p>
                </div>
              </div>

              {/* ── 店主与备注 Owner & Note ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#171310]">店主与备注</span>
                  <span className="text-caption font-bold text-[#a09080] uppercase">Owner & Note</span>
                  <div className="flex-1 h-px bg-[#e8e0d4]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">店主 Owner Name</label>
                    <input value={locEditForm.ownerName} onChange={e => setLocEditForm(f => ({ ...f, ownerName: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-caption font-black text-[#a09080] uppercase ml-1">店主电话 Owner Phone</label>
                    <input value={locEditForm.shopOwnerPhone} onChange={e => setLocEditForm(f => ({ ...f, shopOwnerPhone: e.target.value }))} className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 transition-colors" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-caption font-black text-[#a09080] uppercase ml-1">管理员备注 Admin Note（自由填写）</label>
                  <textarea
                    value={locEditForm.adminNote}
                    onChange={e => setLocEditForm(f => ({ ...f, adminNote: e.target.value }))}
                    rows={2}
                    placeholder="写一点信息（保存后记入该机器的审计记录）"
                    className="w-full bg-white border border-[#e0d8cc] rounded-xl px-3 py-2.5 text-xs font-bold outline-none focus:border-amber-400 resize-y transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-[#e8e0d4] bg-[#f3efe8] flex gap-3">
              <button
                onClick={() => void handleDeleteLocation(editingLoc.id)}
                disabled={(deletionDiagnosticsById.get(editingLoc.id)?.blockers.length ?? 0) > 0}
                className="p-3 bg-rose-50 border border-rose-100 text-rose-500 rounded-2xl hover:bg-rose-100 transition-colors disabled:cursor-not-allowed disabled:bg-[#ede6dc] disabled:border-[#e0d8cc] disabled:text-[#c0b0a0]"
                title="删除点位"
              >
                <Trash2 size={16} />
              </button>
              <button type="button" aria-label="Cancel" onClick={() => setEditingLoc(null)} className="flex-1 py-3 bg-white border border-[#e0d8cc] text-[#8c7e6d] rounded-2xl text-xs font-bold uppercase hover:bg-[#f3efe8] transition-colors">
                Cancel
              </button>
              <button type="button" aria-label="Save changes" onClick={handleSaveLocation} disabled={isSavingLoc} className="flex-1 py-3 bg-amber-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-amber-100 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-all">
                {isSavingLoc ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingPhotoLoc && (
        <div className="fixed inset-0 z-[85] bg-[#171310]/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setViewingPhotoLoc(null)}>
          <div className="bg-white w-full max-w-2xl rounded-card shadow-2xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-[#e8e0d4]">
              <div>
                <h3 className="text-sm font-black text-[#171310] uppercase">{viewingPhotoLoc.name}</h3>
                <p className="text-caption font-bold text-[#a09080] uppercase">{viewingPhotoLoc.machineId}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setViewingPhotoLoc(null)} className="p-2 bg-[#f3efe8] rounded-full text-[#a09080] hover:text-rose-500 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="bg-[#f3efe8] p-4">
              <img
                src={getOptimizedImageUrl(viewingPhotoLoc.machinePhotoUrl || viewingPhotoLoc.ownerPhotoUrl || '', 1200, 1200)}
                alt={viewingPhotoLoc.name}
                className="w-full max-h-[70vh] object-contain rounded-card border border-[#e0d8cc] bg-white"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(SitesTab);
