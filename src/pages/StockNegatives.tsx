import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Loader2,
  MapPin,
  PackageX,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface Option {
  value: string;
  label: string;
  code?: string;
}

interface NegativeStockRow {
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  location: string;
  locationName: string;
  quantity: number;
  shortage: number;
  reorderLevel: number;
  decimalPlaces: number;
  units: string;
  controlled: boolean;
  serialised: boolean;
  controlType: string;
  lastMovementDate: string;
  movementsInRange: number;
  recentActivity: boolean;
}

interface Summary {
  lines: number;
  items: number;
  locations: number;
  negativeQuantity: number;
  recentActivity: number;
  controlledLines: number;
  largestShortage: number;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: NegativeStockRow[];
  summary: Summary;
  filters: {
    location: string;
    category: string;
    activity: string;
    search: string;
    dateFrom: string;
    dateTo: string;
  };
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

type ActivityFilter = 'All' | 'Moved' | 'NotMoved';

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatDate(value: string): string {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

export function StockNegatives() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [location, setLocation] = useState('All');
  const [category, setCategory] = useState('All');
  const [activity, setActivity] = useState<ActivityFilter>('All');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [tableSearch, setTableSearch] = useState('');
  const [detailRow, setDetailRow] = useState<NegativeStockRow | null>(null);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    lines: 0,
    items: 0,
    locations: 0,
    negativeQuantity: 0,
    recentActivity: 0,
    controlledLines: 0,
    largestShortage: 0,
  };

