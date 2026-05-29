import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Landmark,
  Receipt,
  RefreshCw,
  Search,
  Wallet,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { fetchPettyCashDashboard } from '../data/pettyCashApi';
import { formatDateWithSystemFormat, useSystemDateFormat } from '../lib/dateFormat';
import type {
  PettyCashDashboard,
  PettyCashExpenseExposure,
  PettyCashMonthlyFlow,
  PettyCashMovement,
  PettyCashSettings,
  PettyCashTab,
  PettyCashTabExposure,
} from '../types/pettyCash';

const defaultSettings: PettyCashSettings = {
  companyName: 'Company',
  currencyCode: 'USD',
  currencyName: 'US Dollar',
  currencyDecimalPlaces: 2,
  dateFormat: 'Y-m-d',
};

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatMoney(value: number, settings: PettyCashSettings, currencyCode?: string, decimalPlaces?: number): string {
  const currency = currencyCode || settings.currencyCode || 'USD';
  const decimals = Math.max(0, Number(decimalPlaces ?? settings.currencyDecimalPlaces ?? 2));

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(decimals)}`;
  }
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value || 0)}%`;
}

function formatDate(value: string | null | undefined, dateFormat: string): string {
  if (!value) return '-';
  const raw = String(value);
  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? raw;
  return formatDateWithSystemFormat(isoDate, dateFormat) || raw;
}

function PettyChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <Icon className="h-4 w-4 text-akiva-accent-text" />
      {children}
    </span>
  );
}

function PettyPanel({
  title,
  detail,
  icon: Icon,
  children,
  actions,
}: {
  title: string;
  detail?: string;
  icon: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
            {detail ? <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{detail}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'info';
}) {
  const iconTone =
    tone === 'success'
      ? 'bg-akiva-success-soft text-akiva-success'
      : tone === 'warning'
        ? 'bg-akiva-warning-soft text-akiva-warning'
        : tone === 'info'
          ? 'bg-akiva-info-soft text-akiva-info'
          : 'bg-akiva-accent-soft text-akiva-accent-text';

  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-akiva-text-muted">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-akiva-text">{value}</p>
          <p className="mt-3 text-sm leading-5 text-akiva-text-muted">{note}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PettyCashTab['status'] | PettyCashMovement['status'] | 'Posted' | 'Unposted' }) {
  const classes =
    status === 'Ready' || status === 'Authorised' || status === 'Posted'
      ? 'border-akiva-success bg-akiva-success-soft text-akiva-success'
      : status === 'Over limit'
        ? 'border-akiva-danger bg-akiva-danger-soft text-akiva-danger'
        : 'border-akiva-warning bg-akiva-warning-soft text-akiva-warning';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${classes}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {status}
    </span>
  );
}

function UtilisationBar({ value }: { value: number }) {
  const width = `${Math.max(2, Math.min(100, Math.round(Math.abs(value || 0))))}%`;
  const tone = value > 100 ? 'bg-akiva-danger' : value > 80 ? 'bg-akiva-warning' : 'bg-akiva-accent';

  return (
    <div className="min-w-[140px]">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-akiva-text">{formatPercent(value)}</span>
        <span className="text-akiva-text-muted">limit</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-akiva-surface-muted">
        <div className={`h-2 rounded-full ${tone}`} style={{ width }} />
      </div>
    </div>
  );
}

