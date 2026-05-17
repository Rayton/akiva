import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Loader2,
  PackageCheck,
  Printer,
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

interface StockCheckRow {
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  category: string;
  categoryName: string;
  units: string;
  decimalPlaces: number;
  frozenQuantity: number;
  countedQuantity: number | null;
  variance: number;
  countLines: number;
  lastReference: string;
  stockCheckDate: string;
  status: 'Not counted' | 'Matched' | 'Variance';
}

interface Summary {
  sheetItems: number;
  countedItems: number;
  notCountedItems: number;
  varianceItems: number;
  varianceUnits: number;
  locations: number;
  latestSheetDate: string | null;
}

interface Filters {
  location: string;
  category: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  q: string;
  showSystemQuantity: boolean;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: StockCheckRow[];
  summary: Summary;
  filters: Filters;
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

type StatusFilter = 'All' | StockCheckRow['status'];
type PrepareMode = 'update' | 'replace';

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function statusClass(status: StockCheckRow['status']): string {
  if (status === 'Matched') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'Variance') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

export function StockCheck() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<'sheet' | 'comparison' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [location, setLocation] = useState('All');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState<StatusFilter>('All');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [tableSearch, setTableSearch] = useState('');
  const [showSystemQuantity, setShowSystemQuantity] = useState(true);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [prepareLocation, setPrepareLocation] = useState('');
  const [prepareCategory, setPrepareCategory] = useState('All');
  const [prepareMode, setPrepareMode] = useState<PrepareMode>('update');
  const [onlyNonZero, setOnlyNonZero] = useState(false);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    sheetItems: 0,
    countedItems: 0,
    notCountedItems: 0,
    varianceItems: 0,
    varianceUnits: 0,
    locations: 0,
    latestSheetDate: null,
  };

  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const countLocationOptions = useMemo(() => (payload?.locations ?? []).map((item) => ({ value: item.value, label: `${item.label} (${item.code ?? item.value})` })), [payload?.locations]);
  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);
  const statusOptions = [
    { value: 'All', label: 'All sheet lines' },
    { value: 'Not counted', label: 'Not counted' },
    { value: 'Variance', label: 'Variance' },
    { value: 'Matched', label: 'Matched' },
  ];

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('location', location);
    params.set('category', category);
    params.set('status', status);
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    params.set('showSystemQuantity', showSystemQuantity ? '1' : '0');
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [category, dateRange.from, dateRange.to, location, showSystemQuantity, status, tableSearch]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-check/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock check sheets could not be loaded.');
      }

      setPayload(json.data);
      setPrepareLocation((current) => current || json.data?.locations[0]?.value || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock check sheets could not be loaded.');
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
    setLocation('All');
    setCategory('All');
    setStatus('All');
    setDateRange(getDefaultDateRange());
    setTableSearch('');
    setShowSystemQuantity(true);
  };

  const openPrepare = () => {
    setPrepareLocation(location !== 'All' ? location : payload?.locations[0]?.value || '');
    setPrepareCategory(category);
    setPrepareMode('update');
    setOnlyNonZero(false);
    setPrepareOpen(true);
  };

  const prepareSheet = async () => {
    if (!prepareLocation) {
      setError('Choose the location to count.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/stock-check/prepare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: prepareLocation,
          category: prepareCategory,
          mode: prepareMode,
          onlyNonZero,
        }),
      });
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock check sheet could not be prepared.');
      }

      setPayload(json.data);
      setLocation(prepareLocation);
      setCategory(prepareCategory);
      setDateRange({ ...dateRange, from: json.data.filters.dateFrom, to: json.data.filters.dateTo });
      setPrepareOpen(false);
      setMessage(json.message || 'Stock check sheet prepared.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock check sheet could not be prepared.');
    } finally {
      setSaving(false);
    }
  };

  const openPdf = (type: 'sheet' | 'comparison') => {
    setExporting(type);
    const endpoint = type === 'comparison' ? 'comparison/pdf' : 'sheets/pdf';
    const url = buildApiUrl(`/api/inventory/stock-check/${endpoint}?${buildParams().toString()}`);
    const pdfWindow = window.open(url, '_blank', 'noopener,noreferrer');
    setExporting('');
    if (!pdfWindow) setError('Allow pop-ups for Akiva to open the PDF report.');
    else setMessage(type === 'comparison' ? 'Stock check comparison opened.' : 'Stock check sheets opened.');
  };

  const openCounts = () => {
    window.history.pushState({}, '', '/inventory/transactions/stockcounts');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const completionRate = summary.sheetItems > 0 ? Math.round((summary.countedItems / summary.sheetItems) * 100) : 0;

  const columns = useMemo<AdvancedTableColumn<StockCheckRow>[]>(
    () => [
      {
        id: 'item',
        header: 'Item',
        accessor: (row) => `${row.stockId} ${row.description}`,
        minWidth: 260,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.description}</div>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => `${row.locationName} ${row.location}`,
        minWidth: 190,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName, minWidth: 190 },
      {
        id: 'frozenQuantity',
        header: 'Expected',
        accessor: (row) => row.frozenQuantity,
        align: 'right',
        width: 130,
        cell: (row) => `${formatNumber(row.frozenQuantity, row.decimalPlaces || 2)} ${row.units}`,
      },
      {
        id: 'countedQuantity',
        header: 'Counted',
        accessor: (row) => row.countedQuantity ?? '',
        align: 'right',
        width: 130,
        cell: (row) => row.countedQuantity === null ? '-' : `${formatNumber(row.countedQuantity, row.decimalPlaces || 2)} ${row.units}`,
      },
      {
        id: 'variance',
        header: 'Variance',
        accessor: (row) => row.variance,
        align: 'right',
        width: 120,
        cell: (row) => (
          <span className={row.status === 'Variance' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold text-akiva-text'}>
            {row.countLines === 0 ? '-' : formatNumber(row.variance, row.decimalPlaces || 2)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 140,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>,
      },
      { id: 'stockCheckDate', header: 'Sheet date', accessor: (row) => row.stockCheckDate, width: 135 },
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
          <button type="button" onClick={openCounts} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-akiva-accent px-3 text-xs font-semibold text-white shadow-sm hover:bg-akiva-accent-strong">
            <ClipboardCheck className="h-4 w-4" />
            Count
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
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ClipboardList className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Count sheet control
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                  Stock Check Sheets
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Freeze expected quantities for a location, print physical count sheets, and review count differences before adjustments are posted.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title="Filters" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => openPdf('comparison')} disabled={loading || rows.length === 0 || exporting !== ''} className="inline-flex h-10 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">
                  {exporting === 'comparison' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Compare
                </button>
                <button type="button" onClick={() => openPdf('sheet')} disabled={loading || rows.length === 0 || exporting !== ''} className="inline-flex h-10 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">
                  {exporting === 'sheet' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  Print sheets
                </button>
                <Button type="button" onClick={openPrepare}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Prepare count
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
                    <span className={labelClass}>Status</span>
                    <SearchableSelect value={status} onChange={(value) => setStatus((value || 'All') as StatusFilter)} options={statusOptions} placeholder="Status" />
                  </div>
                  <div>
                    <span className={labelClass}>Sheet date range</span>
                    <DateRangePicker value={dateRange} onChange={setDateRange} label="Start and end date" triggerClassName="h-11 rounded-lg px-3" />
                  </div>
                  <label className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text">
                    <input type="checkbox" checked={showSystemQuantity} onChange={(event) => setShowSystemQuantity(event.target.checked)} className="h-4 w-4 rounded border-akiva-border-strong text-akiva-accent-text focus:ring-akiva-accent" />
                    Show expected quantity on sheets
                  </label>
                  <div className="flex gap-2 md:col-span-2 xl:col-span-5">
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
              <MetricCard label="Count progress" value={`${completionRate}%`} note={`${formatNumber(summary.countedItems, 0)} of ${formatNumber(summary.sheetItems, 0)} sheet lines counted`} icon={PackageCheck} onClick={() => setStatus('All')} />
              <MetricCard label="Still to count" value={formatNumber(summary.notCountedItems, 0)} note="Sheet lines without a physical count" icon={ClipboardList} onClick={() => setStatus('Not counted')} />
              <MetricCard label="Variance lines" value={formatNumber(summary.varianceItems, 0)} note={`${formatNumber(summary.varianceUnits)} units different`} icon={AlertTriangle} onClick={() => setStatus('Variance')} />
              <MetricCard label="Latest sheet" value={summary.latestSheetDate ?? '-'} note={`${formatNumber(summary.locations, 0)} location${summary.locations === 1 ? '' : 's'} in this view`} icon={ShieldCheck} onClick={openPrepare} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Frozen count sheet</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">These are the quantities captured when the count sheet was prepared.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, category or location" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-check-sheets"
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => `${row.location}-${row.stockId}`}
                  emptyMessage={loading ? 'Loading stock check sheets...' : 'No stock check sheet rows match these filters.'}
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
        isOpen={prepareOpen}
        onClose={() => !saving && setPrepareOpen(false)}
        title="Prepare Stock Check"
        size="md"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setPrepareOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={prepareSheet} disabled={saving || !prepareLocation}>
              <ClipboardList className="mr-2 h-4 w-4" />
              {saving ? 'Preparing...' : 'Prepare sheet'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Location</span>
                <SearchableSelect value={prepareLocation} onChange={setPrepareLocation} options={countLocationOptions} inputClassName={inputClass} placeholder="Choose location" />
              </label>
              <label className="block">
                <span className={labelClass}>Category</span>
                <SearchableSelect value={prepareCategory} onChange={setPrepareCategory} options={categoryOptions} inputClassName={inputClass} placeholder="Category" />
              </label>
              <label className="block">
                <span className={labelClass}>Action</span>
                <SearchableSelect
                  value={prepareMode}
                  onChange={(value) => setPrepareMode(value === 'replace' ? 'replace' : 'update')}
                  options={[
                    { value: 'update', label: 'Add or update sheet' },
                    { value: 'replace', label: 'Replace selected sheet' },
                  ]}
                  inputClassName={inputClass}
                  placeholder="Action"
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text">
                <input type="checkbox" checked={onlyNonZero} onChange={(event) => setOnlyNonZero(event.target.checked)} className="h-4 w-4 rounded border-akiva-border-strong text-akiva-accent-text focus:ring-akiva-accent" />
                Only include items with stock on hand
              </label>
            </div>
          </section>
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-muted/60 p-4 text-sm leading-6 text-akiva-text-muted">
            Preparing a stock check freezes the expected quantity at the selected location. Physical counts should be entered against this frozen sheet.
          </section>
        </div>
      </Modal>

      {error ? <ToastNotification type="error" message={error} onClose={() => setError('')} /> : null}
      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon, onClick }: { label: string; value: string; note: string; icon: LucideIcon; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-akiva-text">{value}</p>
          <p className="mt-3 text-sm leading-5 text-akiva-text-muted">{note}</p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </button>
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
