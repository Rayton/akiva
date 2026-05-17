import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  History,
  Loader2,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface Option {
  value: string;
  label: string;
  code?: string;
}

interface DispatchRow {
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  fromOnHand: number;
  fromReorder: number;
  fromInTransit: number;
  fromAvailable: number;
  toOnHand: number;
  toReorder: number;
  toInTransit: number;
  neededQuantity: number;
  dispatchQuantity: number;
  quantityUsed: number;
  fromBin: string;
  toBin: string;
  units: string;
  decimalPlaces: number;
}

interface Summary {
  lines: number;
  items: number;
  dispatchQuantity: number;
  fromAvailable: number;
  neededQuantity: number;
  usedInPeriod: number;
}

interface Filters {
  fromLocation: string;
  toLocation: string;
  category: string;
  strategy: 'needed' | 'source-surplus';
  percent: number;
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: DispatchRow[];
  summary: Summary;
  filters: Filters;
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

interface BatchResponse {
  success: boolean;
  message?: string;
  transfer?: {
    reference: number;
    fromLocation: string;
    toLocation: string;
    lineCount: number;
    totalQuantity: number;
    shipDate: string;
  };
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatQuantity(row: DispatchRow, value: number): string {
  const quantity = formatNumber(value, Math.max(0, Math.min(4, row.decimalPlaces ?? 2)));
  return row.units ? `${quantity} ${row.units}` : quantity;
}

export function StockDispatch() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [category, setCategory] = useState('All');
  const [strategy, setStrategy] = useState<'needed' | 'source-surplus'>('needed');
  const [percent, setPercent] = useState('0');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [tableSearch, setTableSearch] = useState('');
  const [createdTransfer, setCreatedTransfer] = useState<BatchResponse['transfer'] | null>(null);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    lines: 0,
    items: 0,
    dispatchQuantity: 0,
    fromAvailable: 0,
    neededQuantity: 0,
    usedInPeriod: 0,
  };

