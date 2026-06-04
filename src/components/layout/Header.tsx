import React, { Fragment, useMemo, useState } from 'react';
import { Menu, Transition } from '@headlessui/react';
import {
  Bell,
  ChevronDown,
  Download,
  LibraryBig,
  LogOut,
  Moon,
  Package,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Truck,
  UserCircle,
  Users,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { DateRangePicker, getDefaultDateRange } from '../common/DateRangePicker';
import { openCustomerWorkspaceModal } from '../../lib/customerWorkspaceModal';
import { canOpenCustomerWorkspace } from '../../lib/customerWorkspaceAccess';
import { navigateToPath } from '../../lib/navigation';
import { DIRECTORY_LINKS, type DirectoryLink } from '../../lib/directoryLinks';

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

const directoryIcons: Record<DirectoryLink['id'], React.ComponentType<{ className?: string }>> = {
  customers: Users,
  items: Package,
  suppliers: Truck,
};

export function Header() {
  const { currentUser, isDarkMode, toggleDarkMode, signOut, setCurrentPage, appMenu } = useApp();
  const [timeframe, setTimeframe] = useState(getDefaultDateRange);
  const visibleDirectoryLinks = useMemo(
    () => DIRECTORY_LINKS.filter((link) => link.id !== 'customers' || canOpenCustomerWorkspace(appMenu)),
    [appMenu]
  );

  const handleSignOut = () => {
    void signOut().finally(() => navigateToPath('/login'));
  };

  const openProfile = () => {
    setCurrentPage('profile');
    navigateToPath('/profile');
  };

  const openDirectoryLink = (link: DirectoryLink) => {
    if (link.id === 'customers') {
      openCustomerWorkspaceModal();
      return;
    }

    setCurrentPage(link.pageId);
    navigateToPath(link.path);
  };

  return (
    <header className="relative z-[80] border-b border-akiva-border bg-akiva-surface/95 px-5 py-4 text-akiva-text backdrop-blur transition-colors">
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

          <Menu as="div" className="relative ml-1">
            <Menu.Button className="flex items-center gap-2 rounded-full bg-akiva-surface-raised p-1.5 text-left shadow-sm transition hover:bg-akiva-surface-muted focus:outline-none focus:ring-2 focus:ring-akiva-accent">
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
              <div className="hidden pr-1 md:block">
                <p className="max-w-[110px] truncate text-sm font-semibold text-akiva-text">{currentUser.name}</p>
                <p className="max-w-[140px] truncate text-xs text-akiva-text-muted">{currentUser.companyName || currentUser.role}</p>
              </div>
              <ChevronDown className="mr-1 hidden h-4 w-4 text-akiva-text-muted md:block" />
            </Menu.Button>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="scale-95 opacity-0"
              enterTo="scale-100 opacity-100"
              leave="transition ease-in duration-75"
              leaveFrom="scale-100 opacity-100"
              leaveTo="scale-95 opacity-0"
            >
              <Menu.Items className="absolute right-0 z-[120] mt-2 w-64 origin-top-right overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface-raised text-akiva-text shadow-lg focus:outline-none">
                <div className="border-b border-akiva-border px-4 py-3">
                  <p className="truncate text-sm font-semibold">{currentUser.name}</p>
                  <p className="truncate text-xs text-akiva-text-muted">{currentUser.email || currentUser.role}</p>
                </div>
                <div className="p-1">
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={openProfile}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                          active ? 'bg-akiva-accent-soft text-akiva-text' : 'text-akiva-text'
                        }`}
                      >
                        <UserCircle className="h-4 w-4" />
                        Profile
                      </button>
                    )}
                  </Menu.Item>
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                          active ? 'bg-akiva-accent-soft text-akiva-text' : 'text-akiva-text'
                        }`}
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </Menu.Items>
            </Transition>
          </Menu>

          <Menu as="div" className="relative">
            <Menu.Button
              className="flex h-11 w-11 items-center justify-center rounded-full bg-akiva-accent text-white shadow-sm shadow-violet-950/10 transition hover:bg-akiva-accent-strong focus:outline-none focus:ring-2 focus:ring-akiva-accent"
              aria-label="Open directory links"
              title="Open directory links"
            >
              <LibraryBig className="h-5 w-5" />
            </Menu.Button>
            <Transition
              as={Fragment}
              enter="transition ease-out duration-100"
              enterFrom="scale-95 opacity-0"
              enterTo="scale-100 opacity-100"
              leave="transition ease-in duration-75"
              leaveFrom="scale-100 opacity-100"
              leaveTo="scale-95 opacity-0"
            >
              <Menu.Items className="absolute right-0 z-[120] mt-2 w-[21rem] origin-top-right rounded-lg border border-akiva-border bg-akiva-surface-raised p-2 shadow-lg focus:outline-none">
                <div className="grid grid-cols-3 gap-2">
                  {visibleDirectoryLinks.map((link) => {
                    const Icon = directoryIcons[link.id];
                    return (
                      <Menu.Item key={link.id}>
                        {({ active }) => (
                          <button
                            type="button"
                            onClick={() => openDirectoryLink(link)}
                            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border px-2 text-sm font-semibold transition ${
                              active
                                ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-text'
                                : 'border-akiva-border bg-akiva-surface text-akiva-text'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                            <span className="truncate">{link.label}</span>
                          </button>
                        )}
                      </Menu.Item>
                    );
                  })}
                </div>
              </Menu.Items>
            </Transition>
          </Menu>
        </div>
      </div>
    </header>
  );
}
