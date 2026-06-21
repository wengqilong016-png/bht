import { Phone, Calculator, Trash2, Percent, Coins, MapPin, Car, Banknote, CheckCircle2, AlertCircle } from 'lucide-react';
import React from 'react';

import { useAuth } from '../../contexts/AuthContext';
import { TRANSLATIONS } from '../../types';

import { DriverWithStats } from './hooks/useDriverManagement';

interface DriverGridProps {
  paginatedDrivers: DriverWithStats[];
  driversWithStats: DriverWithStats[];
  onEdit: (driver: DriverWithStats) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onShowSalary: (id: string) => void;
  isSettledToday?: (driverId: string) => boolean;
  hasCollectionsToday?: (driverId: string) => boolean;
}

function formatRelativeTime(ts: string, zh: boolean): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return zh ? '刚刚' : 'just now';
  if (mins < 60) return zh ? `${mins}分钟前` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return zh ? `${hrs}小时前` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return zh ? `${days}天前` : `${days}d ago`;
  return new Date(ts).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
}

const DriverGrid: React.FC<DriverGridProps> = ({
  paginatedDrivers, driversWithStats, onEdit, onDelete, onToggleStatus, onShowSalary,
  isSettledToday, hasCollectionsToday
}) => {
  const { lang } = useAuth();
  const t = TRANSLATIONS[lang];
  const revenueMax = Math.max(...driversWithStats.map(d => d.stats.totalRevenue), 1);

  const zh = lang === 'zh';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 animate-in slide-in-from-bottom-2">
      {paginatedDrivers.map(driver => {
        const revProgress = Math.min(100, (driver.stats.totalRevenue / revenueMax) * 100);
        const commPct = ((driver.commissionRate ?? 0.05) * 100).toFixed(0);
        const hasVehicle = driver.vehicleInfo?.model || driver.vehicleInfo?.plate;

        return (
          <div key={driver.id} className="bg-white rounded-2xl border border-[#e0d8cc] shadow-sm hover:shadow-lg hover:border-[#c8beb0] transition-all duration-200 overflow-hidden group">

            {/* ── Header: avatar + identity ── */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3">
              {/* Avatar */}
              <button
                onClick={() => onToggleStatus(driver.id)}
                className="relative flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2a2420] to-amber-600 text-white flex items-center justify-center font-black text-lg shadow-md hover:shadow-lg hover:scale-105 transition-all"
                title={zh ? '点击切换状态' : 'Click to toggle status'}
              >
                {driver.name.charAt(0)}
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${driver.status === 'active' ? 'bg-emerald-500' : 'bg-[#c8beb0]'}`} />
              </button>

              <div className="min-w-0 flex-1">
                <h4 className="font-black text-[#171310] text-sm uppercase tracking-wide truncate">{driver.name}</h4>
                <p className="text-caption font-bold text-[#a09080] truncate">{driver.username}</p>
              </div>

              {/* Status pill */}
              <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-caption font-bold uppercase ${
                driver.status === 'active'
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                  : 'bg-[#ede6dc] text-[#a09080] border border-[#e0d8cc]'
              }`}>
                {driver.status === 'active' ? t.driving : t.stopped}
              </span>
            </div>

            {/* ── Settlement status ── */}
            {hasCollectionsToday?.(driver.id) && (
              <div className={`mx-5 mb-3 px-3 py-1.5 rounded-lg text-caption font-black uppercase flex items-center gap-2 ${
                isSettledToday?.(driver.id)
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {isSettledToday?.(driver.id)
                  ? <><CheckCircle2 size={12} /> {zh ? '已日结' : 'Settled'}</>
                  : <><AlertCircle size={12} /> {zh ? '待日结' : 'Settle Due'}</>
                }
              </div>
            )}

            {/* ── Revenue bar ── */}
            <div className="px-5 pb-4">
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-caption font-black text-[#a09080] uppercase tracking-wider">{t.totalRevenue}</p>
                <p className="text-caption font-black text-[#171310]">TZS {driver.stats.totalRevenue.toLocaleString()}</p>
              </div>
              <div className="w-full h-2 bg-[#ede6dc] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-500 to-amber-400"
                  style={{ width: `${revProgress}%` }}
                />
              </div>
              <p className="text-caption font-bold text-[#a09080] mt-1">
                {driver.stats.txCount} {zh ? '笔交易' : 'txns'}
              </p>
              {/* ── Today stats (3 columns) ── */}
              <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[#e8e0d4]">
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#a09080] uppercase tracking-wider">{t.todayCollectionCount}</p>
                  <p className="text-sm font-black text-amber-600 mt-0.5">{driver.stats.todayTxCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#a09080] uppercase tracking-wider">{t.todayRevenueTotal}</p>
                  <p className="text-sm font-black text-emerald-600 mt-0.5">TZS {driver.stats.todayRevenue.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-bold text-[#a09080] uppercase tracking-wider">{t.lastActiveTime}</p>
                  <p className="text-xs font-bold text-[#8c7e6d] mt-0.5">
                    {driver.lastActive ? formatRelativeTime(driver.lastActive, zh) : t.neverActive}
                  </p>
                </div>
              </div>
            </div>

            {/* ── 3-column key metrics ── */}
            <div className="grid grid-cols-3 gap-2 px-5 pb-4">
              <div className="bg-[#f3efe8] rounded-xl p-2.5 text-center border border-[#e8e0d4]">
                <Banknote size={12} className="text-amber-500 mx-auto mb-0.5" />
                <p className="text-caption font-black text-[#a09080] uppercase">{t.baseSalaryShort}</p>
                <p className="text-xs font-bold text-[#2a2420] mt-0.5">TZS {(driver.baseSalary ?? 300000).toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-2.5 text-center border border-amber-100">
                <Percent size={12} className="text-amber-500 mx-auto mb-0.5" />
                <p className="text-caption font-black text-amber-600 uppercase">{t.commissionShort}</p>
                <p className="text-xs font-bold text-amber-700 mt-0.5">{commPct}%</p>
              </div>
              <div className="bg-amber-50/50 rounded-xl p-2.5 text-center border border-amber-100">
                <Coins size={12} className="text-amber-500 mx-auto mb-0.5" />
                <p className="text-caption font-black text-amber-600 uppercase">{zh ? '硬币' : 'Coins'}</p>
                <p className="text-xs font-bold text-amber-700 mt-0.5">{(driver.dailyFloatingCoins ?? 0).toLocaleString()}</p>
              </div>
            </div>

            {/* ── Info chips ── */}
            <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
              {/* Debt */}
              {driver.remainingDebt > 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 text-rose-600 text-caption font-bold">
                  💸 TZS {driver.remainingDebt.toLocaleString()}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-caption font-bold">
                  ✓ {zh ? '无欠款' : 'No debt'}
                </span>
              )}

              {/* Phone */}
              {driver.phone && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#f3efe8] text-[#8c7e6d] text-caption font-bold">
                  <Phone size={10} /> {driver.phone}
                </span>
              )}

              {/* Vehicle */}
              {hasVehicle && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-50 text-sky-600 text-caption font-bold">
                  <Car size={10} />
                  {[driver.vehicleInfo?.model, driver.vehicleInfo?.plate].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>

            {/* ── Actions footer ── */}
            <div className="flex items-center gap-2 px-5 pb-5 pt-1 border-t border-[#e8e0d4]">
              <button
                onClick={() => onShowSalary(driver.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 text-amber-700 rounded-xl text-caption font-black uppercase hover:from-amber-100 hover:to-amber-200 transition-all"
              >
                <Calculator size={12} /> {t.payrollTitle}
              </button>
              <button
                onClick={() => onEdit(driver)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#171310] text-white rounded-xl text-caption font-black uppercase hover:bg-[#2a2420] transition-all"
              >
                {t.settings}
              </button>
              <button
                onClick={() => onDelete(driver.id)}
                className="flex-shrink-0 p-2.5 bg-white border border-[#e0d8cc] text-[#a09080] rounded-xl hover:text-rose-500 hover:border-rose-200 hover:bg-rose-50 transition-all"
                title={zh ? '删除司机' : 'Delete driver'}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}
      {paginatedDrivers.length === 0 && (
        <div className="col-span-full py-16 text-center">
          <div className="w-16 h-16 bg-[#ede6dc] rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin size={24} className="text-[#c0b0a0]" />
          </div>
          <p className="text-sm font-black text-[#c0b0a0] uppercase tracking-widest">{t.noDriversFound}</p>
          <p className="text-caption text-[#a09080] mt-1">{zh ? '调整筛选条件试试' : 'Try adjusting your search filters'}</p>
        </div>
      )}
    </div>
  );
};

export default DriverGrid;
