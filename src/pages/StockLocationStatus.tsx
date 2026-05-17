import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  History,
  Loader2,
  MapPin,
  PackageCheck,
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

interface LocationStatusRow {
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  location: string;
  locationName: string;
  bin: string;
  onHand: number;
  reorderLevel: number;
  demand: number;
  available: number;
  onOrder: number;
  movementIn: number;
  movementOut: number;
  netMovement: number;
  lastMovementDate: string;
  units: string;
  decimalPlaces: number;
  serialised: boolean;
  controlled: boolean;
  controlType: string;
  status: 'Available' | 'Below reorder' | 'Short' | 'Out' | 'On order' | 'Controlled';
}

interface Summary {
  items: number;
  onHand: number;
  demand: number;
  available: number;
  onOrder: number;
  belowReorder: number;
  outOfStock: number;
  controlledItems: number;
  movementIn: number;
  movementOut: number;
}

interface Filters {
  location: string;
  category: string;
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: LocationStatusRow[];
  summary: Summary;
  filters: Filters;
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

type StatusFilter = 'All' | 'Below' | 'NotZero' | 'OnOrder' | 'Short' | 'Controlled';

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function statusClass(status: LocationStatusRow['status']): string {
  if (status === 'Available') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'Below reorder' || status === 'On order') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  if (status === 'Short' || status === 'Out') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
  return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200';
}

function initialLocationFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get('location') || params.get('StockLocation') || params.get('stockLocation') || 'All').toUpperCase();
}

function initialCategoryFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('category') || params.get('StockCat') || 'All';
}

