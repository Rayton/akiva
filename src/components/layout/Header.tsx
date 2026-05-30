import React, { useState } from 'react';
import {
  Bell,
  Download,
  LogOut,
  Moon,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { DateRangePicker, getDefaultDateRange } from '../common/DateRangePicker';
import { navigateToPath } from '../../lib/navigation';

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'A';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'A';
}

export function Header() {
  const { currentUser, isDarkMode, toggleDarkMode, signOut } = useApp();
  const [timeframe, setTimeframe] = useState(getDefaultDateRange);

  const handleSignOut = () => {
    void signOut().finally(() => navigateToPath('/login'));
  };

  return (
    <header className="border-b border-akiva-border bg-akiva-surface/95 px-5 py-4 text-akiva-text backdrop-blur transition-colors">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-akiva-text-muted" />
            <input
              type="text"
              placeholder="Search POs, GRNs, suppliers, reports, or ask AI"
              className="h-12 w-full rounded-full border border-akiva-border bg-akiva-surface-raised pl-12 pr-4 text-sm font-medium text-akiva-text shadow-sm outline-none transition placeholder:text-akiva-text-muted focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent"
            />
          </div>

        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <DateRangePicker
            value={timeframe}
            onChange={setTimeframe}
            className="w-full sm:w-fit"
            triggerClassName="min-h-10 px-3 py-1"
            panelClassName="right-0"
          />

          <HeaderIconButton label="Dashboard filters">
            <SlidersHorizontal className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton label="Export">
            <Download className="h-4 w-4" />
          </HeaderIconButton>
          <HeaderIconButton label="AI assistant">
            <Sparkles className="h-4 w-4" />
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
            {currentUser.avatar ? (
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-akiva-surface-raised"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-akiva-accent text-xs font-semibold text-white ring-2 ring-akiva-surface-raised">
                {initials(currentUser.name)}
              </span>
            )}
            <div className="hidden pr-2 md:block">
              <p className="max-w-[110px] truncate text-sm font-semibold text-akiva-text">{currentUser.name}</p>
              <p className="max-w-[140px] truncate text-xs text-akiva-text-muted">{currentUser.companyName || currentUser.role}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-akiva-accent text-white shadow-sm shadow-violet-950/10 transition hover:bg-akiva-accent-strong"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