  const locationOptions = payload?.locations ?? [];
  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);

  const visibleRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter((row) =>
      [
        row.stockId,
        row.description,
        row.longDescription,
        row.categoryName,
        row.fromBin,
        row.toBin,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }, [rows, tableSearch]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (fromLocation) params.set('fromLocation', fromLocation);
    if (toLocation) params.set('toLocation', toLocation);
    params.set('category', category || 'All');
    params.set('strategy', strategy);
    params.set('percent', String(Math.max(0, Number(percent) || 0)));
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    return params;
  }, [category, dateRange.from, dateRange.to, fromLocation, percent, strategy, toLocation]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-dispatch/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock dispatch planning could not be loaded.');
      }

      setPayload(json.data);
      setFromLocation((current) => current || json.data?.filters.fromLocation || '');
      setToLocation((current) => current || json.data?.filters.toLocation || '');
      setCategory(json.data?.filters.category || 'All');
      setStrategy(json.data?.filters.strategy === 'source-surplus' ? 'source-surplus' : 'needed');
      setPercent(String(json.data?.filters.percent ?? 0));
      if (json.data?.filters.dateFrom && json.data?.filters.dateTo) {
        setDateRange((current) => ({
          preset: current.preset,
          from: json.data?.filters.dateFrom || current.from,
          to: json.data?.filters.dateTo || current.to,
        }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock dispatch planning could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    void loadWorkbench();
  }, []);

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
    setStrategy('needed');
    setPercent('0');
    setDateRange(getDefaultDateRange());
    setTableSearch('');
  };

  const createBatch = async () => {
    if (!fromLocation || !toLocation || fromLocation === toLocation) {
      setError('Choose different sending and receiving locations before creating a transfer.');
      return;
    }
    if (visibleRows.length === 0) {
      setError('There are no dispatch lines to create.');
      return;
    }

    setCreating(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/stock-dispatch/batch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromLocation,
          toLocation,
          category,
          strategy,
          percent: Math.max(0, Number(percent) || 0),
          dateFrom: dateRange.from,
          dateTo: dateRange.to,
          lines: visibleRows.map((row) => ({ stockId: row.stockId, quantity: row.dispatchQuantity })),
        }),
      });
      const json = (await response.json()) as BatchResponse;
      if (!response.ok || !json.success || !json.transfer) {
        throw new Error(json.message || 'Transfer batch could not be created.');
      }

      setCreatedTransfer(json.transfer);
      setMessage(`Transfer ${json.transfer.reference} created with ${json.transfer.lineCount} lines.`);
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transfer batch could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const printTransfer = (reference: number) => {
    const printWindow = window.open(buildApiUrl(`/api/inventory/transfers/${reference}/print`), '_blank', 'noopener,noreferrer');
    if (!printWindow) setError('Allow pop-ups for Akiva to open the transfer printout.');
  };

  const openReceiving = (reference: number) => {
    window.history.pushState({}, '', `/inventory/transactions/stockloctransferreceive?reference=${reference}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const openMovements = (row: DispatchRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('location', toLocation || fromLocation);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const fromLabel = locationOptions.find((option) => option.value === fromLocation)?.label || fromLocation || 'sending location';
  const toLabel = locationOptions.find((option) => option.value === toLocation)?.label || toLocation || 'receiving location';

  const columns = useMemo<AdvancedTableColumn<DispatchRow>[]>(
    () => [
      {
        id: 'stockId',
        header: 'Part number',
        accessor: (row) => row.stockId,
        minWidth: 160,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.units || 'No unit'}</div>
          </div>
        ),
      },
      { id: 'description', header: 'Description', accessor: (row) => row.description, minWidth: 260 },
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName, minWidth: 190 },
      {
        id: 'dispatchQuantity',
        header: 'Dispatch qty',
        accessor: (row) => row.dispatchQuantity,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatQuantity(row, row.dispatchQuantity)}</span>,
      },
      {
        id: 'neededQuantity',
        header: 'Receiving need',
        accessor: (row) => row.neededQuantity,
        align: 'right',
        width: 160,
        cell: (row) => formatQuantity(row, row.neededQuantity),
      },
      {
        id: 'fromAvailable',
        header: 'Source available',
        accessor: (row) => row.fromAvailable,
        align: 'right',
        width: 170,
        cell: (row) => formatQuantity(row, row.fromAvailable),
      },
      {
        id: 'fromOnHand',
        header: 'Source on hand',
        accessor: (row) => row.fromOnHand,
        align: 'right',
        width: 160,
        cell: (row) => formatQuantity(row, row.fromOnHand),
      },
      {
        id: 'toOnHand',
        header: 'Receiving on hand',
        accessor: (row) => row.toOnHand,
        align: 'right',
        width: 170,
        cell: (row) => formatQuantity(row, row.toOnHand),
      },
      {
        id: 'quantityUsed',
        header: 'Used in period',
        accessor: (row) => row.quantityUsed,
        align: 'right',
        width: 160,
        cell: (row) => formatQuantity(row, row.quantityUsed),
      },
      {
        id: 'bin',
        header: 'Bins',
        accessor: (row) => `${row.fromBin} ${row.toBin}`,
        minWidth: 180,
        cell: (row) => (
          <div className="min-w-0 text-sm">
            <div className="truncate text-akiva-text">{row.fromBin || 'No source bin'}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">To {row.toBin || 'no receiving bin'}</div>
          </div>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 170,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => openMovements(row)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text"
            >
              <History className="h-4 w-4" />
              Movements
            </button>
          </div>
        ),
      },
    ],
    [fromLocation, toLocation]
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
                    <Truck className="h-4 w-4 text-akiva-accent-text" />
                    Inventory transfers
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ClipboardCheck className="h-4 w-4 text-akiva-accent-text" />
                    Reorder based dispatch
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Stock Dispatch Planning
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Plan stock transfers from locations with spare inventory to locations below reorder level, then create a transfer batch for dispatch.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label="Refresh"
                  title="Refresh"
                  onClick={() => void loadWorkbench()}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  aria-label="Filters"
                  title="Filters"
                  onClick={() => setFilterOpen((open) => !open)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${
                    filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" onClick={() => void createBatch()} disabled={loading || creating || visibleRows.length === 0}>
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Create transfer
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
                  <div>
                    <span className={labelClass}>From location</span>
                    <SearchableSelect value={fromLocation} onChange={(value) => setFromLocation(value)} options={locationOptions} placeholder="Sending location" />
                  </div>
                  <div>
                    <span className={labelClass}>To location</span>
                    <SearchableSelect value={toLocation} onChange={(value) => setToLocation(value)} options={locationOptions} placeholder="Receiving location" />
                  </div>
                  <div>
                    <span className={labelClass}>Category</span>
                    <SearchableSelect value={category} onChange={(value) => setCategory(value || 'All')} options={categoryOptions} placeholder="Choose category" />
                  </div>
                  <div>
                    <span className={labelClass}>Strategy</span>
                    <SearchableSelect
                      value={strategy}
                      onChange={(value) => setStrategy(value === 'source-surplus' ? 'source-surplus' : 'needed')}
                      options={[
                        { value: 'needed', label: 'Cover receiving shortage' },
                        { value: 'source-surplus', label: 'Move source surplus' },
                      ]}
                      placeholder="Choose strategy"
                    />
                  </div>
                  <div>
                    <span className={labelClass}>Extra cover %</span>
                    <input value={percent} onChange={(event) => setPercent(event.target.value)} inputMode="decimal" className={inputClass} placeholder="0" />
                  </div>
                  <div className="md:col-span-2 xl:col-span-1">
                    <span className={labelClass}>Usage date range</span>
                    <DateRangePicker value={dateRange} onChange={setDateRange} label="Start and end date" triggerClassName="h-11 rounded-lg px-3" />
                  </div>
                  <div className="flex gap-2 md:col-span-2 xl:col-span-6">
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

            {createdTransfer ? (
              <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-900 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-100 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Transfer {createdTransfer.reference} is ready for dispatch</h2>
                  <p className="mt-1 text-sm opacity-80">
                    {createdTransfer.lineCount} lines from {createdTransfer.fromLocation} to {createdTransfer.toLocation}, total quantity {formatNumber(createdTransfer.totalQuantity, 4)}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => printTransfer(createdTransfer.reference)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Print transfer
                  </Button>
                  <Button type="button" onClick={() => openReceiving(createdTransfer.reference)}>
                    Open receiving
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Dispatch lines" value={formatNumber(summary.lines, 0)} note={`${formatNumber(summary.items, 0)} stocked items selected`} icon={PackageCheck} loading={loading} />
              <MetricCard label="Dispatch quantity" value={formatNumber(summary.dispatchQuantity, 2)} note={`Planned from ${fromLabel}`} icon={Truck} loading={loading} />
              <MetricCard label="Receiving need" value={formatNumber(summary.neededQuantity, 2)} note={`Shortage at ${toLabel}`} icon={AlertTriangle} loading={loading} />
              <MetricCard label="Used in period" value={formatNumber(summary.usedInPeriod, 2)} note="Usage in the selected date range" icon={ClipboardCheck} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Dispatch proposal</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Calculated from reorder levels, on-hand quantities, open transfer quantities, and recent usage.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, category or bin" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-dispatch-planning"
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(row) => row.stockId}
                  emptyMessage={loading ? 'Loading dispatch proposal...' : 'No dispatch quantities match these filters.'}
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
