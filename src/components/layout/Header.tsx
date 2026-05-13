import React, { useState } from 'react';
import {
  Bell,
  ChevronDown,
  Download,
  Moon,
  Plus,
  Search,
  Settings,
  Share2,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { DateRangePicker, getDefaultDateRange } from '../common/DateRangePicker';

function HeaderIconButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
    >
      {children}
    </button>
  );
}

export function Header() {
  const { currentUser, isDarkMode, toggleDarkMode, setCurrentPage } = useApp();
  const [timeframe, setTimeframe] = useState(getDefaultDateRange);

  return (
    <header className="border-b border-akiva-border bg-akiva-bg px-5 py-4 text-akiva-text backdrop-blur transition-colors">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-akiva-text-muted" />
            <input
              type="text"
              placeholder='Try searching "inventory valuation"'
              className="h-12 w-full rounded-full border border-akiva-border bg-akiva-surface-raised pl-12 pr-4 text-sm font-medium text-akiva-text shadow-sm outline-none transition placeholder:text-akiva-text-muted focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent"
            />
          </div>

          <button
            type="button"
            onClick={() => setCurrentPage('dashboard')}
            className="hidden items-center gap-2 rounded-full bg-akiva-surface-raised px-2 py-1 text-left shadow-sm transition hover:bg-akiva-surface-muted 2xl:flex"
            aria-label="Go to dashboard"
            title="Go to dashboard"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-akiva-text text-xs font-bold text-akiva-surface-raised">A</span>
            <span className="whitespace-nowrap text-sm font-semibold text-akiva-text">Akiva ERP</span>
            <ChevronDown className="h-4 w-4 text-akiva-text-muted" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <DateRangePicker
            value={timeframe}
            onChange={setTimeframe}
            className="w-full sm:w-[320px]"
            triggerClassName="min-h-10 px-3 py-1"
            panelClassName="right-0"
          />

          <HeaderIconButton label="Dashboard filters">
            <SlidersHorizontal className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton label="Export">
            <Download className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton label="Share">
            <Share2 className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleDarkMode}>
            {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </HeaderIconButton>
          <HeaderIconButton label="Notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-akiva-accent ring-2 ring-akiva-surface-raised" />
          </HeaderIconButton>
          <HeaderIconButton label="Settings">
            <Settings className="h-4 w-4" />
          </HeaderIconButton>

          <div className="ml-1 flex items-center gap-2 rounded-full bg-akiva-surface-raised p-1.5 shadow-sm">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-akiva-surface-raised"
            />
            <div className="hidden pr-2 md:block">
              <p className="max-w-[110px] truncate text-sm font-semibold text-akiva-text">{currentUser.name}</p>
              <p className="text-xs text-akiva-text-muted">{currentUser.role}</p>
            </div>
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-akiva-accent text-white shadow-lg shadow-rose-600/25 transition hover:bg-akiva-accent-strong"
            aria-label="Create new item"
            title="Create new item"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
