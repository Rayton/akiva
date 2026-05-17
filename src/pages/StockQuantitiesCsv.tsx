import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
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
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface LocationOption {
  value: string;
  label: string;
  code?: string;
}

interface CsvRow {
  stockId: string;
  description: string;
  category: string;
  categoryName: string;
  quantity: number;
  locationCount: number;
  units: string;
  decimalPlaces: number;
}

interface Summary {
  items: number;
  previewRows: number;
  totalQuantity: number;
  visibleLocations: number;
  includeHeader: boolean;
  asOf: string;
}

interface WorkbenchPayload {
  rows: CsvRow[];
  summary: Summary;
  locations: LocationOption[];
  filters: {
    search: string;
    userId: string;
    includeHeader: boolean;
  };
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatDate(value: string): string {
  if (!value) return 'Today';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

export function StockQuantitiesCsv() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [includeHeader, setIncludeHeader] = useState(false);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    items: 0,
    previewRows: 0,
    totalQuantity: 0,
    visibleLocations: 0,
    includeHeader,
    asOf: new Date().toISOString().slice(0, 10),
  };

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    if (includeHeader) params.set('includeHeader', '1');
    return params;
  }, [includeHeader, tableSearch]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-quantities-csv/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock quantities CSV data could not be loaded.');
      }
      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock quantities CSV data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkbench();
    }, tableSearch ? 250 : 0);

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
    setIncludeHeader(false);
    setTableSearch('');
  };

  const downloadCsv = async () => {
    setExporting(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-quantities-csv/export?${buildParams().toString()}`));
      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          throw new Error(json.message || 'Stock quantities CSV could not be created.');
        }
        throw new Error('Stock quantities CSV could not be created.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `stock-quantities-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Stock quantities CSV created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock quantities CSV could not be created.');
    } finally {
      setExporting(false);
    }
  };

  const openMovements = (row: CsvRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<CsvRow>[]>(
    () => [
      {
        id: 'stockId',
        header: 'Item code',
        accessor: (row) => row.stockId,
        minWidth: 150,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.units || 'No unit set'}</div>
          </div>
        ),
      },
      { id: 'description', header: 'Description', accessor: (row) => row.description, minWidth: 280 },
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName || row.category || 'Unassigned', minWidth: 210 },
      {
        id: 'quantity',
        header: 'CSV quantity',
        accessor: (row) => row.quantity,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatNumber(row.quantity, Math.max(0, Math.min(4, row.decimalPlaces)))}</span>,
      },
      {
        id: 'locationCount',
        header: 'Locations',
        accessor: (row) => row.locationCount,
        align: 'right',
        width: 130,
        cell: (row) => formatNumber(row.locationCount, 0),
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 150,
        cell: (row) => (
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => openMovements(row)}>
            <History className="h-4 w-4" />
            Movements
          </button>
        ),
      },
    ],
    []
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
                    <FileSpreadsheet className="h-4 w-4 text-akiva-accent-text" />
                    Current stock CSV
                  </span>
                </div>
                <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                  Stock Quantities CSV
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Download a simple item-code and quantity file for current non-zero stock across locations available to you.
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
                  <label className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 md:col-span-2">
                    <span className="flex items-start gap-3">
                      <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-akiva-border-strong bg-akiva-surface-raised">
                        <input
                          type="checkbox"
                          checked={includeHeader}
                          onChange={(event) => setIncludeHeader(event.target.checked)}
                          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                        <CheckCircle2 className="h-4 w-4 scale-0 text-akiva-accent-text transition peer-checked:scale-100" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-akiva-text">Include a header row</span>
                        <span className="mt-1 block text-sm leading-5 text-akiva-text-muted">Keep this off for the same two-column format used by the old export.</span>
                      </span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => void loadWorkbench()} disabled={loading}>
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Display data
                    </Button>
                    <Button type="button" variant="secondary" onClick={clearFilters}>
                      Clear
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Items in CSV" value={formatNumber(summary.items, 0)} note={`${formatNumber(summary.previewRows, 0)} shown for review`} icon={PackageCheck} loading={loading} />
              <MetricCard label="Total quantity" value={formatNumber(summary.totalQuantity, 0)} note="Combined quantity across visible locations" icon={ShieldCheck} loading={loading} />
              <MetricCard label="Locations included" value={formatNumber(summary.visibleLocations, 0)} note="Locations available to your login" icon={MapPin} loading={loading} />
              <MetricCard label="As at" value={formatDate(summary.asOf)} note={summary.includeHeader ? 'CSV includes a header row' : 'Legacy two-column CSV format'} icon={FileSpreadsheet} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">CSV preview</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">The downloaded file contains item code and total current quantity.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item code, description or category" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-quantities-csv"
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => row.stockId}
                  emptyMessage={loading ? 'Loading stock quantities...' : 'No stock quantities match these filters.'}
                  loading={loading}
                  loadingMessage="Loading stock quantities..."
                  initialPageSize={25}
                  initialScroll="left"
                  showExports={false}
                />
              </div>
            </section>
          </div>
        </section>
      </div>

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
