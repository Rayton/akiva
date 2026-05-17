import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  History,
  Layers,
  Loader2,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DateRangePicker, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface Option {
  value: string;
  label: string;
  code?: string;
}

interface HistoricalQuantityRow {
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  units: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  controlled: boolean;
  serialised: boolean;
  controlType: string;
  locationsWithHistory: number;
  lastMovementDate: string;
  movedInRange: boolean;
  decimalPlaces: number;
}

interface Summary {
  items: number;
  quantity: number;
  value: number;
  controlledItems: number;
  movedInRange: number;
  locations: number;
  asAt: string;
}

interface Filters {
  location: string;
  locations: string[];
  category: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  includeZero: boolean;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: HistoricalQuantityRow[];
  summary: Summary;
  filters: Filters;
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultSnapshotRange(): DateRangeValue {
  const end = new Date();
  end.setDate(0);
  const start = new Date(end);
  start.setMonth(start.getMonth() - 2);
  start.setDate(1);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string): string {
  if (!value) return '-';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

function initialLocationFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get('location') || params.get('StockLocation') || 'All').toUpperCase();
}

function initialCategoryFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('category') || params.get('StockCategory') || 'All';
}

export function StockQuantityByDate() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [location, setLocation] = useState(initialLocationFromUrl);
  const [category, setCategory] = useState(initialCategoryFromUrl);
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultSnapshotRange());
  const [includeZero, setIncludeZero] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [detailRow, setDetailRow] = useState<HistoricalQuantityRow | null>(null);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    items: 0,
    quantity: 0,
    value: 0,
    controlledItems: 0,
    movedInRange: 0,
    locations: 0,
    asAt: dateRange.to,
  };

  const locationOptions = useMemo(
    () => [{ value: 'All', label: 'All visible locations' }, ...(payload?.locations ?? [])],
    [payload?.locations]
  );
  const categoryOptions = useMemo(
    () => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])],
    [payload?.categories]
  );

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('location', location);
    params.set('category', category);
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    params.set('includeZero', includeZero ? '1' : '0');
    params.set('limit', '1000');
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [category, dateRange.from, dateRange.to, includeZero, location, tableSearch]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-quantity-by-date/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Historical stock quantity could not be loaded.');
      }
      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Historical stock quantity could not be loaded.');
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
    setDateRange(defaultSnapshotRange());
    setIncludeZero(false);
    setTableSearch('');
  };

  const downloadCsv = async () => {
    setExporting(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-quantity-by-date/export/csv?${buildParams().toString()}`));
      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          throw new Error(json.message || 'Historical stock quantity CSV could not be created.');
        }
        throw new Error('Historical stock quantity CSV could not be created.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-historical-${dateRange.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Historical stock quantity CSV created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Historical stock quantity CSV could not be created.');
    } finally {
      setExporting(false);
    }
  };

  const openMovements = (row: HistoricalQuantityRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('from', dateRange.from);
    params.set('to', dateRange.to);
    if (location !== 'All') params.set('location', location);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const openItemStatus = (row: HistoricalQuantityRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    if (location !== 'All') params.set('location', location);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockstatus?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<HistoricalQuantityRow>[]>(
    () => [
      {
        id: 'stockId',
        header: 'Item',
        accessor: (row) => `${row.stockId} ${row.description}`,
        minWidth: 270,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.description}</div>
          </div>
        ),
      },
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName || row.category || 'Unassigned', minWidth: 210 },
      { id: 'unit', header: 'Unit', accessor: (row) => row.units || '-', width: 110 },
      {
        id: 'quantity',
        header: 'Quantity on hand',
        accessor: (row) => row.quantity,
        align: 'right',
        width: 165,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatNumber(row.quantity, Math.max(0, Math.min(4, row.decimalPlaces)))}</span>,
      },
      {
        id: 'unitCost',
        header: 'Unit cost',
        accessor: (row) => row.unitCost,
        align: 'right',
        width: 140,
        cell: (row) => formatMoney(row.unitCost),
      },
      {
        id: 'totalCost',
        header: 'Total cost',
        accessor: (row) => row.totalCost,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatMoney(row.totalCost)}</span>,
      },
      {
        id: 'control',
        header: 'Control',
        accessor: (row) => row.controlType,
        width: 145,
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${row.controlled ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200' : 'border-akiva-border bg-akiva-surface text-akiva-text-muted'}`}>
            {row.controlType}
          </span>
        ),
      },
      {
        id: 'locations',
        header: 'Locations',
        accessor: (row) => row.locationsWithHistory,
        align: 'right',
        width: 125,
        cell: (row) => formatNumber(row.locationsWithHistory, 0),
      },
      {
        id: 'lastMovement',
        header: 'Last movement',
        accessor: (row) => row.lastMovementDate,
        width: 145,
        cell: (row) => formatDate(row.lastMovementDate),
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 220,
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
    [dateRange.from, dateRange.to, location]
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
                    <PackageSearch className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <CalendarDays className="h-4 w-4 text-akiva-accent-text" />
                    Historical quantity snapshot
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Historical Stock Quantity
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review stock on hand and inventory value as at the selected date, by location and category.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title="Filters" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" onClick={() => void downloadCsv()} disabled={loading || exporting || rows.length === 0}>
                  {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download CSV
                </Button>
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
                    <span className={labelClass}>Stock date range</span>
                    <DateRangePicker value={dateRange} onChange={setDateRange} label="Start and end date" triggerClassName="h-11 rounded-lg px-3" />
                  </div>
                  <label className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                    <span className="flex items-start gap-3">
                      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-akiva-border-strong bg-akiva-surface-raised">
                        <input type="checkbox" checked={includeZero} onChange={(event) => setIncludeZero(event.target.checked)} className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                        <CheckCircle2 className="h-4 w-4 scale-0 text-akiva-accent-text transition peer-checked:scale-100" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-akiva-text">Include zero balances</span>
                        <span className="mt-1 block text-sm leading-5 text-akiva-text-muted">Show items with no stock at the snapshot date.</span>
                      </span>
                    </span>
                  </label>
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
              <MetricCard label="Items in snapshot" value={formatNumber(summary.items, 0)} note={`As at ${formatDate(summary.asAt)}`} icon={FileSpreadsheet} loading={loading} />
              <MetricCard label="Stock value" value={formatMoney(summary.value)} note={`${formatNumber(summary.quantity, 0)} total quantity`} icon={Layers} loading={loading} />
              <MetricCard label="Locations included" value={formatNumber(summary.locations, 0)} note={location === 'All' ? 'All locations you can view' : location} icon={MapPin} loading={loading} />
              <MetricCard label="Controlled items" value={formatNumber(summary.controlledItems, 0)} note={`${formatNumber(summary.movedInRange, 0)} moved in selected range`} icon={ShieldCheck} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Historical stock quantity</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">End date is used as the stock snapshot date. Start date shows which items moved in the selected period.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, category or description" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-quantity-by-date"
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => row.stockId}
                  emptyMessage={loading ? 'Loading historical stock quantity...' : 'No stock quantity rows match these filters.'}
                  loading={loading}
                  loadingMessage="Loading historical stock quantity..."
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
        title={detailRow ? `${detailRow.stockId} Quantity` : 'Stock Quantity'}
        size="md"
        footer={
          <>
            {detailRow ? <Button type="button" variant="secondary" onClick={() => openItemStatus(detailRow)}>Open item status</Button> : null}
            <Button type="button" onClick={() => setDetailRow(null)}>Close</Button>
          </>
        }
      >
        {detailRow ? (
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-akiva-text">{detailRow.description}</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">{detailRow.categoryName || detailRow.category || 'Unassigned'} · {detailRow.controlType}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile label="Quantity on hand" value={`${formatNumber(detailRow.quantity, detailRow.decimalPlaces || 2)} ${detailRow.units}`} />
              <InfoTile label="Unit cost" value={formatMoney(detailRow.unitCost)} />
              <InfoTile label="Total cost" value={formatMoney(detailRow.totalCost)} />
              <InfoTile label="Locations with history" value={formatNumber(detailRow.locationsWithHistory, 0)} />
              <InfoTile label="Last movement" value={formatDate(detailRow.lastMovementDate)} />
              <InfoTile label="Moved in range" value={detailRow.movedInRange ? 'Yes' : 'No'} />
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
