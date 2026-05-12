import React, { useState } from 'react';
import {
  Bell,
  CalendarDays,
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
import { SearchableSelect } from '../common/SearchableSelect';

const TIMEFRAME_OPTIONS = [
  { value: 'Sep 1 - Nov 30, 2023', label: 'Sep 1 - Nov 30, 2023' },
  { value: 'Last 30 days', label: 'Last 30 days' },
  { value: 'This quarter', label: 'This quarter' },
  { value: 'This fiscal year', label: 'This fiscal year' },
];

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
      className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/86 text-slate-700 shadow-sm shadow-slate-200/60 transition hover:bg-white hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800 dark:hover:text-white"
    >
      {children}
    </button>
  );
}

export function Header() {
  const { currentUser, isDarkMode, toggleDarkMode } = useApp();
  const [timeframe, setTimeframe] = useState('Sep 1 - Nov 30, 2023');

  return (
    <header className="border-b border-white/70 bg-[#f2eeee]/92 px-5 py-4 text-slate-950 backdrop-blur transition-colors dark:border-slate-800 dark:bg-slate-950/92 dark:text-white">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder='Try searching "inventory valuation"'
              className="h-12 w-full rounded-full border border-white/80 bg-white/88 pl-12 pr-4 text-sm font-medium text-slate-900 shadow-sm shadow-slate-200/70 outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:bg-white focus:ring-4 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-900/78 dark:text-white dark:shadow-black/20 dark:placeholder:text-slate-500 dark:focus:border-rose-700 dark:focus:bg-slate-900 dark:focus:ring-rose-950/50"
            />
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-white/70 px-2 py-1 shadow-sm shadow-slate-200/60 dark:bg-slate-900/70 dark:shadow-black/20 2xl:flex">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white dark:bg-white dark:text-slate-950">A</span>
            <span className="whitespace-nowrap text-sm font-semibold text-slate-800 dark:text-slate-200">Akiva ERP</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/82 px-3 py-2 shadow-sm shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-900/76 dark:shadow-black/20">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="hidden text-sm font-semibold text-slate-700 dark:text-slate-200 sm:inline">Timeframe</span>
            <SearchableSelect
              value={timeframe}
              onChange={(value) => setTimeframe(value)}
              options={TIMEFRAME_OPTIONS}
              className="w-[170px]"
              inputClassName="h-auto rounded-none border-0 bg-transparent px-0 py-0 pr-6 text-sm font-semibold text-slate-800 shadow-none outline-none focus:border-transparent focus:ring-0 dark:border-transparent dark:bg-transparent dark:text-slate-200"
              panelClassName="right-0 min-w-[190px]"
              placeholder="Search timeframe"
            />
          </div>

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
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-600 ring-2 ring-white dark:ring-slate-900" />
          </HeaderIconButton>
          <HeaderIconButton label="Settings">
            <Settings className="h-4 w-4" />
          </HeaderIconButton>

          <div className="ml-1 flex items-center gap-2 rounded-full bg-white/82 p-1.5 shadow-sm shadow-slate-200/60 dark:bg-slate-900/76 dark:shadow-black/20">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="h-9 w-9 rounded-full object-cover ring-2 ring-white dark:ring-slate-800"
            />
            <div className="hidden pr-2 md:block">
              <p className="max-w-[110px] truncate text-sm font-semibold text-slate-900 dark:text-white">{currentUser.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{currentUser.role}</p>
            </div>
          </div>

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
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
