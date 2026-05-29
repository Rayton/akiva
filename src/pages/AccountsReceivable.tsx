import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Mail,
  Phone,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  UserRoundCheck,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { fetchReceivablesDashboard } from '../data/receivablesApi';
import { formatDateWithSystemFormat, useSystemDateFormat } from '../lib/dateFormat';
import type {
  ReceivablesAction,
  ReceivablesAgingBucket,
  ReceivablesCustomerExposure,
  ReceivablesDashboardPayload,
  ReceivablesPriorityInvoice,
  ReceivablesTone,
} from '../types/receivables';

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}

function formatMoney(value: number, currency = 'TZS'): string {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'TZS';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${safeCurrency} ${formatNumber(value)}`;
  }
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractIsoDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : localIsoDate(parsed);
}

function formatDisplayDate(value: string | null | undefined, dateFormat: string): string {
  const isoDate = extractIsoDate(value);
  if (!isoDate) return '-';
  return formatDateWithSystemFormat(isoDate, dateFormat) || isoDate;
}

function formatDateTime(value: string | undefined, dateFormat: string): string {
  const raw = value || new Date().toISOString();
  const date = new Date(raw);
  const formattedDate = formatDisplayDate(raw, dateFormat);
  if (Number.isNaN(date.getTime())) return formattedDate;
  return `${formattedDate} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function toneDot(tone: ReceivablesTone): string {
  if (tone === 'danger') return 'bg-red-600 dark:bg-red-300';
  if (tone === 'warning') return 'bg-orange-600 dark:bg-orange-300';
  if (tone === 'pending') return 'bg-purple-600 dark:bg-purple-300';
  if (tone === 'success') return 'bg-emerald-600 dark:bg-emerald-300';
  if (tone === 'info') return 'bg-blue-600 dark:bg-blue-300';
  return 'bg-slate-500 dark:bg-slate-300';
}

function toneClasses(tone: ReceivablesTone): string {
  if (tone === 'danger') return 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100';
  if (tone === 'warning') return 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100';
  if (tone === 'pending') return 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100';
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (tone === 'info') return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text';
}

function statusTone(status: string): ReceivablesTone {
  const key = status.toLowerCase();
  if (key.includes('overdue')) return 'danger';
  if (key.includes('due') || key.includes('watch')) return 'warning';
  return 'success';
}

function actionIcon(actionId: string): LucideIcon {
  if (actionId === 'overdue-collection') return ShieldAlert;
  if (actionId === 'due-soon') return Clock3;
  if (actionId === 'credit-watch') return WalletCards;
  if (actionId === 'missing-contact') return Mail;
  return CheckCircle2;
}

function ReceivablesPanel({
  title,
  detail,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  detail?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-muted text-akiva-accent-text">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
            {detail ? <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{detail}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: ReceivablesTone;
  icon: LucideIcon;
}) {
  return (
    <article className="akiva-panel relative overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${toneDot(tone)}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">{label}</p>
          <p className="akiva-financial-value mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClasses(tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-4 text-sm leading-5 text-akiva-text-muted">{note}</p>
    </article>
  );
}

function ActionRow({ action }: { action: ReceivablesAction }) {
  const Icon = actionIcon(action.id);

  return (
    <div className="relative overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 shadow-sm">
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${toneDot(action.tone)}`} aria-hidden="true" />
      <div className="flex gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClasses(action.tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClasses(action.tone)}`}>P{action.priority}</span>
            <span className="akiva-financial-value text-xs font-semibold text-akiva-text">{action.valueLabel}</span>
          </span>
          <span className="mt-2 block text-sm font-semibold leading-5 text-akiva-text">{action.title}</span>
          <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{action.detail}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-akiva-accent-text">
            Collections
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </span>
      </div>
    </div>
  );
}

function AgingSnapshot({
  rows,
  currency,
}: {
  rows: ReceivablesAgingBucket[];
  currency: string;
}) {
  const total = Math.max(rows.reduce((sum, row) => sum + row.amount, 0), 1);
  const colors = ['bg-emerald-600', 'bg-amber-500', 'bg-orange-600', 'bg-red-600', 'bg-slate-700'];

  if (rows.length === 0) {
    return <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 py-8 text-center text-sm font-semibold text-akiva-text-muted">No aging data found.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.key} className="grid gap-2 text-xs sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:items-center">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors[index % colors.length]}`} />
            <span className="font-semibold text-akiva-text-muted">{row.label}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-akiva-surface-muted">
            <div className={`h-full rounded-full ${colors[index % colors.length]}`} style={{ width: `${Math.max(3, Math.round((row.amount / total) * 100))}%` }} />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-akiva-text-muted">{formatNumber(row.invoiceCount)} invoices</span>
            <span className="akiva-financial-value min-w-[104px] text-right font-semibold text-akiva-text">{formatMoney(row.amount, currency)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);

  return (
    <span className={`inline-flex min-h-6 items-center rounded-full border px-2 text-xs font-semibold ${toneClasses(tone)}`}>
      {status}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-akiva-border bg-akiva-surface-muted px-4 text-center text-sm font-semibold text-akiva-text-muted">
      Loading receivables dashboard...
    </div>
  );
}

export function AccountsReceivable() {
  const [dashboard, setDashboard] = useState<ReceivablesDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dateFormat = useSystemDateFormat();

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchReceivablesDashboard(10);
      setDashboard(payload);
      if (!payload) setError('Accounts receivable dashboard data could not be loaded.');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Accounts receivable dashboard data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const customerColumns = useMemo<AdvancedTableColumn<ReceivablesCustomerExposure>[]>(() => [
    {
      id: 'customer',
      header: 'Customer',
      accessor: (row) => `${row.customerName} ${row.debtorNo} ${row.email} ${row.phone}`,
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-akiva-text">{row.customerName}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-akiva-text-muted">
            <span>{row.debtorNo}</span>
            {row.email ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{row.email}</span> : null}
            {row.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone}</span> : null}
          </div>
        </div>
      ),
      minWidth: 260,
    },
    {
      id: 'balance',
      header: 'Balance',
      accessor: (row) => row.balance,
      cell: (row) => <span className="akiva-financial-value font-semibold text-akiva-text">{formatMoney(row.balance, dashboard?.currency)}</span>,
      align: 'right',
      width: 150,
    },
    {
      id: 'overdue',
      header: 'Overdue',
      accessor: (row) => row.overdueBalance,
      cell: (row) => <span className={`akiva-financial-value font-semibold ${row.overdueBalance > 0 ? 'text-red-700 dark:text-red-200' : 'text-akiva-text-muted'}`}>{formatMoney(row.overdueBalance, dashboard?.currency)}</span>,
      align: 'right',
      width: 150,
    },
    {
      id: 'invoices',
      header: 'Invoices',
      accessor: (row) => row.invoiceCount,
      cell: (row) => `${formatNumber(row.invoiceCount)} / ${formatNumber(row.overdueInvoices)} overdue`,
      width: 140,
    },
    {
      id: 'credit',
      header: 'Credit Use',
      accessor: (row) => row.utilizationPct,
      cell: (row) => (
        <div className="min-w-[132px]">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-akiva-text">{formatNumber(row.utilizationPct, 1)}%</span>
            <span className="text-akiva-text-muted">{formatMoney(row.creditLimit, dashboard?.currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-akiva-surface-muted">
            <div className={`h-full rounded-full ${row.utilizationPct >= 90 ? 'bg-red-600' : row.utilizationPct >= 80 ? 'bg-orange-500' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, Math.max(2, row.utilizationPct))}%` }} />
          </div>
        </div>
      ),
      width: 180,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} />,
      width: 110,
    },
  ], [dashboard?.currency]);

  const invoiceColumns = useMemo<AdvancedTableColumn<ReceivablesPriorityInvoice>[]>(() => [
    {
      id: 'customer',
      header: 'Customer',
      accessor: (row) => `${row.customerName} ${row.debtorNo}`,
      cell: (row) => (
        <div>
          <div className="font-semibold text-akiva-text">{row.customerName}</div>
          <div className="mt-1 text-xs text-akiva-text-muted">{row.debtorNo}</div>
        </div>
      ),
      minWidth: 220,
    },
    { id: 'reference', header: 'Reference', accessor: (row) => row.reference || row.transNo || '-', width: 140 },
    {
      id: 'dueDate',
      header: 'Due',
      accessor: (row) => row.dueDate,
      cell: (row) => formatDisplayDate(row.dueDate, dateFormat),
      width: 130,
    },
    {
      id: 'daysOverdue',
      header: 'Days',
      accessor: (row) => row.daysOverdue,
      cell: (row) => row.daysOverdue > 0 ? `${formatNumber(row.daysOverdue)} overdue` : 'Current',
      width: 120,
    },
    {
      id: 'amountDue',
      header: 'Amount Due',
      accessor: (row) => row.amountDue,
      cell: (row) => <span className="akiva-financial-value font-semibold text-akiva-text">{formatMoney(row.amountDue, dashboard?.currency)}</span>,
      align: 'right',
      width: 150,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} />,
      width: 110,
    },
  ], [dashboard?.currency, dateFormat]);

  const summary = dashboard?.summary;
  const currency = dashboard?.currency ?? 'TZS';
  const overduePct = summary && summary.totalReceivables > 0 ? (summary.overdueReceivables / summary.totalReceivables) * 100 : 0;
  const updatedLabel = formatDateTime(dashboard?.asOf, dateFormat);

  return (
    <div className="akiva-page-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <WalletCards className="h-4 w-4 text-akiva-accent-text" />
                    Receivables
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <CalendarClock className="h-4 w-4 text-akiva-accent-text" />
                    Updated {updatedLabel}
                  </span>
                </div>
                <h1 className="mt-4 akiva-page-title">Accounts Receivable</h1>
                <p className="akiva-page-subtitle">Live customer balances, aging exposure, credit utilization, and collection priorities.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadDashboard()}
                disabled={loading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Refresh receivables dashboard"
                title="Refresh receivables dashboard"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {loading && !dashboard ? (
              <LoadingState />
            ) : dashboard && summary ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Total receivables"
                    value={formatMoney(summary.totalReceivables, currency)}
                    note={`${formatNumber(summary.openInvoices)} open invoices across ${formatNumber(summary.customersWithBalance)} customers`}
                    tone="info"
                    icon={Banknote}
                  />
                  <MetricCard
                    label="Overdue"
                    value={formatMoney(summary.overdueReceivables, currency)}
                    note={`${formatNumber(summary.overdueInvoices)} invoices, ${formatNumber(overduePct, 1)}% of open AR`}
                    tone={summary.overdueReceivables > 0 ? 'danger' : 'success'}
                    icon={ShieldAlert}
                  />
                  <MetricCard
                    label="Due soon"
                    value={formatMoney(summary.dueSoonReceivables, currency)}
                    note={`${formatNumber(summary.dueSoonInvoices)} invoices due in the next 14 days`}
                    tone={summary.dueSoonReceivables > 0 ? 'warning' : 'success'}
                    icon={Clock3}
                  />
                  <MetricCard
                    label="Oldest overdue"
                    value={`${formatNumber(summary.oldestDaysOverdue)} days`}
                    note={`${formatNumber(summary.averageDaysOverdue, 1)} days average overdue age`}
                    tone={summary.oldestDaysOverdue > 0 ? 'pending' : 'success'}
                    icon={TrendingUp}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-12">
                  <main className="space-y-4 lg:col-span-8">
                    <ReceivablesPanel
                      title="Aging Snapshot"
                      detail="Open customer invoices grouped by due-age bucket."
                      icon={CalendarClock}
                    >
                      <AgingSnapshot rows={dashboard.aging} currency={currency} />
                    </ReceivablesPanel>

                    <ReceivablesPanel
                      title="Top Customer Exposure"
                      detail="Customers ranked by overdue exposure and total open balance."
                      icon={Users}
                    >
                      <AdvancedTable
                        tableId="receivables-top-customers"
                        ariaLabel="Top customer receivable exposure"
                        columns={customerColumns}
                        rows={dashboard.topCustomers}
                        rowKey={(row) => row.debtorNo}
                        emptyMessage="No open customer balances found."
                        loading={loading}
                        loadingMessage="Loading customer balances..."
                        density="compact"
                        maxTableHeight="460px"
                        initialPageSize={10}
                        showSearch
                        searchPlaceholder="Search customers, balances, or contacts..."
                      />
                    </ReceivablesPanel>

                    <ReceivablesPanel
                      title="Priority Invoices"
                      detail="Open invoices sorted by collection urgency."
                      icon={ReceiptText}
                    >
                      <AdvancedTable
                        tableId="receivables-priority-invoices"
                        ariaLabel="Receivables priority invoices"
                        columns={invoiceColumns}
                        rows={dashboard.priorityInvoices}
                        rowKey={(row, index) => `${row.debtorNo}-${row.transNo || row.reference || index}`}
                        emptyMessage="No priority invoices found."
                        loading={loading}
                        loadingMessage="Loading priority invoices..."
                        density="compact"
                        maxTableHeight="430px"
                        initialPageSize={12}
                        showSearch
                        searchPlaceholder="Search customer, reference, due date, or status..."
                      />
                    </ReceivablesPanel>
                  </main>

                  <aside className="space-y-4 lg:col-span-4">
                    <ReceivablesPanel
                      title="Collection Actions"
                      detail="Receivables signals ranked for follow-up."
                      icon={AlertTriangle}
                    >
                      <div className="space-y-2">
                        {dashboard.actionQueue.map((action) => (
                          <ActionRow key={action.id} action={action} />
                        ))}
                      </div>
                    </ReceivablesPanel>

                    <ReceivablesPanel
                      title="Collection Coverage"
                      detail="Current open-ledger shape."
                      icon={UserRoundCheck}
                    >
                      <div className="space-y-2">
                        {[
                          { label: 'Current receivables', value: formatMoney(summary.currentReceivables, currency), tone: 'success' as const },
                          { label: 'Highest customer balance', value: formatMoney(summary.highestCustomerBalance, currency), tone: 'info' as const },
                          { label: 'Customers with balance', value: formatNumber(summary.customersWithBalance), tone: 'pending' as const },
                          { label: 'Open invoices', value: formatNumber(summary.openInvoices), tone: 'neutral' as const },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2.5">
                            <span className="text-sm font-semibold text-akiva-text">{item.label}</span>
                            <span className={`inline-flex items-center gap-2 text-xs font-semibold ${toneClasses(item.tone)}`}>
                              <span className={`h-2 w-2 rounded-full ${toneDot(item.tone)}`} />
                              {item.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ReceivablesPanel>
                  </aside>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-akiva-border bg-akiva-surface-muted px-4 py-12 text-center">
                <p className="text-sm font-semibold text-akiva-text">Receivables data could not be loaded.</p>
                <p className="mt-1 text-xs text-akiva-text-muted">{error || 'Please try refreshing the dashboard.'}</p>
              </div>
            )}

            {error && dashboard ? (
              <p className="text-xs font-semibold text-akiva-accent-text">{error}</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
