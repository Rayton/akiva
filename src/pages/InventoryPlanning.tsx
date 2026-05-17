import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DateRangePicker, toIsoDate, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface Option {
  value: string;
  label: string;
  code?: string;
}

interface PlanningRow {
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  quantityOnHand: number;
  periodUsage: number[];
  usageTotal: number;
  usageBasis: number;
  idealStock: number;
  customerDemand: number;
  assemblyDemand: number;
  totalDemand: number;
  purchaseOnOrder: number;
  workOrderSupply: number;
  openSupply: number;
  suggestedOrder: number;
  unitCost: number;
  suggestedValue: number;
  units: string;
  decimalPlaces: number;
  priority: number;
  status: string;
}

interface Summary {
  lines: number;
  items: number;
  suggestedLines: number;
  suggestedQuantity: number;
  suggestedValue: number;
  openDemand: number;
  openSupply: number;
  usageTotal: number;
}

interface PeriodOption {
  key: string;
  label: string;
  from: string;
  to: string;
  active?: boolean;
}

interface Filters {
  location: string;
  category: string;
  policy: 'max' | 'average';
  status: string;
  monthsCover: number;
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: PlanningRow[];
  summary: Summary;
  currency: string;
  periods: PeriodOption[];
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

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)}`;
}

function formatQuantity(row: PlanningRow, value: number): string {
  const quantity = formatNumber(value, Math.max(0, Math.min(4, row.decimalPlaces ?? 2)));
  return row.units ? `${quantity} ${row.units}` : quantity;
}

function getPlanningDateRange(): DateRangeValue {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  return { preset: 'custom', from: toIsoDate(start), to: toIsoDate(today) };
}

export function InventoryPlanning() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [category, setCategory] = useState('All');
  const [location, setLocation] = useState('All');
  const [policy, setPolicy] = useState<'max' | 'average'>('max');
  const [status, setStatus] = useState('needs-order');
  const [monthsCover, setMonthsCover] = useState('1');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getPlanningDateRange());
  const [tableSearch, setTableSearch] = useState('');

  const rows = payload?.rows ?? [];
  const currency = payload?.currency ?? 'TZS';
  const periods = payload?.periods ?? [];
  const visiblePeriods = useMemo(() => periods.filter((period) => period.active !== false && period.label), [periods]);
  const summary = payload?.summary ?? {
    lines: 0,
    items: 0,
    suggestedLines: 0,
    suggestedQuantity: 0,
    suggestedValue: 0,
    openDemand: 0,
    openSupply: 0,
    usageTotal: 0,
  };

  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);

  const visibleRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter((row) =>
      [row.stockId, row.description, row.longDescription, row.categoryName, row.status]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }, [rows, tableSearch]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('category', category);
    params.set('location', location);
    params.set('policy', policy);
    params.set('status', status);
    params.set('monthsCover', String(Math.max(0.5, Number(monthsCover) || 1)));
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    return params;
  }, [category, dateRange.from, dateRange.to, location, monthsCover, policy, status]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/inventory-planning/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Inventory planning could not be loaded.');
      }

      setPayload(json.data);
      setCategory(json.data.filters.category || 'All');
      setLocation(json.data.filters.location || 'All');
      setPolicy(json.data.filters.policy === 'average' ? 'average' : 'max');
      setStatus(json.data.filters.status || 'needs-order');
      setMonthsCover(String(json.data.filters.monthsCover ?? 1));
      setDateRange((current) => ({
        preset: current.preset,
        from: json.data?.filters.dateFrom || current.from,
        to: json.data?.filters.dateTo || current.to,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory planning could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    void loadWorkbench();
  }, [loadWorkbench]);

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
    setLocation('All');
    setPolicy('max');
    setStatus('needs-order');
    setMonthsCover('1');
    setDateRange(getPlanningDateRange());
    setTableSearch('');
  };

  const exportReport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    setError('');
    setMessage('');
    const exportUrl = buildApiUrl(`/api/inventory/inventory-planning/export/${format}?${buildParams().toString()}`);

    if (format === 'pdf') {
      const pdfWindow = window.open(exportUrl, '_blank', 'noopener,noreferrer');
      setExporting('');
      if (!pdfWindow) setError('Allow pop-ups for Akiva to open the PDF report.');
      else setMessage('PDF report opened.');
      return;
    }

    try {
      const response = await apiFetch(exportUrl);
      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          throw new Error(json.message || 'Inventory planning Excel file could not be created.');
        }
        throw new Error('Inventory planning Excel file could not be created.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-planning-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Excel report created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory planning Excel file could not be created.');
    } finally {
      setExporting('');
    }
  };

  const openMovements = (row: PlanningRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    if (location !== 'All') params.set('location', location);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<PlanningRow>[]>(
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
        id: 'basis',
        header: policy === 'average' ? 'Average usage' : 'Peak usage',
        accessor: (row) => row.usageBasis,
        align: 'right',
        width: 140,
        cell: (row) => formatNumber(row.usageBasis, 2),
      },
      {
        id: 'idealStock',
        header: 'Ideal stock',
        accessor: (row) => row.idealStock,
        align: 'right',
        width: 140,
        cell: (row) => formatQuantity(row, row.idealStock),
      },
      {
        id: 'qoh',
        header: 'On hand',
        accessor: (row) => row.quantityOnHand,
        align: 'right',
        width: 140,
        cell: (row) => formatQuantity(row, row.quantityOnHand),
      },
      {
        id: 'demand',
        header: 'Open demand',
        accessor: (row) => row.totalDemand,
        align: 'right',
        width: 145,
        cell: (row) => formatQuantity(row, row.totalDemand),
      },
      {
        id: 'supply',
        header: 'Open supply',
        accessor: (row) => row.openSupply,
        align: 'right',
        width: 145,
        cell: (row) => formatQuantity(row, row.openSupply),
      },
      {
        id: 'suggested',
        header: 'Suggested order',
        accessor: (row) => row.suggestedOrder,
        align: 'right',
        width: 165,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatQuantity(row, row.suggestedOrder)}</span>,
      },
      {
        id: 'value',
        header: 'Suggested value',
        accessor: (row) => row.suggestedValue,
        align: 'right',
        width: 165,
        cell: (row) => formatMoney(row.suggestedValue, currency),
      },
      {
        id: 'periods',
        header: 'Recent usage',
        accessor: (row) => row.periodUsage.join(' '),
        minWidth: 230,
        cell: (row) => (
          <div className="grid grid-cols-3 gap-1 text-xs">
            {row.periodUsage.slice(0, Math.max(1, visiblePeriods.length)).map((value, index) => (
              <span key={`${row.stockId}-${index}`} className="rounded-md bg-akiva-surface px-1.5 py-1 text-right text-akiva-text-muted">
                {(visiblePeriods[index]?.label || 'Usage').slice(0, 3)} {formatNumber(value, 0)}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 160,
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
            row.suggestedOrder > 0
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
              : row.openSupply > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-akiva-border bg-akiva-surface text-akiva-text-muted'
          }`}>
            {row.status}
          </span>
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
            <button type="button" onClick={() => openMovements(row)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text">
              <History className="h-4 w-4" />
              Movements
            </button>
          </div>
        ),
      },
    ],
    [currency, location, policy, visiblePeriods]
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
                    <ShoppingCart className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <BarChart3 className="h-4 w-4 text-akiva-accent-text" />
                    Purchase planning
                  </span>
                </div>
                <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                  Inventory Planning
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Calculate suggested order quantities from recent usage, current stock, open demand, and supply already in progress.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title="Filters" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => void exportReport('excel')} disabled={loading || exporting !== '' || rows.length === 0} className="inline-flex h-10 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">
                  {exporting === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </button>
                <button type="button" onClick={() => void exportReport('pdf')} disabled={loading || exporting !== '' || rows.length === 0} className="inline-flex h-10 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">
                  {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={location} onChange={(value) => setLocation(value || 'All')} options={locationOptions} placeholder="Choose location" />
                  </div>
                  <div>
                    <span className={labelClass}>Category</span>
                    <SearchableSelect value={category} onChange={(value) => setCategory(value || 'All')} options={categoryOptions} placeholder="Choose category" />
                  </div>
                  <div>
                    <span className={labelClass}>Usage policy</span>
                    <SearchableSelect
                      value={policy}
                      onChange={(value) => setPolicy(value === 'average' ? 'average' : 'max')}
                      options={[
                        { value: 'max', label: 'Peak month usage' },
                        { value: 'average', label: 'Average month usage' },
                      ]}
                      placeholder="Choose policy"
                    />
                  </div>
                  <div>
                    <span className={labelClass}>Status</span>
                    <SearchableSelect
                      value={status}
                      onChange={(value) => setStatus(value || 'needs-order')}
                      options={[
                        { value: 'needs-order', label: 'Needs order' },
                        { value: 'covered', label: 'Covered by supply' },
                        { value: 'no-usage', label: 'No recent usage' },
                        { value: 'all', label: 'All planning lines' },
                      ]}
                      placeholder="Choose status"
                    />
                  </div>
                  <div>
                    <span className={labelClass}>Cover months</span>
                    <input value={monthsCover} onChange={(event) => setMonthsCover(event.target.value)} inputMode="decimal" className={inputClass} placeholder="1" />
                  </div>
                  <div>
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

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Suggested value" value={formatMoney(summary.suggestedValue, currency)} note={`${formatNumber(summary.suggestedLines, 0)} lines need ordering`} icon={WalletCards} loading={loading} />
              <MetricCard label="Suggested quantity" value={formatNumber(summary.suggestedQuantity, 2)} note="Total proposed replenishment" icon={ShoppingCart} loading={loading} />
              <MetricCard label="Open demand" value={formatNumber(summary.openDemand, 2)} note="Unfulfilled customer and assembly demand" icon={TrendingUp} loading={loading} />
              <MetricCard label="Open supply" value={formatNumber(summary.openSupply, 2)} note="Purchase and work-order supply pending" icon={PackageSearch} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Planning lines</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Suggested order = ideal stock minus on hand, plus demand, minus open supply.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, category or status" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="inventory-planning"
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(row) => row.stockId}
                  emptyMessage={loading ? 'Loading inventory planning...' : 'No planning rows match these filters.'}
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
