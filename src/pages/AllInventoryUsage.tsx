import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Check,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { Modal } from '../components/ui/Modal';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface Option {
  value: string;
  label: string;
  code?: string;
}

interface UsageRow {
  stockId: string;
  description: string;
  categoryDescription: string;
  materialCost: number;
  quantityOnHand: number;
  openingBalance: number;
  closingBalance: number;
  newPurchases: number;
  usage: number;
  consumptionCost: number;
  usageCost: number;
}

interface Summary {
  items: number;
  quantityOnHand: number;
  openingBalance: number;
  closingBalance: number;
  newPurchases: number;
  usage: number;
  usageCost: number;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  saleTypes: Option[];
  rows: UsageRow[];
  summary: Summary;
  currency: string;
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

function formatMoney(value: number, currency = 'TZS'): string {
  return `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)}`;
}

export function AllInventoryUsage() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [hasRun, setHasRun] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSaleTypes, setSelectedSaleTypes] = useState<string[]>(['10', '-1', '-2']);
  const [detailRow, setDetailRow] = useState<UsageRow | null>(null);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    items: 0,
    quantityOnHand: 0,
    openingBalance: 0,
    closingBalance: 0,
    newPurchases: 0,
    usage: 0,
    usageCost: 0,
  };
  const currency = payload?.currency ?? 'TZS';

  const buildParams = useCallback((run = hasRun) => {
    const params = new URLSearchParams();
    if (run) params.set('run', '1');
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    selectedLocations.forEach((location) => params.append('locations[]', location));
    selectedCategories.forEach((category) => params.append('categories[]', category));
    selectedSaleTypes.forEach((saleType) => params.append('saleTypes[]', saleType));
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [dateRange.from, dateRange.to, hasRun, selectedCategories, selectedLocations, selectedSaleTypes, tableSearch]);

  const loadWorkbench = useCallback(async (run = hasRun) => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/all-inventory-usage/workbench?${buildParams(run).toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'All inventory usage could not be loaded.');
      }

      setPayload(json.data);
      if (!hasRun && !run) {
        if (selectedLocations.length === 0 && json.data.locations.length > 0) {
          setSelectedLocations(json.data.locations.map((option) => option.value));
        }
        if (selectedCategories.length === 0 && json.data.categories.length > 0) {
          setSelectedCategories(json.data.categories.map((option) => option.value));
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'All inventory usage could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [buildParams, hasRun, selectedCategories.length, selectedLocations.length]);

  useEffect(() => {
    void loadWorkbench(false);
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const runReport = () => {
    setHasRun(true);
    void loadWorkbench(true);
  };

  const clearFilters = () => {
    setSelectedLocations(payload?.locations.map((option) => option.value) ?? []);
    setSelectedCategories(payload?.categories.map((option) => option.value) ?? []);
    setSelectedSaleTypes(['10', '-1', '-2']);
    setDateRange(getDefaultDateRange());
    setTableSearch('');
    setHasRun(false);
    void loadWorkbench(false);
  };

  const exportReport = async (format: 'pdf' | 'excel') => {
    if (!hasRun) {
      setError('Run the report before exporting.');
      return;
    }

    setExporting(format);
    setError('');
    setMessage('');

    const exportUrl = buildApiUrl(`/api/inventory/all-inventory-usage/export/${format}?${buildParams(true).toString()}`);

    if (format === 'pdf') {
      const pdfWindow = window.open(exportUrl, '_blank', 'noopener,noreferrer');
      setExporting('');

      if (!pdfWindow) {
        setError('Allow pop-ups for Akiva to open the PDF report.');
        return;
      }

      setMessage('PDF report opened.');
      return;
    }

    try {
      const response = await apiFetch(exportUrl);
      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          throw new Error(json.message || `All inventory usage ${format.toUpperCase()} could not be created.`);
        }
        throw new Error(`All inventory usage ${format.toUpperCase()} could not be created.`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `all-inventory-usage-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setMessage('Excel report created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'All inventory usage Excel file could not be created.');
    } finally {
      setExporting('');
    }
  };

  const openMovements = (row: UsageRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('from', dateRange.from);
    params.set('to', dateRange.to);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<UsageRow>[]>(
    () => [
      {
        id: 'stockId',
        header: 'Stock ID',
        accessor: (row) => row.stockId,
        minWidth: 150,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.categoryDescription}</div>
          </div>
        ),
      },
      { id: 'description', header: 'Description', accessor: (row) => row.description, minWidth: 260 },
      { id: 'quantityOnHand', header: 'QOH', accessor: (row) => row.quantityOnHand, align: 'right', width: 120, cell: (row) => formatNumber(row.quantityOnHand, 0) },
      { id: 'openingBalance', header: 'Opening', accessor: (row) => row.openingBalance, align: 'right', width: 130, cell: (row) => formatNumber(row.openingBalance, 0) },
      { id: 'newPurchases', header: 'Purchases', accessor: (row) => row.newPurchases, align: 'right', width: 130, cell: (row) => formatNumber(row.newPurchases, 0) },
      { id: 'usage', header: 'Usage', accessor: (row) => row.usage, align: 'right', width: 130, cell: (row) => <span className="font-semibold text-rose-700 dark:text-rose-300">{formatNumber(row.usage, 0)}</span> },
      { id: 'closingBalance', header: 'Balance', accessor: (row) => row.closingBalance, align: 'right', width: 130, cell: (row) => formatNumber(row.closingBalance, 0) },
      { id: 'materialCost', header: 'Std cost', accessor: (row) => row.materialCost, align: 'right', width: 130, cell: (row) => formatMoney(row.materialCost, currency) },
      { id: 'usageCost', header: 'Usage cost', accessor: (row) => row.usageCost, align: 'right', width: 150, cell: (row) => formatMoney(row.usageCost, currency) },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 190,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => setDetailRow(row)}>
              <Eye className="h-4 w-4" />
              View
            </button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => openMovements(row)}>
              <History className="h-4 w-4" />
              Movements
            </button>
          </div>
        ),
      },
    ],
    [currency, dateRange.from, dateRange.to]
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
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Consumption summary
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  All Inventory Usage
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review item consumption across selected locations and categories, including opening balance, purchases, usage, balance, and usage cost.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench(hasRun)} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter all inventory usage" title="Filter all inventory usage" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => void exportReport('excel')} disabled={!hasRun || exporting !== ''} className="inline-flex h-10 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">
                  {exporting === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </button>
                <button type="button" onClick={() => void exportReport('pdf')} disabled={!hasRun || exporting !== ''} className="inline-flex h-10 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">
                  {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.6fr)]">
                  <MultiSelect title="Categories" options={payload?.categories ?? []} selected={selectedCategories} onChange={setSelectedCategories} loading={loading} />
                  <MultiSelect title="Locations" options={payload?.locations ?? []} selected={selectedLocations} onChange={setSelectedLocations} loading={loading} />
                  <div className="space-y-4">
                    <div>
                      <span className={labelClass}>Usage dates</span>
                      <DateRangePicker value={dateRange} onChange={setDateRange} label="Start and end date" triggerClassName="h-11 rounded-lg px-3" />
                    </div>
                    <MultiSelect title="Consumption type" options={payload?.saleTypes ?? []} selected={selectedSaleTypes} onChange={setSelectedSaleTypes} compact loading={loading} />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={runReport} disabled={loading || selectedCategories.length === 0 || selectedLocations.length === 0 || selectedSaleTypes.length === 0}>
                        {loading && hasRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Display data
                      </Button>
                      <Button type="button" variant="secondary" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Items used" value={formatNumber(summary.items, 0)} note="Items with usage in the selected period" icon={PackageSearch} loading={loading && hasRun} />
              <MetricCard label="Total usage" value={formatNumber(summary.usage, 0)} note="Consumption/usage quantity" icon={TrendingDown} loading={loading && hasRun} />
              <MetricCard label="New purchases" value={formatNumber(summary.newPurchases, 0)} note="Purchases in the selected period" icon={BarChart3} loading={loading && hasRun} />
              <MetricCard label="Usage cost" value={formatMoney(summary.usageCost, currency)} note="Usage quantity multiplied by standard cost" icon={History} loading={loading && hasRun} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Inventory usage</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">{hasRun ? 'Opening, purchases, usage and balance by item.' : 'Choose filters and display data to run this report.'}</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') runReport(); }} className={`${inputClass} pl-10`} placeholder="Search item, description or category" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="all-inventory-usage"
                  columns={columns}
                  rows={rows}
                  rowKey={(row) => row.stockId}
                  emptyMessage={loading && hasRun ? 'Loading inventory usage...' : hasRun ? 'No inventory usage matches these filters.' : 'Run the report to show inventory usage.'}
                  loading={loading && hasRun}
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
        title={detailRow ? `${detailRow.stockId} Usage` : 'Usage Detail'}
        size="md"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-akiva-text">{detailRow.description}</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">{detailRow.categoryDescription}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile label="Current quantity on hand" value={formatNumber(detailRow.quantityOnHand, 0)} />
              <InfoTile label="Opening balance" value={formatNumber(detailRow.openingBalance, 0)} />
              <InfoTile label="New purchases" value={formatNumber(detailRow.newPurchases, 0)} />
              <InfoTile label="Consumption/usage" value={formatNumber(detailRow.usage, 0)} />
              <InfoTile label="Balance" value={formatNumber(detailRow.closingBalance, 0)} />
              <InfoTile label="Material cost" value={formatMoney(detailRow.materialCost, currency)} />
              <InfoTile label="Consumption cost" value={formatMoney(detailRow.usageCost, currency)} />
            </div>
            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={() => openMovements(detailRow)}>
                Open stock movements
              </Button>
            </div>
          </section>
        ) : null}
      </Modal>

      {error ? <ToastNotification type="error" message={error} onClose={() => setError('')} /> : null}
      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}

function MultiSelect({ title, options, selected, onChange, compact = false, loading = false }: { title: string; options: Option[]; selected: string[]; onChange: (values: string[]) => void; compact?: boolean; loading?: boolean }) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (value: string) => {
    if (selectedSet.has(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={labelClass}>{title}</span>
        <div className="flex gap-1">
          <button type="button" className="rounded-md border border-akiva-border px-2 py-1 text-xs font-semibold text-akiva-text-muted hover:text-akiva-accent-text" onClick={() => onChange(options.map((option) => option.value))}>All</button>
          <button type="button" className="rounded-md border border-akiva-border px-2 py-1 text-xs font-semibold text-akiva-text-muted hover:text-akiva-accent-text" onClick={() => onChange([])}>None</button>
        </div>
      </div>
      <div className={`overflow-y-auto rounded-xl border border-akiva-border bg-akiva-surface px-2 py-2 ${compact ? 'max-h-36' : 'max-h-64'}`}>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-akiva-accent-text" />
          </div>
        ) : options.length > 0 ? (
          <div className={`grid gap-1 ${compact ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
            {options.map((option) => (
              <label key={option.value} className="group flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                <input type="checkbox" className="sr-only" checked={selectedSet.has(option.value)} onChange={() => toggle(option.value)} />
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border shadow-sm transition ${selectedSet.has(option.value) ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-transparent group-hover:border-akiva-accent'}`}>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <span className="truncate">{option.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="px-2 py-6 text-sm text-akiva-text-muted">No options found.</div>
        )}
      </div>
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
