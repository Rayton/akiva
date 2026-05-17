import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
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
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
  searchText?: string;
}

interface StockUsageItem {
  stockId: string;
  description: string;
  longDescription: string;
  units: string;
  mbFlag: string;
  decimalPlaces: number;
  serialised: boolean;
  controlled: boolean;
  category: string;
  categoryName: string;
  stockHeld: boolean;
}

interface UsageRow {
  period: number;
  periodLabel: string;
  periodEnd: string;
  quantityUsed: number;
  usageValue: number;
  movementLines: number;
  lastMovementDate: string;
}

interface Summary {
  periods: number;
  activePeriods: number;
  movementLines: number;
  totalUsage: number;
  averageUsage: number;
  usageValue: number;
  averageValue: number;
  highestPeriod: UsageRow | null;
  lastUsagePeriod: UsageRow | null;
}

interface WorkbenchPayload {
  items: Option[];
  locations: Option[];
  selectedItem: StockUsageItem | null;
  usageRows: UsageRow[];
  summary: Summary;
  currency: string;
  usageTypes: Option[];
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

interface ItemLookupResponse {
  success: boolean;
  message?: string;
  data?: Option[];
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

function mergeOptions(...optionGroups: Option[][]): Option[] {
  const options = new Map<string, Option>();
  optionGroups.flat().forEach((option) => {
    if (!options.has(option.value)) {
      options.set(option.value, option);
    }
  });
  return Array.from(options.values());
}

function initialItemFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get('item') || params.get('StockID') || params.get('stockid') || 'All').toUpperCase();
}

function initialLocationFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get('location') || params.get('StockLocation') || params.get('stockLocation') || 'All').toUpperCase();
}

