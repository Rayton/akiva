import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  Loader2,
  MapPin,
  PackageSearch,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  TrendingUp,
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

interface ReorderLocationRow {
  stockId: string;
  description: string;
  longDescription: string;
  location: string;
  onHand: number;
  onHandAll: number;
  quantityUsed: number;
  dailyUsage: number;
  reorderLevel: number;
  suggestedReorder: number;
  bin: string;
  units: string;
  decimalPlaces: number;
  status: 'Below reorder' | 'Set';
}

interface Summary {
  lines: number;
  belowReorder: number;
  withUsage: number;
  zeroReorder: number;
}

interface Filters {
  location: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  orderBy: 'usage' | 'stockId';
  search: string;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: ReorderLocationRow[];
  summary: Summary;
  filters: Filters;
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

type DraftMap = Record<string, { reorderLevel: string; bin: string }>;

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const smallInputClass =
  'h-9 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-2 text-sm font-semibold text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function rowKey(row: ReorderLocationRow): string {
  return `${row.stockId}-${row.location}`;
}

export function ReorderLevelLocation() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [orderBy, setOrderBy] = useState<'usage' | 'stockId'>('usage');
  const [tableSearch, setTableSearch] = useState('');
  const [drafts, setDrafts] = useState<DraftMap>({});

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? { lines: 0, belowReorder: 0, withUsage: 0, zeroReorder: 0 };
  const locationOptions = payload?.locations ?? [];
  const categoryOptions = payload?.categories ?? [];

  const visibleRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) return rows;

    return rows.filter((row) =>
      [row.stockId, row.description, row.longDescription, row.bin, row.status]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }, [rows, tableSearch]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (category) params.set('category', category);
    params.set('dateFrom', dateRange.from);
    params.set('dateTo', dateRange.to);
    params.set('orderBy', orderBy);
    return params;
  }, [category, dateRange.from, dateRange.to, location, orderBy]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/reorder-level-location/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Reorder levels by location could not be loaded.');
      }

      setPayload(json.data);
      setLocation((current) => current || json.data?.filters.location || '');
      setCategory((current) => current || json.data?.filters.category || '');
      if (json.data?.filters.dateFrom && json.data?.filters.dateTo) {
        setDateRange((current) => ({
          preset: current.preset,
          from: json.data?.filters.dateFrom || current.from,
          to: json.data?.filters.dateTo || current.to,
        }));
      }
      setOrderBy(json.data?.filters.orderBy === 'stockId' ? 'stockId' : 'usage');
      setDrafts({});
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reorder levels by location could not be loaded.');
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

  const draftFor = (row: ReorderLocationRow) => drafts[rowKey(row)] ?? {
    reorderLevel: String(row.reorderLevel),
    bin: row.bin,
  };

  const setDraftValue = (row: ReorderLocationRow, field: 'reorderLevel' | 'bin', value: string) => {
    const key = rowKey(row);
    setDrafts((previous) => ({
      ...previous,
      [key]: {
        reorderLevel: previous[key]?.reorderLevel ?? String(row.reorderLevel),
        bin: previous[key]?.bin ?? row.bin,
        [field]: value,
      },
    }));
  };

  const saveRow = async (row: ReorderLocationRow, useSuggested = false) => {
    const key = rowKey(row);
    const draft = draftFor(row);
    const reorderLevel = useSuggested ? row.suggestedReorder : Number(draft.reorderLevel);
    const bin = draft.bin.trim().toUpperCase();

    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      setError('Reorder level must be zero or more.');
      return;
    }

    setSavingKey(key);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/reorder-level-location/${encodeURIComponent(row.stockId)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: row.location, reorderLevel, bin }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Reorder level could not be saved.');
      }

      setPayload((current) => {
        if (!current) return current;
        const nextRows = current.rows.map((line) =>
          rowKey(line) === key
            ? {
                ...line,
                reorderLevel,
                bin,
                status: line.onHand <= reorderLevel && reorderLevel > 0 ? 'Below reorder' : 'Set',
              }
            : line
        );
        return {
          ...current,
          rows: nextRows,
          summary: {
            ...current.summary,
            belowReorder: nextRows.filter((line) => line.status === 'Below reorder').length,
            zeroReorder: nextRows.filter((line) => line.reorderLevel <= 0).length,
          },
        };
      });
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setMessage('Reorder level saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reorder level could not be saved.');
    } finally {
      setSavingKey('');
    }
  };

  const openMovements = (row: ReorderLocationRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('location', row.location);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const clearFilters = () => {
    setDateRange(getDefaultDateRange());
    setOrderBy('usage');
    setTableSearch('');
  };

  const dateNote = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return 'Usage in the selected period';
    return `Usage from ${dateRange.from} to ${dateRange.to}`;
  }, [dateRange.from, dateRange.to]);

  const columns = useMemo<AdvancedTableColumn<ReorderLocationRow>[]>(
    () => [
      {
        id: 'stockId',
        header: 'Part number',
        accessor: (row) => row.stockId,
        minWidth: 150,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.units || 'No unit'}</div>
          </div>
        ),
      },
      { id: 'description', header: 'Description', accessor: (row) => row.description, minWidth: 260 },
      { id: 'quantityUsed', header: 'Used', accessor: (row) => row.quantityUsed, align: 'right', width: 120, cell: (row) => formatNumber(row.quantityUsed, row.decimalPlaces) },
      { id: 'onHandAll', header: 'On hand all', accessor: (row) => row.onHandAll, align: 'right', width: 140, cell: (row) => formatNumber(row.onHandAll, row.decimalPlaces) },
      { id: 'onHand', header: 'On hand here', accessor: (row) => row.onHand, align: 'right', width: 145, cell: (row) => formatNumber(row.onHand, row.decimalPlaces) },
      {
        id: 'reorderLevel',
        header: 'Reorder level',
        accessor: (row) => row.reorderLevel,
        width: 150,
        cell: (row) => {
          const draft = draftFor(row);
          return (
            <input
              type="number"
              min="0"
              step="any"
              value={draft.reorderLevel}
              onChange={(event) => setDraftValue(row, 'reorderLevel', event.target.value)}
              className={`${smallInputClass} text-right`}
            />
          );
        },
      },
      {
        id: 'bin',
        header: 'Bin',
        accessor: (row) => row.bin,
        width: 130,
        cell: (row) => {
          const draft = draftFor(row);
          return <input value={draft.bin} onChange={(event) => setDraftValue(row, 'bin', event.target.value)} className={smallInputClass} placeholder="Bin" />;
        },
      },
      { id: 'suggested', header: 'Suggested', accessor: (row) => row.suggestedReorder, align: 'right', width: 130, cell: (row) => formatNumber(row.suggestedReorder, row.decimalPlaces) },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 150,
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${row.status === 'Below reorder' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'}`}>
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
        width: 250,
        cell: (row) => {
          const isSaving = savingKey === rowKey(row);
          return (
            <div className="flex justify-end gap-2">
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => void saveRow(row)} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>
              <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => openMovements(row)}>
                <History className="h-4 w-4" />
                Movements
              </button>
            </div>
          );
        },
      },
    ],
    [drafts, savingKey]
  );

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                  Inventory / Location planning
                </p>
                <h1 className="mt-3 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Location Reorder Levels
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Maintain reorder levels and bin locations using selected-period consumption and current stock on hand.
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(280px,1.15fr)_180px_auto] xl:items-end">
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={location} onChange={(value) => setLocation(value)} options={locationOptions} placeholder="Choose location" />
                  </div>
                  <div>
                    <span className={labelClass}>Category</span>
                    <SearchableSelect value={category} onChange={(value) => setCategory(value)} options={categoryOptions} placeholder="Choose category" />
                  </div>
                  <div>
                    <DateRangePicker value={dateRange} onChange={setDateRange} label="Usage date range" triggerClassName="h-11 rounded-lg px-3" />
                  </div>
                  <div>
                    <span className={labelClass}>Order by</span>
                    <SearchableSelect
                      value={orderBy}
                      onChange={(value) => setOrderBy(value === 'stockId' ? 'stockId' : 'usage')}
                      options={[
                        { value: 'usage', label: 'Highest usage' },
                        { value: 'stockId', label: 'Part number' },
                      ]}
                      placeholder="Choose sort"
                    />
                  </div>
                  <div className="flex gap-2 md:col-span-2 xl:col-span-1">
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
              <MetricCard label="Items listed" value={formatNumber(summary.lines, 0)} note="Items in selected category and location" icon={PackageSearch} loading={loading} />
              <MetricCard label="Below reorder" value={formatNumber(summary.belowReorder, 0)} note="Need purchase or transfer attention" icon={AlertTriangle} loading={loading} />
              <MetricCard label="Used in period" value={formatNumber(summary.withUsage, 0)} note={dateNote} icon={TrendingUp} loading={loading} />
              <MetricCard label="Zero reorder" value={formatNumber(summary.zeroReorder, 0)} note="Items without a stocking trigger" icon={MapPin} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Location reorder settings</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Edit reorder level and bin directly in the row, then save the changed line.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item or bin" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="reorder-level-location"
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(row) => rowKey(row)}
                  emptyMessage={loading ? 'Loading reorder levels...' : 'No items match these filters.'}
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
