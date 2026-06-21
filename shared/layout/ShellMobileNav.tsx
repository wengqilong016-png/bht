import { MoreHorizontal, X } from 'lucide-react';
import React, { useState } from 'react';

export interface MobileNavItem {
  id: string;
  icon: React.ReactElement;
  label: string;
  badge?: number;
  stat?: { value: number; label: string };
  hideStatOnBadge?: boolean;
}

interface ShellMobileNavProps {
  /** Primary items shown directly in the tab bar */
  items: MobileNavItem[];
  /** Overflow items shown in the "More" popover */
  overflowItems?: MobileNavItem[];
  activeView: string;
  onSelectView: (id: string) => void;
  /** 'bottom' = fixed at bottom (driver), 'top' = inline in header (admin) */
  position: 'bottom' | 'top';
  lang: 'zh' | 'sw';
}

const ShellMobileNav: React.FC<ShellMobileNavProps> = ({
  items,
  overflowItems,
  activeView,
  onSelectView,
  position,
  lang,
}) => {
  const [showOverflow, setShowOverflow] = useState(false);
  const hasOverflow = overflowItems && overflowItems.length > 0;
  const isActiveInOverflow = hasOverflow && overflowItems.some(item => item.id === activeView);
  const gridCols = hasOverflow ? items.length + 1 : items.length;

  const wrapperClass = position === 'bottom'
    ? 'fixed inset-x-0 bottom-0 z-40 min-h-[var(--mobile-nav-height,4.75rem)] border-t border-[#e0d8cc] bg-[#faf7f2]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden'
    : 'md:hidden border-t border-[#e0d8cc] px-2 py-2';

  return (
    <div className={wrapperClass}>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const active = activeView === item.id;
          const showStat = item.stat && !(item.hideStatOnBadge && item.badge && item.badge > 0);
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-btn px-1.5 py-1.5 text-caption font-black transition-all ${
                active ? 'bg-[#171310] text-white' : 'text-[#a09080]'
              }`}
            >
              {item.icon}
              <span className="max-w-full truncate text-[10px] leading-3">{item.label}</span>
              {showStat && (
                <span className={`text-[10px] font-bold leading-3 normal-case ${active ? 'text-[#c0b0a0]' : 'text-[#8c7e6d]'}`}>
                  {item.stat!.value}
                </span>
              )}
              {item.badge != null && item.badge > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full text-caption font-black flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          );
        })}

        {hasOverflow && (
          <div className="relative">
            <button
              onClick={() => setShowOverflow(!showOverflow)}
              className={`flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-0.5 rounded-btn px-1.5 py-1.5 text-caption font-black transition-all ${
                isActiveInOverflow ? 'bg-[#171310] text-white' : showOverflow ? 'bg-[#e8e0d8] text-[#3d3028]' : 'text-[#a09080]'
              }`}
            >
              {showOverflow ? <X size={16} /> : <MoreHorizontal size={16} />}
              <span className="max-w-full truncate text-[10px] leading-3">{lang === 'zh' ? '更多' : 'More'}</span>
            </button>

            {showOverflow && (
              <div className={`absolute z-50 ${position === 'bottom' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 min-w-[160px] rounded-card border border-[#e0d8cc] bg-white p-2 shadow-xl shadow-black/10`}>
                {overflowItems.map((item) => {
                  const active = activeView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectView(item.id);
                        setShowOverflow(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-btn text-left transition-colors ${
                        active
                          ? 'bg-[#171310] text-white'
                          : 'text-[#7a6e5e] hover:bg-[#f0ebe4]'
                      }`}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      <span className="text-caption uppercase leading-tight truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShellMobileNav;
