import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  History,
  MapPin,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../components/common/Button';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface Summary {
  stockItems: number;
  stockHeldItems: number;
  locations: number;
  inventoryValue: number;
  availableQuantity: number;
  negativeBalances: number;
  belowReorder: number;
  needsAttention: number;
  outOfStock: number;
  pendingTransferReferences: number;
  pendingTransferQuantity: number;
  openPurchaseQuantity: number;
  openPurchaseLines: number;
  recentMovementLines: number;
  activeCountSheets: number;
}

interface AttentionItem {
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  quantity: number;
  reorderLevel: number;
  units: string;
  decimalPlaces: number;
  status: 'Negative' | 'Out' | 'Reorder';
}

interface RecentMovement {
  movementNumber: number;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  date: string;
  quantity: number;
  value: number;
  units: string;
  decimalPlaces: number;
  typeName: string;
  transactionNumber: number;
  reference: string;
  direction: 'In' | 'Out' | 'No change';
}

interface PendingTransfer {
  reference: number;
  fromLocation: string;
  fromLocationName: string;
  toLocation: string;
  toLocationName: string;
  shipDate: string;
  itemCount: number;
  outstandingQuantity: number;
}

interface TopValueItem {
  stockId: string;
  description: string;
  quantity: number;
  value: number;
  units: string;
  decimalPlaces: number;
}

interface LocationValue {
  location: string;
  locationName: string;
  quantity: number;
  value: number;
}

interface CountActivity {
  id: number;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  countedQuantity: number;
  expectedQuantity: number;
  variance: number;
  date: string;
}

interface AttentionBreakdown {
  name: string;
  value: number;
}

interface MovementTrend {
  date: string;
  inQuantity: number;
  outQuantity: number;
  netQuantity: number;
}

interface CategoryValue {
  category: string;
  quantity: number;
  value: number;
}

interface FilterOption {
  value: string;
  label: string;
}

interface DashboardFilterOptions {
  locations: FilterOption[];
  categories: FilterOption[];
}

interface DashboardFilters {
  location: string;
  category: string;
  dateFrom: string;
  dateTo: string;
}

interface DashboardPayload {
  currency: string;
  filters: DashboardFilters;
  filterOptions: DashboardFilterOptions;
  summary: Summary;
  attentionItems: AttentionItem[];
  recentMovements: RecentMovement[];
  pendingTransfers: PendingTransfer[];
  topValueItems: TopValueItem[];
  locationValue: LocationValue[];
  countActivity: CountActivity[];
  attentionBreakdown: AttentionBreakdown[];
  movementTrend: MovementTrend[];
  categoryValue: CategoryValue[];
}

interface DashboardResponse {
  success: boolean;
  message?: string;
  data?: DashboardPayload;
}

const emptySummary: Summary = {
  stockItems: 0,
  stockHeldItems: 0,
  locations: 0,
  inventoryValue: 0,
  availableQuantity: 0,
  negativeBalances: 0,
  belowReorder: 0,
  needsAttention: 0,
  outOfStock: 0,
  pendingTransferReferences: 0,
  pendingTransferQuantity: 0,
  openPurchaseQuantity: 0,
  openPurchaseLines: 0,
  recentMovementLines: 0,
  activeCountSheets: 0,
};

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number, currency = 'TZS'): string {
  return `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)}`;
}

function formatCompactMoney(value: number, currency = 'TZS'): string {
  return `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0)}`;
}

function formatShortDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}

function statusClass(status: AttentionItem['status']): string {
  if (status === 'Negative' || status === 'Out') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
}

function directionClass(direction: RecentMovement['direction']): string {
  if (direction === 'In') return 'text-emerald-700 dark:text-emerald-300';
  if (direction === 'Out') return 'text-rose-700 dark:text-rose-300';
  return 'text-akiva-text';
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('akiva:navigation'));
}

const filterInputClass = 'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm font-medium text-akiva-text shadow-sm outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30';