export function StockUsage() {
  const requestSequence = useRef(0);
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemLookupOptions, setItemLookupOptions] = useState<Option[]>([]);
  const [itemFilter, setItemFilter] = useState(initialItemFromUrl);
  const [locationFilter, setLocationFilter] = useState(initialLocationFromUrl);
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [detailRow, setDetailRow] = useState<UsageRow | null>(null);

  const selectedItem = payload?.selectedItem ?? null;
  const usageRows = payload?.usageRows ?? [];
  const summary = payload?.summary ?? {
    periods: 0,
    activePeriods: 0,
    movementLines: 0,
    totalUsage: 0,
    averageUsage: 0,
    usageValue: 0,
    averageValue: 0,
    highestPeriod: null,
    lastUsagePeriod: null,
  };
  const currency = payload?.currency ?? 'TZS';
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const itemOptions = useMemo(
    () => mergeOptions(payload?.items ?? [], itemLookupOptions, selectedItem ? [{ value: selectedItem.stockId, label: `${selectedItem.stockId} - ${selectedItem.description}` }] : []),
    [payload?.items, itemLookupOptions, selectedItem]
  );

  const loadWorkbench = useCallback(async () => {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (itemFilter !== 'All') params.set('item', itemFilter);
      if (locationFilter !== 'All') params.set('location', locationFilter);
      params.set('dateFrom', dateRange.from);
      params.set('dateTo', dateRange.to);

      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-usage/workbench?${params.toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock usage could not be loaded.');
      }

      if (requestId !== requestSequence.current) {
        return;
      }

      setPayload(json.data);
      if (itemFilter === 'All' && json.data.selectedItem?.stockId) {
        setItemFilter(json.data.selectedItem.stockId);
      }
    } catch (caught) {
      if (requestId !== requestSequence.current) {
        return;
      }
      setError(caught instanceof Error ? caught.message : 'Stock usage could not be loaded.');
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, [dateRange.from, dateRange.to, itemFilter, locationFilter]);

  const loadItemOptions = async (query = '') => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (query.trim()) params.set('q', query.trim());

      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-usage-items?${params.toString()}`));
      const json = (await response.json()) as ItemLookupResponse;
      if (!response.ok || !json.success || !Array.isArray(json.data)) {
        throw new Error(json.message || 'Items could not be loaded.');
      }

      setItemLookupOptions(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Items could not be loaded.');
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, [loadWorkbench]);

  useEffect(() => {
    setTableSearch('');
  }, [itemFilter, locationFilter, dateRange.from, dateRange.to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItemOptions(itemSearch);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [itemSearch]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const clearFilters = () => {
    setLocationFilter('All');
    setDateRange(getDefaultDateRange());
    setTableSearch('');
  };

  const filteredRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) return usageRows;
    return usageRows.filter((row) =>
      [row.periodLabel, row.periodEnd, row.lastMovementDate, row.quantityUsed, row.usageValue]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }, [tableSearch, usageRows]);

  const chartRows = useMemo(
    () => [...usageRows]
      .reverse()
      .map((row) => ({
        period: row.periodLabel,
        quantity: row.quantityUsed,
        value: row.usageValue,
      })),
    [usageRows]
  );

  const openMovements = (row: UsageRow) => {
    const params = new URLSearchParams();
    if (selectedItem?.stockId) params.set('item', selectedItem.stockId);
    if (locationFilter !== 'All') params.set('location', locationFilter);
    params.set('from', row.periodEnd.slice(0, 8) + '01');
    params.set('to', row.periodEnd);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<UsageRow>[]>(
    () => [
      {
        id: 'periodLabel',
        header: 'Period',
        accessor: (row) => row.periodLabel,
        minWidth: 180,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.periodLabel}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">Period {row.period}</div>
          </div>
        ),
      },
      { id: 'periodEnd', header: 'Period end', accessor: (row) => row.periodEnd, width: 150 },
      {
        id: 'quantityUsed',
        header: 'Quantity used',
        accessor: (row) => row.quantityUsed,
        align: 'right',
        width: 170,
        cell: (row) => (
          <span className="font-semibold text-akiva-text">
            {formatNumber(row.quantityUsed, selectedItem?.decimalPlaces || 2)} {selectedItem?.units || ''}
          </span>
        ),
      },
      {
        id: 'usageValue',
        header: 'Usage value',
        accessor: (row) => row.usageValue,
        align: 'right',
        width: 160,
        cell: (row) => formatMoney(row.usageValue, currency),
      },
      {
        id: 'movementLines',
        header: 'Movement lines',
        accessor: (row) => row.movementLines,
        align: 'right',
        width: 150,
      },
      {
        id: 'lastMovementDate',
        header: 'Last movement',
        accessor: (row) => row.lastMovementDate || '',
        width: 150,
        cell: (row) => row.lastMovementDate || '-',
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.period,
        sortable: false,
        filterable: false,
        align: 'right',
        sticky: 'right',
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
    [currency, locationFilter, selectedItem]
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
                    Consumption review
                  </span>
                </div>
                <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                  Stock Usage
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review how much of an item was consumed by period, location, and value so reorder decisions are based on actual movement history.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter stock usage" title="Filter stock usage" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <div className="md:col-span-2">
                    <span className={labelClass}>Item</span>
                    <div className="relative">
                      <SearchableSelect value={itemFilter} onChange={setItemFilter} onSearchChange={setItemSearch} options={itemOptions} inputClassName={`${inputClass} ${loading ? 'pr-10' : ''}`} placeholder="Search item code or name" disabled={loading} />
                      {loading ? <Loader2 className="pointer-events-none absolute right-10 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-akiva-accent-text" /> : null}
                    </div>
                  </div>
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={locationFilter} onChange={setLocationFilter} options={locationOptions} inputClassName={inputClass} placeholder="Location" />
                  </div>
                  <div className="md:col-span-2">
                    <span className={labelClass}>Usage dates</span>
                    <DateRangePicker value={dateRange} onChange={setDateRange} label="Start and end date" triggerClassName="h-11 rounded-lg px-3" />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {selectedItem ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Selected item</p>
                    <h2 className="mt-2 text-lg font-semibold text-akiva-text">{selectedItem.stockId} - {selectedItem.description}</h2>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-akiva-text-muted">
                      {selectedItem.longDescription || selectedItem.categoryName || 'No additional item description recorded.'}
                    </p>
                    {!selectedItem.stockHeld ? (
                      <p className="mt-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        This item is not normally held in stock, so usage may be empty.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">{selectedItem.units || 'No unit'}</span>
                    <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">{selectedItem.categoryName || selectedItem.category || 'No category'}</span>
                    {selectedItem.serialised ? <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">Serialised</span> : null}
                    {selectedItem.controlled ? <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">Batch controlled</span> : null}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Total used" value={`${formatNumber(summary.totalUsage, selectedItem?.decimalPlaces || 2)} ${selectedItem?.units || ''}`} note={`${formatNumber(summary.movementLines, 0)} stock movement lines`} icon={TrendingDown} loading={loading} />
              <MetricCard label="Average per period" value={`${formatNumber(summary.averageUsage, selectedItem?.decimalPlaces || 2)} ${selectedItem?.units || ''}`} note={`Across ${formatNumber(summary.periods, 0)} selected periods`} icon={BarChart3} loading={loading} />
              <MetricCard label="Usage value" value={formatMoney(summary.usageValue, currency)} note={`${formatMoney(summary.averageValue, currency)} average per period`} icon={History} loading={loading} />
              <MetricCard label="Highest usage" value={summary.highestPeriod ? `${formatNumber(summary.highestPeriod.quantityUsed, selectedItem?.decimalPlaces || 2)} ${selectedItem?.units || ''}` : '0'} note={summary.highestPeriod ? summary.highestPeriod.periodLabel : 'No usage in range'} icon={AlertTriangle} loading={loading} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Usage trend</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Quantity consumed by accounting period.</p>
                  </div>
                  <span className="inline-flex w-fit rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">
                    {formatNumber(summary.activePeriods, 0)} active periods
                  </span>
                </div>
                <div className="mt-4 h-72">
                  {loading ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-akiva-accent-text" />
                    </div>
                  ) : chartRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartRows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eadbe3" />
                        <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#856776' }} interval={0} angle={-28} textAnchor="end" height={56} />
                        <YAxis tick={{ fontSize: 11, fill: '#856776' }} />
                        <Tooltip
                          cursor={{ fill: 'rgba(219, 39, 119, 0.08)' }}
                          formatter={(value) => [formatNumber(Number(value), selectedItem?.decimalPlaces || 2), 'Quantity used']}
                          contentStyle={{ borderRadius: 12, borderColor: '#eadbe3', color: '#211019' }}
                        />
                        <Bar dataKey="quantity" fill="#db2777" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-akiva-border text-sm text-akiva-text-muted">
                      No usage found for the selected item and dates.
                    </div>
                  )}
                </div>
              </div>

              <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Usage by period</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Usage is calculated from stock issues, sales, transfers, and adjustments that reduce stock.</p>
                  </div>
                  <div className="relative w-full md:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                    <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search period or movement date" />
                  </div>
                </div>
                <div className="p-4">
                  <AdvancedTable
                    tableId="stock-usage"
                    columns={columns}
                    rows={filteredRows}
                    rowKey={(row) => String(row.period)}
                    emptyMessage={loading ? 'Loading stock usage...' : 'No stock usage matches these filters.'}
                    loading={loading}
                    initialPageSize={25}
                    initialScroll="left"
                    showExports={false}
                  />
                </div>
              </section>
            </section>
          </div>
        </section>
      </div>

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `${detailRow.periodLabel} Usage` : 'Usage Detail'}
        size="md"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-akiva-text">{detailRow.periodLabel}</div>
                  <div className="mt-1 text-sm text-akiva-text-muted">Period ends {detailRow.periodEnd}</div>
                </div>
                <span className="inline-flex w-fit rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">
                  Period {detailRow.period}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="Quantity used" value={`${formatNumber(detailRow.quantityUsed, selectedItem?.decimalPlaces || 2)} ${selectedItem?.units || ''}`} />
                <InfoTile label="Usage value" value={formatMoney(detailRow.usageValue, currency)} />
                <InfoTile label="Movement lines" value={formatNumber(detailRow.movementLines, 0)} />
                <InfoTile label="Last movement" value={detailRow.lastMovementDate || '-'} />
              </div>
              <div className="mt-4">
                <Button type="button" variant="secondary" onClick={() => openMovements(detailRow)}>
                  Open stock movements
                </Button>
              </div>
            </section>
          </div>
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
            {loading ? (
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-akiva-accent-text" />
            ) : (
              <p className="truncate text-2xl font-semibold text-akiva-text">{value}</p>
            )}
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

function ToastNotification({
  type,
  message,
  onClose,
}: {
  type: 'success' | 'error';
  message: string;
  onClose: () => void;
}) {
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
