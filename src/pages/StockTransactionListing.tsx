import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Loader2,
  MapPin,
  PackageSearch,
  RefreshCw,
  Search,
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

interface TransactionRow {
  movementNumber: number;
  type: number;
  typeName: string;
  stockId: string;
  description: string;
  transactionNumber: number;
  date: string;
  quantity: number;
  absoluteQuantity: number;
  reference: string;
  narrative: string;
  location: string;
  locationName: string;
  units: string;
  decimalPlaces: number;
  direction: 'In' | 'Out' | 'Zero';
}

interface Summary {
  lines: number;
  items: number;
  locations: number;
  inboundQuantity: number;
  outboundQuantity: number;
  netQuantity: number;
}

interface WorkbenchPayload {
  locations: Option[];
  transactionTypes: Option[];
  rows: TransactionRow[];
  summary: Summary;
  filters: {
    location: string;
    type: string;
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

function directionClass(direction: TransactionRow['direction']): string {
  if (direction === 'In') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (direction === 'Out') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

export function StockTransactionListing() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [location, setLocation] = useState('All');
  const [transactionType, setTransactionType] = useState('All');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [tableSearch, setTableSearch] = useState('');
  const [detailRow, setDetailRow] = useState<TransactionRow | null>(null);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    lines: 0,
    items: 0,
    locations: 0,
    inboundQuantity: 0,
    outboundQuantity: 0,
    netQuantity: 0,
  };

  const locationOptions = useMemo(() => [{ value: 'All', label: 'All visible locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const transactionTypeOptions = useMemo(() => [{ value: 'All', label: 'All transaction types' }, ...(payload?.transactionTypes ?? [])], [payload?.transactionTypes]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('location', location);
    params.set('type', transactionType);
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    params.set('limit', '1000');
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [dateRange.from, dateRange.to, location, tableSearch, transactionType]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-transaction-listing/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock transaction listing could not be loaded.');
      }
      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock transaction listing could not be loaded.');
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
    setTransactionType('All');
    setDateRange(getDefaultDateRange());
    setTableSearch('');
  };

  const exportPdf = () => {
    setExporting(true);
    setError('');
    setMessage('');
    const pdfWindow = window.open(buildApiUrl(`/api/inventory/stock-transaction-listing/export/pdf?${buildParams().toString()}`), '_blank', 'noopener,noreferrer');
    window.setTimeout(() => setExporting(false), 500);
    if (!pdfWindow) {
      setError('Allow pop-ups for Akiva to open the PDF report.');
      return;
    }
    setMessage('Stock transaction listing PDF opened.');
  };

  const openMovements = (row: TransactionRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('location', row.location);
    params.set('type', String(row.type));
    params.set('from', dateRange.from);
    params.set('to', dateRange.to);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<TransactionRow>[]>(
    () => [
      {
        id: 'item',
        header: 'Item',
        accessor: (row) => `${row.stockId} ${row.description}`,
        minWidth: 280,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.description}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.stockId}</div>
          </div>
        ),
      },
      { id: 'type', header: 'Type', accessor: (row) => row.typeName, minWidth: 190 },
      { id: 'transactionNumber', header: 'Trans no.', accessor: (row) => row.transactionNumber, width: 120 },
      { id: 'date', header: 'Date', accessor: (row) => row.date, width: 130, cell: (row) => formatDate(row.date) },
      {
        id: 'quantity',
        header: 'Quantity',
        accessor: (row) => row.quantity,
        align: 'right',
        width: 135,
        cell: (row) => <span className={row.quantity < 0 ? 'font-semibold text-rose-700 dark:text-rose-300' : row.quantity > 0 ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-akiva-text'}>{formatNumber(row.quantity, Math.max(0, Math.min(4, row.decimalPlaces)))}</span>,
      },
      {
        id: 'direction',
        header: 'Direction',
        accessor: (row) => row.direction,
        width: 120,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${directionClass(row.direction)}`}>{row.direction}</span>,
      },
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => row.locationName,
        minWidth: 190,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      { id: 'reference', header: 'Reference', accessor: (row) => row.reference || row.narrative, minWidth: 220 },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.movementNumber,
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
                    <PackageSearch className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <FileText className="h-4 w-4 text-akiva-accent-text" />
                    Period transaction report
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Stock Transaction Listing
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review inventory transactions by movement type, period, and stock location before printing the listing.
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                  <div>
                    <span className={labelClass}>Transaction type</span>
                    <SearchableSelect value={transactionType} onChange={(value) => setTransactionType(value || 'All')} options={transactionTypeOptions} placeholder="Transaction type" />
                  </div>
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={location} onChange={(value) => setLocation(value || 'All')} options={locationOptions} placeholder="Location" />
                  </div>
                  <div>
                    <span className={labelClass}>Transaction date range</span>
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
              <MetricCard label="Transaction lines" value={formatNumber(summary.lines, 0)} note={`${formatNumber(summary.items, 0)} items in the period`} icon={FileText} loading={loading} />
              <MetricCard label="Stock in" value={formatNumber(summary.inboundQuantity, 0)} note="Positive movement quantity" icon={ArrowDownLeft} loading={loading} />
              <MetricCard label="Stock out" value={formatNumber(summary.outboundQuantity, 0)} note="Negative movement quantity" icon={ArrowUpRight} loading={loading} />
              <MetricCard label="Locations" value={formatNumber(summary.locations, 0)} note={`Net quantity ${formatNumber(summary.netQuantity, 0)}`} icon={MapPin} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Period stock transactions</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">The PDF uses the same filters shown here.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, reference or transaction no." />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-transaction-listing"
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => row.movementNumber}
                  emptyMessage={loading ? 'Loading stock transactions...' : 'No stock transactions match these filters.'}
                  loading={loading}
                  loadingMessage="Loading stock transactions..."
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
        title={detailRow ? `${detailRow.typeName} ${detailRow.transactionNumber}` : 'Stock Transaction'}
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
            <p className="mt-1 text-sm text-akiva-text-muted">{detailRow.stockId} · {detailRow.locationName}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile label="Date" value={formatDate(detailRow.date)} />
              <InfoTile label="Quantity" value={`${formatNumber(detailRow.quantity, detailRow.decimalPlaces)} ${detailRow.units}`.trim()} />
              <InfoTile label="Reference" value={detailRow.reference || '-'} />
              <InfoTile label="Narrative" value={detailRow.narrative || '-'} />
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