function TabExposureList({ rows, settings }: { rows: PettyCashTabExposure[]; settings: PettyCashSettings }) {
  const maxValue = Math.max(...rows.map((row) => Math.abs(row.currentBalance)), 1);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
        No petty cash tabs found.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const width = `${Math.max(5, Math.round((Math.abs(row.currentBalance) / maxValue) * 100))}%`;
        return (
          <div key={row.tabCode} className="rounded-lg border border-akiva-border bg-akiva-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-akiva-text">{row.tabCode || 'Untitled tab'}</p>
                <p className="mt-1 truncate text-xs text-akiva-text-muted">{row.userCode || row.status}</p>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold text-akiva-text">
                {formatMoney(row.currentBalance, settings, row.currencyCode, row.currencyDecimalPlaces)}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-akiva-surface-muted">
              <div className="h-2 rounded-full bg-akiva-accent" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpenseExposureList({ rows, settings }: { rows: PettyCashExpenseExposure[]; settings: PettyCashSettings }) {
  const maxValue = Math.max(...rows.map((row) => row.grossAmount), 1);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
        No expense claims found.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const width = `${Math.max(5, Math.round((row.grossAmount / maxValue) * 100))}%`;
        return (
          <div key={row.expenseCode} className="rounded-lg border border-akiva-border bg-akiva-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-akiva-text">{row.expenseCode}</p>
                <p className="mt-1 truncate text-xs text-akiva-text-muted">
                  {row.expenseDescription || `${formatCount(row.movementCount)} movements`}
                </p>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold text-akiva-text">
                {formatMoney(row.grossAmount, settings)}
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-akiva-surface-muted">
              <div className="h-2 rounded-full bg-akiva-warning" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyFlow({ rows, settings }: { rows: PettyCashMonthlyFlow[]; settings: PettyCashSettings }) {
  const maxValue = Math.max(...rows.map((row) => Math.max(row.cashIn, row.cashOut + row.expenses)), 1);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
        No monthly petty cash movement found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const cashWidth = `${Math.max(3, Math.round((row.cashIn / maxValue) * 100))}%`;
        const claimWidth = `${Math.max(3, Math.round(((row.cashOut + row.expenses) / maxValue) * 100))}%`;
        return (
          <div key={row.period} className="rounded-lg border border-akiva-border bg-akiva-surface p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-akiva-text">{row.period}</span>
              <span className="text-xs font-semibold text-akiva-text-muted">{formatMoney(row.netMovement, settings)}</span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-2 rounded-full bg-akiva-surface-muted">
                <div className="h-2 rounded-full bg-akiva-success" style={{ width: cashWidth }} />
              </div>
              <div className="h-2 rounded-full bg-akiva-surface-muted">
                <div className="h-2 rounded-full bg-akiva-warning" style={{ width: claimWidth }} />
              </div>
            </div>
            <div className="mt-2 flex justify-between gap-2 text-xs text-akiva-text-muted">
              <span>In {formatMoney(row.cashIn, settings)}</span>
              <span>Out {formatMoney(row.cashOut + row.expenses, settings)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PettyCash() {
  const systemDateFormat = useSystemDateFormat();
  const [dashboard, setDashboard] = useState<PettyCashDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [status, setStatus] = useState('all');

  const settings = dashboard?.settings ?? { ...defaultSettings, dateFormat: systemDateFormat };
  const dateFormat = settings.dateFormat || systemDateFormat;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await fetchPettyCashDashboard({
        q: debouncedSearch,
        tab,
        status,
      });
      setDashboard(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Petty cash dashboard could not be loaded.');
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshKey]);

  const tabColumns = useMemo<AdvancedTableColumn<PettyCashTab>[]>(() => [
    {
      id: 'tabCode',
      header: 'Tab',
      accessor: (row) => `${row.tabCode} ${row.userCode}`,
      cell: (row) => (
        <span>
          <span className="font-mono font-semibold">{row.tabCode || '-'}</span>
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">{row.userCode || 'No custodian'}</span>
        </span>
      ),
      width: 170,
      alwaysVisible: true,
    },
    {
      id: 'type',
      header: 'Type',
      accessor: (row) => `${row.typeCode} ${row.typeDescription}`,
      cell: (row) => (
        <span>
          {row.typeDescription || row.typeCode || '-'}
          {row.typeCode ? <span className="mt-1 block font-mono text-xs text-akiva-text-muted">{row.typeCode}</span> : null}
        </span>
      ),
      width: 190,
    },
    {
      id: 'limit',
      header: 'Limit',
      accessor: (row) => row.tabLimit,
      cell: (row) => formatMoney(row.tabLimit, settings, row.currencyCode, row.currencyDecimalPlaces),
      exportValue: (row) => row.tabLimit,
      align: 'right',
      width: 150,
    },
    {
      id: 'balance',
      header: 'Balance',
      accessor: (row) => row.currentBalance,
      cell: (row) => <span className="font-semibold">{formatMoney(row.currentBalance, settings, row.currencyCode, row.currencyDecimalPlaces)}</span>,
      exportValue: (row) => row.currentBalance,
      align: 'right',
      width: 150,
    },
    {
      id: 'utilisation',
      header: 'Utilisation',
      accessor: (row) => row.limitUtilisation,
      cell: (row) => <UtilisationBar value={row.limitUtilisation} />,
      exportValue: (row) => row.limitUtilisation,
      width: 180,
    },
    {
      id: 'pending',
      header: 'Pending',
      accessor: (row) => Math.abs(row.pendingCash) + row.pendingExpenses,
      cell: (row) => formatMoney(Math.abs(row.pendingCash) + row.pendingExpenses, settings, row.currencyCode, row.currencyDecimalPlaces),
      exportValue: (row) => Math.abs(row.pendingCash) + row.pendingExpenses,
      align: 'right',
      width: 140,
    },
    {
      id: 'accounts',
      header: 'GL Accounts',
      accessor: (row) => `${row.assignmentAccount} ${row.pettyCashAccount} ${row.assignmentAccountName} ${row.pettyCashAccountName}`,
      cell: (row) => (
        <span>
          <span className="font-mono">{row.pettyCashAccount || '-'}</span>
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">{row.pettyCashAccountName || row.assignmentAccountName || 'No account name'}</span>
        </span>
      ),
      width: 230,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (row) => <StatusPill status={row.status} />,
      width: 150,
      sticky: 'right',
    },
  ], [settings]);

  const movementColumns = useMemo<AdvancedTableColumn<PettyCashMovement>[]>(() => [
    {
      id: 'date',
      header: 'Date',
      accessor: (row) => formatDate(row.date, dateFormat),
      sortValue: (row) => row.date ?? '',
      width: 130,
      alwaysVisible: true,
    },
    {
      id: 'tab',
      header: 'Tab',
      accessor: (row) => `${row.tabCode} ${row.tabUser}`,
      cell: (row) => (
        <span>
          <span className="font-mono font-semibold">{row.tabCode || '-'}</span>
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">{row.tabUser || row.currencyCode || 'No custodian'}</span>
        </span>
      ),
      width: 170,
      alwaysVisible: true,
    },
    {
      id: 'movement',
      header: 'Movement',
      accessor: (row) => `${row.movementLabel} ${row.expenseCode} ${row.expenseDescription}`,
      cell: (row) => (
        <span>
          {row.movementLabel}
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">
            {row.expenseCode === 'ASSIGNCASH' ? row.direction : `${row.expenseCode} ${row.expenseDescription}`.trim()}
          </span>
        </span>
      ),
      width: 220,
    },
    {
      id: 'grossAmount',
      header: 'Gross',
      accessor: (row) => row.grossAmount,
      cell: (row) => (
        <span className="font-semibold">
          {formatMoney(row.grossAmount, settings, row.currencyCode, row.currencyDecimalPlaces)}
        </span>
      ),
      exportValue: (row) => row.grossAmount,
      align: 'right',
      width: 150,
    },
    {
      id: 'taxAmount',
      header: 'Tax',
      accessor: (row) => row.taxAmount,
      cell: (row) => formatMoney(row.taxAmount, settings, row.currencyCode, row.currencyDecimalPlaces),
      exportValue: (row) => row.taxAmount,
      align: 'right',
      width: 130,
    },
    {
      id: 'purpose',
      header: 'Purpose',
      accessor: (row) => row.purpose,
      cell: (row) => <span className="line-clamp-2">{row.purpose || '-'}</span>,
      width: 240,
    },
    {
      id: 'notes',
      header: 'Notes',
      accessor: (row) => row.notes,
      cell: (row) => <span className="line-clamp-2">{row.notes || '-'}</span>,
      width: 260,
    },
    {
      id: 'authorised',
      header: 'Authorised',
      accessor: (row) => row.status,
      cell: (row) => (
        <span>
          <StatusPill status={row.status} />
          <span className="mt-1 block text-xs text-akiva-text-muted">{formatDate(row.authorisedDate, dateFormat)}</span>
        </span>
      ),
      width: 150,
    },
    {
      id: 'posted',
      header: 'Posted',
      accessor: (row) => (row.posted ? 'Posted' : 'Unposted'),
      cell: (row) => <StatusPill status={row.posted ? 'Posted' : 'Unposted'} />,
      width: 130,
      sticky: 'right',
    },
  ], [dateFormat, settings]);

  const summary = dashboard?.summary ?? {
    tabCount: 0,
    totalLimit: 0,
    currentBalance: 0,
    assignedCash: 0,
    transferredCash: 0,
    claimedExpenses: 0,
    pendingCash: 0,
    pendingExpenses: 0,
    authorisedMovements: 0,
    unpostedMovements: 0,
    overLimitTabs: 0,
  };
  const tabs = dashboard?.tabs ?? [];
  const movements = dashboard?.movements ?? [];
  const tabExposure = dashboard?.tabExposure ?? [];
  const expenseExposure = dashboard?.expenseExposure ?? [];
  const monthlyFlow = dashboard?.monthlyFlow ?? [];
  const asOfLabel = dashboard?.asOf ? formatDate(dashboard.asOf, dateFormat) : formatDate(new Date().toISOString().slice(0, 10), dateFormat);
  const limitUse = summary.totalLimit > 0 ? (summary.currentBalance / summary.totalLimit) * 100 : 0;

  return (
    <div className="akiva-page-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <PettyChip icon={Wallet}>Petty Cash</PettyChip>
                  <PettyChip icon={WalletCards}>{formatCount(summary.tabCount)} tabs</PettyChip>
                  <PettyChip icon={summary.unpostedMovements > 0 ? Clock : CheckCircle2}>
                    {formatCount(summary.unpostedMovements)} unposted
                  </PettyChip>
                </div>
                <h1 className="mt-4 akiva-page-title">Petty Cash</h1>
                <p className="akiva-page-subtitle">
                  Cash floats, expense claims, authorisation status, and posting readiness by petty cash tab.
                </p>
                <p className="mt-2 text-xs font-medium text-akiva-text-muted">
                  {settings.companyName} | {settings.currencyCode} | Updated {asOfLabel}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label="Refresh petty cash"
                  title="Refresh petty cash"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSearchInput('');
                    setTab('all');
                    setStatus('all');
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {error ? (
              <div className="rounded-lg border border-akiva-danger bg-akiva-danger-soft px-4 py-3 text-sm text-akiva-danger">
                {error}
              </div>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Current float"
                value={formatMoney(summary.currentBalance, settings)}
                note={`${formatPercent(limitUse)} of configured petty cash limits`}
                icon={Landmark}
                tone="success"
              />
              <MetricCard
                label="Cash assigned"
                value={formatMoney(summary.assignedCash, settings)}
                note={`${formatMoney(summary.transferredCash, settings)} transferred out of tabs`}
                icon={ArrowDownToLine}
                tone="info"
              />
              <MetricCard
                label="Expense claims"
                value={formatMoney(summary.claimedExpenses, settings)}
                note={`${formatMoney(summary.pendingExpenses, settings)} waiting for approval`}
                icon={Receipt}
                tone="warning"
              />
              <MetricCard
                label="Authorised"
                value={formatCount(summary.authorisedMovements)}
                note={`${formatCount(summary.overLimitTabs)} tabs are over their cash limit`}
                icon={summary.overLimitTabs > 0 ? AlertTriangle : BadgeDollarSign}
                tone={summary.overLimitTabs > 0 ? 'warning' : 'default'}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-12">
              <main className="min-w-0 space-y-4 lg:col-span-8">
                <PettyPanel
                  title="Petty Cash Tabs"
                  detail={loading ? 'Loading petty cash tabs...' : `${formatCount(tabs.length)} tabs match the current filters.`}
                  icon={WalletCards}
                  actions={
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                      <input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        className="h-10 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised pl-9 pr-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                        placeholder="Search tabs, custodians, expenses"
                      />
                    </div>
                  }
                >
                  <div className="mb-4 grid gap-3 md:grid-cols-2">
                    <SearchableSelect
                      value={tab}
                      onChange={(event) => setTab(event.target.value)}
                      className="h-10 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm"
                    >
                      <option value="all">All tabs</option>
                      {(dashboard?.filterOptions.tabs ?? []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </SearchableSelect>
                    <SearchableSelect
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="h-10 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm"
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending authorisation</option>
                      <option value="authorised">Authorised</option>
                      <option value="posted">Posted</option>
                      <option value="unposted">Unposted</option>
                      <option value="cash">Cash assignments</option>
                      <option value="expense">Expense claims</option>
                    </SearchableSelect>
                  </div>

                  <AdvancedTable<PettyCashTab>
                    tableId="petty-cash-tabs"
                    ariaLabel="Petty cash tab register"
                    columns={tabColumns}
                    rows={tabs}
                    rowKey={(row) => row.id}
                    emptyMessage="No petty cash tabs found."
                    loading={loading}
                    loadingMessage="Loading petty cash tabs..."
                    density="compact"
                    maxTableHeight="min(62vh, 640px)"
                    selectableRows
                    showSearch={false}
                    initialPageSize={25}
                  />
                </PettyPanel>

                <PettyPanel
                  title="Recent Movements"
                  detail="Cash assignments, tab transfers, expense claims, authorisations, and GL posting state."
                  icon={ClipboardList}
                >
                  <AdvancedTable<PettyCashMovement>
                    tableId="petty-cash-movements"
                    ariaLabel="Petty cash movements"
                    columns={movementColumns}
                    rows={movements}
                    rowKey={(row) => String(row.id)}
                    emptyMessage="No petty cash movements found."
                    loading={loading}
                    loadingMessage="Loading petty cash movements..."
                    density="compact"
                    maxTableHeight="520px"
                    initialPageSize={15}
                  />
                </PettyPanel>
              </main>

              <aside className="min-w-0 space-y-4 lg:col-span-4">
                <PettyPanel title="Tab Exposure" detail="Current cash balance by petty cash tab." icon={Banknote}>
                  <TabExposureList rows={tabExposure} settings={settings} />
                </PettyPanel>

                <PettyPanel title="Expense Exposure" detail="Claimed petty cash by expense code." icon={ArrowUpFromLine}>
                  <ExpenseExposureList rows={expenseExposure} settings={settings} />
                </PettyPanel>

                <PettyPanel title="Monthly Flow" detail="Cash into tabs compared with claims and transfers out." icon={BarChart3}>
                  <MonthlyFlow rows={monthlyFlow} settings={settings} />
                </PettyPanel>
              </aside>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