  const locationOptions = useMemo(() => [{ value: 'All', label: 'All visible locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);
  const activityOptions = [
    { value: 'All', label: 'All negative balances' },
    { value: 'Moved', label: 'Moved in selected dates' },
    { value: 'NotMoved', label: 'No movement in selected dates' },
  ];

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('location', location);
    params.set('category', category);
    params.set('activity', activity);
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    params.set('limit', '1000');
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [activity, category, dateRange.from, dateRange.to, location, tableSearch]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-negatives/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Negative stock report could not be loaded.');
      }
      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Negative stock report could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkbench(), tableSearch ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkbench, tableSearch]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const clearFilters = () => {
    setLocation('All');
    setCategory('All');
    setActivity('All');
    setDateRange(getDefaultDateRange());
    setTableSearch('');
  };

  const exportPdf = () => {
    setExporting(true);
    setError('');
    setMessage('');
    const pdfWindow = window.open(buildApiUrl(`/api/inventory/stock-negatives/export/pdf?${buildParams().toString()}`), '_blank', 'noopener,noreferrer');
    window.setTimeout(() => setExporting(false), 500);
    if (!pdfWindow) {
      setError('Allow pop-ups for Akiva to open the PDF report.');
      return;
    }
    setMessage('Negative stock PDF opened.');
  };

  const openMovements = (row: NegativeStockRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('location', row.location);
    params.set('from', dateRange.from);
    params.set('to', dateRange.to);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<NegativeStockRow>[]>(
    () => [
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => `${row.location} ${row.locationName}`,
        minWidth: 220,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      {
        id: 'stockId',
        header: 'Item',
        accessor: (row) => `${row.stockId} ${row.description}`,
        minWidth: 280,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.description}</div>
          </div>
        ),
      },
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName || row.category, minWidth: 200 },
      {
        id: 'quantity',
        header: 'Negative quantity',
        accessor: (row) => row.quantity,
        align: 'right',
        width: 165,
        cell: (row) => <span className="font-semibold text-rose-700 dark:text-rose-300">{formatNumber(row.quantity, Math.max(0, Math.min(4, row.decimalPlaces)))} {row.units}</span>,
      },
      {
        id: 'shortage',
        header: 'Shortage',
        accessor: (row) => row.shortage,
        align: 'right',
        width: 130,
        cell: (row) => formatNumber(row.shortage, Math.max(0, Math.min(4, row.decimalPlaces))),
      },
      {
        id: 'activity',
        header: 'Activity',
        accessor: (row) => row.movementsInRange,
        width: 150,
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${row.recentActivity ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200' : 'border-akiva-border bg-akiva-surface text-akiva-text-muted'}`}>
            {row.recentActivity ? `${row.movementsInRange} movement${row.movementsInRange === 1 ? '' : 's'}` : 'No recent move'}
          </span>
        ),
      },
      { id: 'lastMovementDate', header: 'Last movement', accessor: (row) => row.lastMovementDate, width: 145, cell: (row) => formatDate(row.lastMovementDate) },
      {
        id: 'control',
        header: 'Control',
        accessor: (row) => row.controlType,
        width: 145,
        cell: (row) => row.controlled ? <span className="text-sm font-medium text-akiva-text">{row.controlType}</span> : <span className="text-sm text-akiva-text-muted">Standard</span>,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 205,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => setDetailRow(row)}>
              <Eye className="h-4 w-4" />
              View
            </button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => openMovements(row)}>
              <History className="h-4 w-4" />
              Moves
            </button>
          </div>
        ),
      },
    ],
    [dateRange.from, dateRange.to]
  );

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <PackageX className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldAlert className="h-4 w-4 text-akiva-accent-text" />
                    Stock exception review
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                  Negative Stock Listing
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Find item-location balances below zero so they can be corrected before receiving reversals, issues, transfers, or invoices continue.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title="Filters" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <button type="button" onClick={exportPdf} disabled={loading || exporting || rows.length === 0} className="inline-flex h-10 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end">
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={location} onChange={(value) => setLocation(value || 'All')} options={locationOptions} placeholder="Location" />
                  </div>
                  <div>
                    <span className={labelClass}>Category</span>
                    <SearchableSelect value={category} onChange={(value) => setCategory(value || 'All')} options={categoryOptions} placeholder="Category" />
                  </div>
                  <div>
                    <span className={labelClass}>Activity</span>
                    <SearchableSelect value={activity} onChange={(value) => setActivity((value || 'All') as ActivityFilter)} options={activityOptions} placeholder="Activity" />
                  </div>
                  <div>
                    <span className={labelClass}>Movement date range</span>
                    <DateRangePicker value={dateRange} onChange={setDateRange} label="Start and end date" triggerClassName="h-11 rounded-lg px-3" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => void loadWorkbench()} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Display data
                    </Button>
                    <Button type="button" variant="secondary" onClick={clearFilters}>Clear</Button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Negative balances" value={formatNumber(summary.lines, 0)} note={`${formatNumber(summary.items, 0)} affected items`} icon={PackageX} loading={loading} />
              <MetricCard label="Total negative qty" value={formatNumber(summary.negativeQuantity, 0)} note={`Largest shortage ${formatNumber(summary.largestShortage, 0)}`} icon={AlertTriangle} loading={loading} />
              <MetricCard label="Locations affected" value={formatNumber(summary.locations, 0)} note="Visible locations with negative balances" icon={MapPin} loading={loading} />
              <MetricCard label="Moved in range" value={formatNumber(summary.recentActivity, 0)} note={`${formatNumber(summary.controlledLines, 0)} controlled or serialised`} icon={ShieldAlert} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Current negative stock balances</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Date range checks movement activity; the balance shown is the current location quantity.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, category or location" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-negatives"
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => `${row.location}-${row.stockId}`}
                  emptyMessage={loading ? 'Loading negative stock balances...' : 'No negative stock balances match these filters.'}
                  loading={loading}
                  loadingMessage="Loading negative stock balances..."
                  initialPageSize={25}
                  initialScroll="left"
                  showExports={false}
                />
              </div>
            </section>
          </div>
        </section>
      </div>

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `${detailRow.stockId} Negative Balance` : 'Negative Balance'}
        size="md"
        footer={
          <>
            {detailRow ? <Button type="button" variant="secondary" onClick={() => openMovements(detailRow)}>Open movements</Button> : null}
            <Button type="button" onClick={() => setDetailRow(null)}>Close</Button>
          </>
        }
      >
        {detailRow ? (
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-akiva-text">{detailRow.description}</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">{detailRow.locationName} · {detailRow.categoryName || detailRow.category}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile label="Negative quantity" value={`${formatNumber(detailRow.quantity, detailRow.decimalPlaces)} ${detailRow.units}`.trim()} />
              <InfoTile label="Shortage" value={formatNumber(detailRow.shortage, detailRow.decimalPlaces)} />
              <InfoTile label="Reorder level" value={formatNumber(detailRow.reorderLevel, detailRow.decimalPlaces)} />
              <InfoTile label="Control" value={detailRow.controlType} />
              <InfoTile label="Movements in range" value={formatNumber(detailRow.movementsInRange, 0)} />
              <InfoTile label="Last movement" value={formatDate(detailRow.lastMovementDate)} />
            </div>
          </section>
        ) : null}
      </Modal>

      {error ? <ToastNotification type="error" message={error} onClose={() => setError('')} /> : null}
      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon, loading = false }: { label: string; value: string; note: string; icon: LucideIcon; loading?: boolean }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-left shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <div className="mt-3 flex min-h-[2rem] items-center">
            {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-akiva-accent-text" /> : <p className="truncate text-2xl font-semibold text-akiva-text">{value}</p>}
          </div>
          <p className="mt-3 text-sm leading-5 text-akiva-text-muted">{note}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</div>
      <div className="mt-1 truncate text-base font-semibold text-akiva-text">{value}</div>
    </div>
  );
}

function ToastNotification({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose: () => void }) {
  const isError = type === 'error';
  const Icon = isError ? AlertTriangle : CheckCircle2;
  const tone = isError
    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';

  return (
    <div role={isError ? 'alert' : 'status'} className={`fixed bottom-4 right-4 z-[70] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl sm:max-w-md ${tone}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 leading-5">{message}</p>
      <button type="button" aria-label="Dismiss notification" onClick={onClose} className="-mr-1 rounded-full p-1 opacity-70 transition hover:bg-white/50 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