export function Inventory() {
  const defaultDateRange = useMemo(() => getDefaultDateRange(), []);
  const [locationFilter, setLocationFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const summary = payload?.summary ?? emptySummary;
  const currency = payload?.currency ?? 'TZS';
  const attentionItems = payload?.attentionItems ?? [];
  const recentMovements = payload?.recentMovements ?? [];
  const pendingTransfers = payload?.pendingTransfers ?? [];
  const topValueItems = payload?.topValueItems ?? [];
  const locationValue = payload?.locationValue ?? [];
  const countActivity = payload?.countActivity ?? [];
  const attentionBreakdown = payload?.attentionBreakdown ?? [];
  const movementTrend = payload?.movementTrend ?? [];
  const categoryValue = payload?.categoryValue ?? [];
  const locationOptions = payload?.filterOptions?.locations ?? [];
  const categoryOptions = payload?.filterOptions?.categories ?? [];
  const locationFilterOptions = useMemo(() => [{ value: '', label: 'All locations' }, ...locationOptions], [locationOptions]);
  const categoryFilterOptions = useMemo(() => [{ value: '', label: 'All categories' }, ...categoryOptions], [categoryOptions]);

  const loadDashboard = useCallback(async (showSuccess = false) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('dateFrom', dateRange.from);
      params.set('dateTo', dateRange.to);
      if (locationFilter) params.set('location', locationFilter);
      if (categoryFilter) params.set('category', categoryFilter);

      const response = await apiFetch(buildApiUrl(`/api/inventory/dashboard?${params.toString()}`));
      const json = (await response.json()) as DashboardResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Inventory dashboard could not be loaded.');
      }

      setPayload(json.data);
      if (showSuccess) {
        setMessage('Inventory dashboard refreshed.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory dashboard could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, dateRange.from, dateRange.to, locationFilter]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const clearFilters = () => {
    setLocationFilter('');
    setCategoryFilter('');
    setDateRange(getDefaultDateRange());
  };

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const attentionColumns = useMemo<AdvancedTableColumn<AttentionItem>[]>(
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
        minWidth: 220,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      {
        id: 'quantity',
        header: 'On hand',
        accessor: (row) => row.quantity,
        align: 'right',
        width: 140,
        cell: (row) => `${formatNumber(row.quantity, row.decimalPlaces || 2)} ${row.units}`,
      },
      {
        id: 'reorder',
        header: 'Reorder level',
        accessor: (row) => row.reorderLevel,
        align: 'right',
        width: 150,
        cell: (row) => formatNumber(row.reorderLevel, row.decimalPlaces || 2),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 130,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 120,
        cell: (row) => (
          <button type="button" className="inline-flex h-9 items-center rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => navigate(`/inventory/inquiries-and-reports/stockstatus?item=${encodeURIComponent(row.stockId)}`)}>
            Review
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
                    <Boxes className="h-4 w-4 text-akiva-accent-text" />
                    Inventory
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Operational dashboard
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                  Inventory Dashboard
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  See inventory value, shortage risk, pending receiving, stock movement activity and count variance from current inventory records.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadDashboard(true)} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title={filtersOpen ? 'Hide filters' : 'Show filters'} onClick={() => setFiltersOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filtersOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" variant="secondary" onClick={() => navigate('/inventory/inquiries-and-reports/stockstatus')}>
                  <PackageSearch className="mr-2 h-4 w-4" />
                  Stock status
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filtersOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="grid flex-1 gap-3 md:grid-cols-4">
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Location</span>
                      <SearchableSelect
                        value={locationFilter}
                        onChange={setLocationFilter}
                        options={locationFilterOptions}
                        inputClassName={filterInputClass}
                        placeholder="Type location"
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Category</span>
                      <SearchableSelect
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        options={categoryFilterOptions}
                        inputClassName={filterInputClass}
                        placeholder="Type category"
                      />
                    </label>
                    <div className="min-w-0 md:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Activity date range</span>
                      <DateRangePicker
                        value={dateRange}
                        onChange={setDateRange}
                        label="Activity period"
                        triggerClassName="h-11 rounded-lg px-3"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Inventory value" value={formatMoney(summary.inventoryValue, currency)} note={`${formatNumber(summary.stockHeldItems, 0)} tracked stock items`} icon={PackageCheck} />
              <MetricCard label="Needs attention" value={formatNumber(summary.needsAttention, 0)} note={`${formatNumber(summary.negativeBalances, 0)} negative balances`} icon={AlertTriangle} tone="danger" onClick={() => navigate('/inventory/inquiries-and-reports/stockstatus')} />
              <MetricCard label="Pending transfers" value={formatNumber(summary.pendingTransferReferences, 0)} note={`${formatNumber(summary.pendingTransferQuantity)} units awaiting receipt`} icon={Truck} onClick={() => navigate('/inventory/transactions/stockloctransferreceive')} />
              <MetricCard label="Open purchase supply" value={formatNumber(summary.openPurchaseLines, 0)} note={`${formatNumber(summary.openPurchaseQuantity)} units still on order`} icon={ArrowDownLeft} onClick={() => navigate('/inventory/transactions/po-selectospurchorder')} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr_.85fr]">
              <ChartPanel title="Inventory value by category" note="Where most of the stock value is held." icon={PackageCheck}>
                <CategoryValueChart rows={categoryValue} currency={currency} loading={loading} />
              </ChartPanel>

              <ChartPanel title="Stock movement trend" note="Quantities moving in and out during the selected period." icon={History}>
                <MovementTrendChart rows={movementTrend} loading={loading} />
              </ChartPanel>

              <ChartPanel title="Attention split" note="The type of issue behind the stock attention count." icon={AlertTriangle}>
                <AttentionBreakdownChart rows={attentionBreakdown} loading={loading} />
              </ChartPanel>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
              <div className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Attention queue</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Locations where balances are negative, out, or at reorder level.</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/inventory/inquiries-and-reports/stockstatus')}>
                    Review stock
                  </Button>
                </div>
                <div className="p-4">
                  <AdvancedTable
                    tableId="inventory-dashboard-attention"
                    columns={attentionColumns}
                    rows={attentionItems}
                    rowKey={(row) => `${row.stockId}-${row.location}`}
                    emptyMessage={loading ? 'Loading attention queue...' : 'No reorder or negative balances found.'}
                    loading={loading}
                    initialPageSize={10}
                    initialScroll="left"
                    showSearch={false}
                    showExports={false}
                  />
                </div>
              </div>

              <Panel title="Most useful next actions" icon={FileSearch}>
                <ActionRow label="Receive pending transfers" value={`${formatNumber(summary.pendingTransferReferences, 0)} transfers`} icon={Truck} onClick={() => navigate('/inventory/transactions/stockloctransferreceive')} />
                <ActionRow label="Check stock availability" value={`${formatNumber(summary.locations, 0)} locations`} icon={PackageSearch} onClick={() => navigate('/inventory/inquiries-and-reports/stockstatus')} />
                <ActionRow label="Review recent movements" value={`${formatNumber(summary.recentMovementLines, 0)} lines in period`} icon={History} onClick={() => navigate('/inventory/inquiries-and-reports/stockmovements')} />
                <ActionRow label="Continue stock counts" value={`${formatNumber(summary.activeCountSheets, 0)} active sheets`} icon={ClipboardCheck} onClick={() => navigate('/inventory/transactions/stockcounts')} />
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <Panel title="Recent movements" icon={History}>
                {recentMovements.length === 0 ? (
                  <EmptyState message={loading ? 'Loading movements...' : 'No recent movements found.'} />
                ) : recentMovements.map((movement) => (
                  <button key={movement.movementNumber} type="button" onClick={() => navigate(`/inventory/inquiries-and-reports/stockmovements?item=${encodeURIComponent(movement.stockId)}`)} className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-akiva-text">{movement.stockId} - {movement.description}</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{movement.typeName} #{movement.transactionNumber} · {movement.locationName}</p>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold ${directionClass(movement.direction)}`}>
                        {movement.quantity > 0 ? '+' : ''}{formatNumber(movement.quantity, movement.decimalPlaces || 2)}
                      </span>
                    </div>
                  </button>
                ))}
              </Panel>

              <Panel title="Highest value stock" icon={PackageCheck}>
                {topValueItems.length === 0 ? (
                  <EmptyState message={loading ? 'Loading stock value...' : 'No stock value found.'} />
                ) : topValueItems.map((item) => (
                  <button key={item.stockId} type="button" onClick={() => navigate(`/inventory/inquiries-and-reports/stockstatus?item=${encodeURIComponent(item.stockId)}`)} className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-akiva-text">{item.stockId}</p>
                        <p className="mt-1 truncate text-xs text-akiva-text-muted">{item.description}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-akiva-text">{formatMoney(item.value, currency)}</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{formatNumber(item.quantity, item.decimalPlaces || 2)} {item.units}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </Panel>

              <Panel title="Location value" icon={MapPin}>
                {locationValue.length === 0 ? (
                  <EmptyState message={loading ? 'Loading locations...' : 'No location balances found.'} />
                ) : locationValue.map((location) => (
                  <div key={location.location} className="rounded-lg border border-akiva-border bg-akiva-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-akiva-text">{location.locationName}</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{location.location} · {formatNumber(location.quantity)} units</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-akiva-text">{formatMoney(location.value, currency)}</p>
                    </div>
                  </div>
                ))}
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Panel title="Transfers awaiting receipt" icon={Truck}>
                {pendingTransfers.length === 0 ? (
                  <EmptyState message={loading ? 'Loading transfers...' : 'No transfers awaiting receipt.'} />
                ) : pendingTransfers.map((transfer) => (
                  <button key={transfer.reference} type="button" onClick={() => navigate('/inventory/transactions/stockloctransferreceive')} className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-akiva-text">Transfer #{transfer.reference}</p>
                        <p className="mt-1 truncate text-xs text-akiva-text-muted">{transfer.fromLocationName} to {transfer.toLocationName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-akiva-text">{formatNumber(transfer.outstandingQuantity)} units</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{transfer.itemCount} items</p>
                      </div>
                    </div>
                  </button>
                ))}
              </Panel>

              <Panel title="Recent stock count activity" icon={ClipboardCheck}>
                {countActivity.length === 0 ? (
                  <EmptyState message={loading ? 'Loading counts...' : 'No recent count entries found.'} />
                ) : countActivity.map((entry) => (
                  <button key={entry.id} type="button" onClick={() => navigate('/inventory/transactions/stockcounts')} className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-akiva-text">{entry.stockId} - {entry.description}</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{entry.locationName} · {entry.date}</p>
                      </div>
                      <span className={entry.variance === 0 ? 'shrink-0 text-sm font-semibold text-akiva-text' : entry.variance > 0 ? 'shrink-0 text-sm font-semibold text-emerald-700 dark:text-emerald-300' : 'shrink-0 text-sm font-semibold text-rose-700 dark:text-rose-300'}>
                        {entry.variance > 0 ? '+' : ''}{formatNumber(entry.variance)}
                      </span>
                    </div>
                  </button>
                ))}
              </Panel>
            </section>
          </div>
        </section>
      </div>

      {error ? <ToastNotification type="error" message={error} onClose={() => setError('')} /> : null}
      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: 'default' | 'danger';
  onClick?: () => void;
}) {
  const iconTone = tone === 'danger' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200' : 'bg-akiva-accent-soft text-akiva-accent-text';

  const className = `rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-left shadow-sm transition ${
    onClick ? 'hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70' : ''
  }`;
  const content = (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-akiva-text">{value}</p>
          <p className="mt-3 text-sm leading-5 text-akiva-text-muted">{note}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
  );

  if (!onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

const attentionColors = ['#e11d48', '#f59e0b', '#2563eb'];

function ChartPanel({
  title,
  note,
  icon: Icon,
  children,
}: {
  title: string;
  note: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{note}</p>
        </div>
      </div>
      <div className="mt-4 h-[260px] min-w-0">{children}</div>
    </section>
  );
}

function ChartEmptyState({ loading, message }: { loading: boolean; message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 text-center text-sm text-akiva-text-muted">
      {loading ? 'Loading chart...' : message}
    </div>
  );
}

function CategoryValueChart({ rows, currency, loading }: { rows: CategoryValue[]; currency: string; loading: boolean }) {
  if (rows.length === 0) {
    return <ChartEmptyState loading={loading} message="No category value found." />;
  }

  const data = rows.map((row) => ({
    ...row,
    categoryLabel: row.category.length > 18 ? `${row.category.slice(0, 18)}...` : row.category,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148, 163, 184, 0.25)" />
        <XAxis type="number" tickFormatter={(value) => formatCompactMoney(Number(value), currency)} tick={{ fill: '#8b6f7d', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="categoryLabel" width={108} tick={{ fill: '#3f2b36', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(225, 29, 112, 0.06)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const row = payload[0].payload as CategoryValue;
          return (
            <ChartTooltip>
              <p className="font-semibold text-akiva-text">{row.category}</p>
              <p className="mt-1 text-akiva-text-muted">{formatMoney(row.value, currency)}</p>
              <p className="mt-1 text-akiva-text-muted">{formatNumber(row.quantity)} units</p>
            </ChartTooltip>
          );
        }} />
        <Bar dataKey="value" fill="#e11d70" radius={[0, 8, 8, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MovementTrendChart({ rows, loading }: { rows: MovementTrend[]; loading: boolean }) {
  if (rows.length === 0) {
    return <ChartEmptyState loading={loading} message="No recent movement activity found." />;
  }

  const data = rows.map((row) => ({ ...row, dateLabel: formatShortDate(row.date) }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.25)" />
        <XAxis dataKey="dateLabel" tick={{ fill: '#8b6f7d', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={14} />
        <YAxis tickFormatter={(value) => formatNumber(Number(value), 0)} tick={{ fill: '#8b6f7d', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const incoming = Number(payload.find((item) => item.dataKey === 'inQuantity')?.value ?? 0);
          const outgoing = Number(payload.find((item) => item.dataKey === 'outQuantity')?.value ?? 0);
          return (
            <ChartTooltip>
              <p className="font-semibold text-akiva-text">{label}</p>
              <p className="mt-1 text-emerald-700">In: {formatNumber(incoming)}</p>
              <p className="mt-1 text-rose-700">Out: {formatNumber(outgoing)}</p>
            </ChartTooltip>
          );
        }} />
        <Bar dataKey="inQuantity" name="In" fill="#059669" radius={[6, 6, 0, 0]} barSize={12} />
        <Bar dataKey="outQuantity" name="Out" fill="#e11d48" radius={[6, 6, 0, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function AttentionBreakdownChart({ rows, loading }: { rows: AttentionBreakdown[]; loading: boolean }) {
  if (rows.length === 0) {
    return <ChartEmptyState loading={loading} message="No stock attention issues found." />;
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="grid h-full gap-3 sm:grid-cols-[1fr_1.1fr] xl:grid-cols-1 2xl:grid-cols-[1fr_1.1fr]">
      <div className="relative min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>
              {rows.map((entry, index) => (
                <Cell key={entry.name} fill={attentionColors[index % attentionColors.length]} />
              ))}
            </Pie>
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as AttentionBreakdown;
              return (
                <ChartTooltip>
                  <p className="font-semibold text-akiva-text">{row.name}</p>
                  <p className="mt-1 text-akiva-text-muted">{formatNumber(row.value, 0)} locations</p>
                </ChartTooltip>
              );
            }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold text-akiva-text">{formatNumber(total, 0)}</p>
          <p className="text-xs text-akiva-text-muted">locations</p>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2">
        {rows.map((row, index) => (
          <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: attentionColors[index % attentionColors.length] }} />
              <span className="truncate text-xs font-semibold text-akiva-text">{row.name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-akiva-text-muted">{formatNumber(row.value, 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-xs shadow-xl">
      {children}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ActionRow({ label, value, icon: Icon, onClick }: { label: string; value: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-akiva-accent-soft text-akiva-accent-text">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-akiva-text">{label}</span>
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">{value}</span>
        </span>
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-akiva-text-muted" />
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-6 text-center text-sm text-akiva-text-muted">
      {message}
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