export function StockLocationStatus() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [location, setLocation] = useState(initialLocationFromUrl);
  const [category, setCategory] = useState(initialCategoryFromUrl);
  const [status, setStatus] = useState<StatusFilter>('All');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [tableSearch, setTableSearch] = useState('');
  const [detailRow, setDetailRow] = useState<LocationStatusRow | null>(null);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    items: 0,
    onHand: 0,
    demand: 0,
    available: 0,
    onOrder: 0,
    belowReorder: 0,
    outOfStock: 0,
    controlledItems: 0,
    movementIn: 0,
    movementOut: 0,
  };

  const locationOptions = useMemo(() => [{ value: 'All', label: 'Default location' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);
  const statusOptions = [
    { value: 'All', label: 'All items' },
    { value: 'Below', label: 'Below reorder' },
    { value: 'Short', label: 'Short after demand' },
    { value: 'NotZero', label: 'Available stock only' },
    { value: 'OnOrder', label: 'Currently on order' },
    { value: 'Controlled', label: 'Controlled or serialised' },
  ];

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('location', location);
    params.set('category', category);
    params.set('status', status);
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    params.set('limit', '1000');
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [category, dateRange.from, dateRange.to, location, status, tableSearch]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-location-status/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock location status could not be loaded.');
      }
      setPayload(json.data);
      if (location === 'All' && json.data.filters.location) {
        setLocation(json.data.filters.location);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock location status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [buildParams, location]);

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
    setCategory('All');
    setStatus('All');
    setDateRange(getDefaultDateRange());
    setTableSearch('');
  };

  const openMovements = (row: LocationStatusRow) => {
    const params = new URLSearchParams();
    params.set('location', row.location);
    params.set('item', row.stockId);
    params.set('from', dateRange.from);
    params.set('to', dateRange.to);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const openItemStatus = (row: LocationStatusRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('location', row.location);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockstatus?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<LocationStatusRow>[]>(
    () => [
      {
        id: 'item',
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
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName, minWidth: 190 },
      { id: 'bin', header: 'Bin', accessor: (row) => row.bin || '-', width: 110 },
      { id: 'onHand', header: 'On hand', accessor: (row) => row.onHand, align: 'right', width: 130, cell: (row) => `${formatNumber(row.onHand, row.decimalPlaces || 2)} ${row.units}` },
      { id: 'reorderLevel', header: 'Reorder', accessor: (row) => row.reorderLevel, align: 'right', width: 120, cell: (row) => formatNumber(row.reorderLevel, row.decimalPlaces || 2) },
      { id: 'demand', header: 'Demand', accessor: (row) => row.demand, align: 'right', width: 120, cell: (row) => formatNumber(row.demand, row.decimalPlaces || 2) },
      {
        id: 'available',
        header: 'Available',
        accessor: (row) => row.available,
        align: 'right',
        width: 130,
        cell: (row) => <span className={row.available < 0 ? 'font-semibold text-rose-700 dark:text-rose-300' : 'font-semibold text-akiva-text'}>{formatNumber(row.available, row.decimalPlaces || 2)}</span>,
      },
      { id: 'onOrder', header: 'On order', accessor: (row) => row.onOrder, align: 'right', width: 130, cell: (row) => formatNumber(row.onOrder, row.decimalPlaces || 2) },
      {
        id: 'netMovement',
        header: 'Net movement',
        accessor: (row) => row.netMovement,
        align: 'right',
        width: 145,
        cell: (row) => (
          <span className={row.netMovement < 0 ? 'font-semibold text-rose-700 dark:text-rose-300' : row.netMovement > 0 ? 'font-semibold text-emerald-700 dark:text-emerald-300' : ''}>
            {row.netMovement > 0 ? '+' : ''}{formatNumber(row.netMovement, row.decimalPlaces || 2)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 150,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        align: 'right',
        sticky: 'right',
        width: 185,
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
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <MapPin className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Location and category status
                  </span>
                </div>
                <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                  Stock Status by Location
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review item balances, demand, available stock, reorder levels, and open purchase or work orders for a selected location.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title="Filters" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
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
                    <span className={labelClass}>Show items</span>
                    <SearchableSelect value={status} onChange={(value) => setStatus((value || 'All') as StatusFilter)} options={statusOptions} placeholder="Status" />
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
              <MetricCard label="Items reviewed" value={formatNumber(summary.items, 0)} note={`${formatNumber(summary.belowReorder, 0)} need attention`} icon={PackageSearch} loading={loading} onClick={() => setStatus('All')} />
              <MetricCard label="Available" value={formatNumber(summary.available, 0)} note={`${formatNumber(summary.demand, 0)} demand against stock`} icon={PackageCheck} loading={loading} onClick={() => setStatus('NotZero')} />
              <MetricCard label="On order" value={formatNumber(summary.onOrder, 0)} note="Open purchase or work order quantity" icon={ShieldCheck} loading={loading} onClick={() => setStatus('OnOrder')} />
              <MetricCard label="Out of stock" value={formatNumber(summary.outOfStock, 0)} note={`${formatNumber(summary.controlledItems, 0)} controlled or serialised`} icon={AlertTriangle} loading={loading} onClick={() => setStatus('Below')} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Location stock status</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Current stock position for {payload?.filters?.location || location}. Movement figures use the selected date range.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, category or bin" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-location-status"
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => `${row.location}-${row.stockId}`}
                  emptyMessage={loading ? 'Loading stock location status...' : 'No stock status rows match these filters.'}
                  loading={loading}
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
        title={detailRow ? `${detailRow.stockId} Status` : 'Stock Status'}
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
            <p className="mt-1 text-sm text-akiva-text-muted">{detailRow.categoryName} · {detailRow.locationName}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile label="On hand" value={`${formatNumber(detailRow.onHand, detailRow.decimalPlaces || 2)} ${detailRow.units}`} />
              <InfoTile label="Demand" value={formatNumber(detailRow.demand, detailRow.decimalPlaces || 2)} />
              <InfoTile label="Available" value={formatNumber(detailRow.available, detailRow.decimalPlaces || 2)} />
              <InfoTile label="On order" value={formatNumber(detailRow.onOrder, detailRow.decimalPlaces || 2)} />
              <InfoTile label="Reorder level" value={formatNumber(detailRow.reorderLevel, detailRow.decimalPlaces || 2)} />
              <InfoTile label="Bin" value={detailRow.bin || '-'} />
              <InfoTile label="Control" value={detailRow.controlType} />
              <InfoTile label="Last movement" value={detailRow.lastMovementDate || '-'} />
            </div>
          </section>
        ) : null}
      </Modal>

      {error ? <ToastNotification type="error" message={error} onClose={() => setError('')} /> : null}
      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon, loading = false, onClick }: { label: string; value: string; note: string; icon: LucideIcon; loading?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
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
    </button>
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
