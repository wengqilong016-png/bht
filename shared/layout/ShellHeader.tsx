import { Crown } from 'lucide-react';
import React from 'react';

import SyncStatusPill from '../SyncStatusPill';

import type { SyncStatus } from '../../hooks/useSyncStatus';

interface ShellHeaderProps {
  subtitle: string;
  title: string;
  syncStatus: SyncStatus;
  lang: 'zh' | 'sw';
  /** Show BAHATI logo on mobile (when sidebar hidden) */
  showMobileBrand?: boolean;
  actions?: React.ReactNode;
  /** Content rendered below the header row (e.g. mobile nav tabs) */
  belowHeader?: React.ReactNode;
}

const ShellHeader: React.FC<ShellHeaderProps> = ({
  subtitle,
  title,
  syncStatus,
  lang,
  showMobileBrand = false,
  actions,
  belowHeader,
}) => (
  <header className="border-b flex-shrink-0 z-30 bg-white/95 backdrop-blur border-[#e0d8cc] pt-[max(env(safe-area-inset-top),0px)]">
    <div className="flex items-center justify-between px-4 py-2.5 sm:py-3">
      <div className="flex items-center gap-3">
        {showMobileBrand && (
          <div className="md:hidden flex items-center gap-2">
            <div className="bg-[#171310] text-amber-400 p-1.5 rounded-xl">
              <Crown size={14} fill="currentColor" />
            </div>
            <span className="text-xs font-bold text-[#1a1816]">BAHATI</span>
          </div>
        )}
        <div>
          <p className="text-caption font-black text-[#a09080] uppercase tracking-[0.2em]">{subtitle}</p>
          <p className="text-sm font-black text-[#1a1816] uppercase leading-tight">{title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex">
          <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" />
        </div>
        {actions}
      </div>
    </div>
    <div className="px-3 pb-2.5 sm:hidden">
      <SyncStatusPill syncStatus={syncStatus} lang={lang} variant="light" fullWidth />
    </div>
    {belowHeader}
  </header>
);

export default ShellHeader;
