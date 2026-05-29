import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Boxes,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Factory,
  FileSearch,
  Gauge,
  PackageSearch,
  RefreshCw,
  Settings,
  SlidersHorizontal,
  Timer,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
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
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { buildApiUrl } from '../lib/network/apiBase';
import { apiFetch } from '../lib/network/apiClient';

type WorkOrderStatus = 'Overdue' | 'Due this week' | 'In progress' | 'Waiting release' | 'Completed';

interface ManufacturingSummary {
  scheduledWorkOrders: number;
  openWorkOrders: number;
  overdueWorkOrders: number;
  dueThisWeek: number;
  completedThisPeriod: number;
  unitsRequired: number;
  unitsReceived: number;
  remainingUnits: number;
  completionRate: number;
  wipValue: number;
  componentShortages: number;
  activeBomParents: number;
  activeWorkCentres: number;
  mrpDemandQuantity: number;
  manufacturingDays: number;
}

interface FilterOption {
  value: string;
  label: string;
}

interface ManufacturingFilters {
  location: string;
  dateFrom: string;
  dateTo: string;
}

interface ManufacturingFilterOptions {
  locations: FilterOption[];
}

interface WorkOrderRow {
  workOrder: number;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  startDate: string;
  requiredBy: string;
  requiredQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  progressPercent: number;
  standardCost: number;
  wipValue: number;
  units: string;
  decimalPlaces: number;
  status: WorkOrderStatus;
  reference: string;
}

interface ComponentShortage {
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  requiredQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
  workOrderCount: number;
  parentItems: string;
  units: string;
  decimalPlaces: number;
}

interface WorkCentreLoad {
  code: string;
  description: string;
  location: string;
  locationName: string;
  capacity: number;
  overheadPerHour: number;
  setupHours: number;
  openOrders: number;
  remainingQuantity: number;
  parentItems: number;
  componentLines: number;
}

interface ProductionTrend {
  date: string;
  workOrders: number;
  requiredQuantity: number;
  receivedQuantity: number;
}

interface NamedValue {
  name: string;
  value: number;
}

interface MrpDemandTrend {
  date: string;
  demandQuantity: number;
  requirementQuantity: number;
}

interface BomCostRollup {
  parent: string;
  description: string;
  componentCount: number;
  componentQuantity: number;
  estimatedCost: number;
  locations: string;
}

interface ManufacturingDashboardPayload {
  currency: string;
  asOf: string;
  filters: ManufacturingFilters;
  filterOptions: ManufacturingFilterOptions;
  summary: ManufacturingSummary;
  workOrderQueue: WorkOrderRow[];
  componentShortages: ComponentShortage[];
  workCentreLoad: WorkCentreLoad[];
  productionTrend: ProductionTrend[];
  statusBreakdown: NamedValue[];
  mrpDemandTrend: MrpDemandTrend[];
  bomCostRollup: BomCostRollup[];
  calendarAvailability: NamedValue[];
}

interface ManufacturingDashboardResponse {
  success: boolean;
  message?: string;
  data?: ManufacturingDashboardPayload;
}

const emptySummary: ManufacturingSummary = {
  scheduledWorkOrders: 0,
  openWorkOrders: 0,
  overdueWorkOrders: 0,
  dueThisWeek: 0,
  completedThisPeriod: 0,
  unitsRequired: 0,
  unitsReceived: 0,
  remainingUnits: 0,
  completionRate: 0,
  wipValue: 0,
  componentShortages: 0,
  activeBomParents: 0,
  activeWorkCentres: 0,
  mrpDemandQuantity: 0,
  manufacturingDays: 0,
};

const filterInputClass = 'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm font-medium text-akiva-text shadow-sm outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30';
const chartAxisTick = { fill: 'var(--akiva-chart-muted)', fontSize: 12, fontWeight: 600 };
const statusColors = ['#dc2626', '#d97706', '#2563eb', '#6d28d9', '#059669'];
const calendarColors = ['#059669', '#d97706'];

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}

function formatMoney(value: number, currency = 'TZS'): string {
  return `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)}`;
}

function formatCompactMoney(value: number, currency = 'TZS'): string {
  return `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0)}`;
}

function formatShortDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}

function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function statusClass(status: WorkOrderStatus): string {
  if (status === 'Overdue') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
  if (status === 'Due this week') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'In progress') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200';
  return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200';
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('akiva:navigation'));
}

export function ManufacturingDashboard() {
  const defaultDateRange = useMemo(() => getDefaultDateRange(), []);
  const [locationFilter, setLocationFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRange);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [payload, setPayload] = useState<ManufacturingDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const summary = payload?.summary ?? emptySummary;
  const currency = payload?.currency ?? 'TZS';
  const workOrderQueue = payload?.workOrderQueue ?? [];
  const componentShortages = payload?.componentShortages ?? [];
  const workCentreLoad = payload?.workCentreLoad ?? [];
  const productionTrend = payload?.productionTrend ?? [];
  const statusBreakdown = payload?.statusBreakdown ?? [];
  const mrpDemandTrend = payload?.mrpDemandTrend ?? [];
  const bomCostRollup = payload?.bomCostRollup ?? [];
  const calendarAvailability = payload?.calendarAvailability ?? [];
  const updatedLabel = formatDateTime(payload?.asOf);
  const locationOptions = useMemo(
    () => [{ value: '', label: 'All factory locations' }, ...(payload?.filterOptions.locations ?? [])],
    [payload?.filterOptions.locations]
  );

  const loadDashboard = useCallback(async (showSuccess = false) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('dateFrom', dateRange.from);
      params.set('dateTo', dateRange.to);
      if (locationFilter) params.set('location', locationFilter);

      const response = await apiFetch(buildApiUrl(`/api/manufacturing/dashboard?${params.toString()}`));
      const json = (await response.json()) as ManufacturingDashboardResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Manufacturing dashboard could not be loaded.');
      }

      setPayload(json.data);
      if (showSuccess) {
        setMessage('Manufacturing dashboard refreshed.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Manufacturing dashboard could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, locationFilter]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const clearFilters = () => {
    setLocationFilter('');
    setDateRange(getDefaultDateRange());
  };

  const workOrderColumns = useMemo<AdvancedTableColumn<WorkOrderRow>[]>(
    () => [
      {
        id: 'workOrder',
        header: 'Work order',
        accessor: (row) => row.workOrder,
        width: 130,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">WO {row.workOrder}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.reference || 'No reference'}</div>
          </div>
        ),
      },
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
        header: 'Factory',
        accessor: (row) => `${row.locationName} ${row.location}`,
        minWidth: 190,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      {
        id: 'requiredBy',
        header: 'Required',
        accessor: (row) => row.requiredBy,
        width: 120,
        cell: (row) => formatShortDate(row.requiredBy),
      },
      {
        id: 'remaining',
        header: 'Remaining',
        accessor: (row) => row.remainingQuantity,
        align: 'right',
        width: 140,
        cell: (row) => `${formatNumber(row.remainingQuantity, row.decimalPlaces || 2)} ${row.units}`,
      },
      {
        id: 'progress',
        header: 'Progress',
        accessor: (row) => row.progressPercent,
        align: 'right',
        width: 130,
        cell: (row) => `${formatNumber(row.progressPercent, 1)}%`,
      },
      {
        id: 'wip',
        header: 'WIP value',
        accessor: (row) => row.wipValue,
        align: 'right',
        width: 150,
        cell: (row) => formatMoney(row.wipValue, currency),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        sticky: 'right',
        width: 150,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>,
      },
    ],
    [currency]
  );

  const shortageColumns = useMemo<AdvancedTableColumn<ComponentShortage>[]>(
    () => [
      {
        id: 'component',
        header: 'Component',
        accessor: (row) => `${row.stockId} ${row.description}`,
        minWidth: 240,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.description}</div>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Factory',
        accessor: (row) => `${row.locationName} ${row.location}`,
        minWidth: 180,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      {
        id: 'required',
        header: 'Required',
        accessor: (row) => row.requiredQuantity,
        align: 'right',
        width: 130,
        cell: (row) => formatNumber(row.requiredQuantity, row.decimalPlaces || 2),
      },
      {
        id: 'available',
        header: 'Available',
        accessor: (row) => row.availableQuantity,
        align: 'right',
        width: 130,
        cell: (row) => formatNumber(row.availableQuantity, row.decimalPlaces || 2),
      },
      {
        id: 'shortage',
        header: 'Shortage',
        accessor: (row) => row.shortageQuantity,
        align: 'right',
        width: 130,
        cell: (row) => <span className="font-semibold text-rose-700 dark:text-rose-200">{formatNumber(row.shortageQuantity, row.decimalPlaces || 2)}</span>,
      },
      {
        id: 'parents',
        header: 'Parents',
        accessor: (row) => row.parentItems,
        minWidth: 220,
      },
      {
        id: 'orders',
        header: 'WOs',
        accessor: (row) => row.workOrderCount,
        align: 'right',
        width: 90,
      },
    ],
    []
  );

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <Factory className="h-4 w-4 text-akiva-accent-text" />
                    Manufacturing
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <Gauge className="h-4 w-4 text-akiva-accent-text" />
                    Operational dashboard
                  </span>
                  {updatedLabel ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                      <Timer className="h-4 w-4 text-akiva-accent-text" />
                      Updated {updatedLabel}
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-4 akiva-page-title">Manufacturing Dashboard</h1>
                <p className="akiva-page-subtitle">
                  Track work order load, factory capacity, component shortages, MRP demand, and bill-of-material exposure from current manufacturing records.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadDashboard(true)} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title={filtersOpen ? 'Hide filters' : 'Show filters'} onClick={() => setFiltersOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filtersOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" variant="secondary" onClick={() => navigate('/configuration/manufacturing-setup/mrp-calendar')}>
                  <Settings className="mr-2 h-4 w-4" />
                  MRP setup
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filtersOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="grid flex-1 gap-3 md:grid-cols-3">
                    <label className="block min-w-0">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Factory location</span>
                      <SearchableSelect
                        value={locationFilter}
                        onChange={setLocationFilter}
                        options={locationOptions}
                        inputClassName={filterInputClass}
                        placeholder="Type factory"
                      />
                    </label>
                    <div className="min-w-0 md:col-span-2">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Required-by date range</span>
                      <DateRangePicker
                        value={dateRange}
                        onChange={setDateRange}
                        label="Required period"
                        triggerClassName="h-11 rounded-lg px-3"
                      />
                    </div>
                  </div>
                  <Button type="button" variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Open work orders" value={formatNumber(summary.openWorkOrders, 0)} note={`${formatNumber(summary.remainingUnits)} units remaining`} icon={ClipboardList} onClick={() => setFiltersOpen(true)} />
              <MetricCard label="Due this week" value={formatNumber(summary.dueThisWeek, 0)} note={`${formatNumber(summary.overdueWorkOrders, 0)} overdue work orders`} icon={Timer} tone={summary.overdueWorkOrders > 0 ? 'danger' : 'default'} />
              <MetricCard label="Completion rate" value={`${formatNumber(summary.completionRate, 1)}%`} note={`${formatNumber(summary.unitsReceived)} of ${formatNumber(summary.unitsRequired)} units received`} icon={CheckCircle2} tone={summary.completionRate >= 80 || summary.unitsRequired === 0 ? 'success' : 'warning'} />
              <MetricCard label="WIP value" value={formatMoney(summary.wipValue, currency)} note={`${formatNumber(summary.componentShortages, 0)} component shortages`} icon={Boxes} tone={summary.componentShortages > 0 ? 'warning' : 'default'} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr_1fr]">
              <ChartPanel title="Production trend" note="Work order load by start date in the selected period." icon={Factory}>
                <ProductionTrendChart rows={productionTrend} loading={loading} />
              </ChartPanel>
              <ChartPanel title="Work order status" note="Current schedule risk across selected work orders." icon={Gauge}>
                <StatusBreakdownChart rows={statusBreakdown} loading={loading} />
              </ChartPanel>
              <ChartPanel title="MRP demand" note="Planned demand and requirement quantities by due date." icon={CalendarCheck}>
                <MrpDemandTrendChart rows={mrpDemandTrend} loading={loading} />
              </ChartPanel>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
              <div className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Work order queue</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Open and scheduled manufactured items by required date.</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setFiltersOpen(true)}>
                    Filter queue
                  </Button>
                </div>
                <div className="p-4">
                  <AdvancedTable
                    tableId="manufacturing-dashboard-work-orders"
                    columns={workOrderColumns}
                    rows={workOrderQueue}
                    rowKey={(row) => `${row.workOrder}-${row.stockId}`}
                    emptyMessage={loading ? 'Loading work orders...' : 'No work orders found for this period.'}
                    loading={loading}
                    initialPageSize={10}
                    initialScroll="left"
                    showSearch={false}
                    showExports={false}
                  />
                </div>
              </div>

              <Panel title="Most useful next actions" icon={FileSearch}>
                <ActionRow label="Review material planning" value={`${formatNumber(summary.mrpDemandQuantity)} demand units`} icon={PackageSearch} onClick={() => navigate('/inventory/inquiries-and-reports/inventoryplanning')} />
                <ActionRow label="Resolve component shortages" value={`${formatNumber(summary.componentShortages, 0)} shortages`} icon={AlertTriangle} onClick={() => setFiltersOpen(true)} />
                <ActionRow label="Maintain MRP calendar" value={`${formatNumber(summary.manufacturingDays, 0)} available days`} icon={CalendarCheck} onClick={() => navigate('/configuration/manufacturing-setup/mrp-calendar')} />
                <ActionRow label="Maintain demand types" value={`${formatNumber(summary.activeBomParents, 0)} active BOM parents`} icon={Settings} onClick={() => navigate('/configuration/manufacturing-setup/mrp-demand-types')} />
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
              <div className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                <div className="border-b border-akiva-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-akiva-text">Component shortage queue</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Required components where selected open work orders exceed factory stock.</p>
                </div>
                <div className="p-4">
                  <AdvancedTable
                    tableId="manufacturing-dashboard-shortages"
                    columns={shortageColumns}
                    rows={componentShortages}
                    rowKey={(row) => `${row.stockId}-${row.location}`}
                    emptyMessage={loading ? 'Loading component shortages...' : 'No component shortages found.'}
                    loading={loading}
                    initialPageSize={10}
                    initialScroll="left"
                    showSearch={false}
                    showExports={false}
                  />
                </div>
              </div>

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <Panel title="Work centre load" icon={Wrench}>
                  {workCentreLoad.length === 0 ? (
                    <EmptyState message={loading ? 'Loading work centres...' : 'No work centres found.'} />
                  ) : workCentreLoad.map((centre) => (
                    <div key={centre.code} className="rounded-lg border border-akiva-border bg-akiva-surface p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-akiva-text">{centre.code} - {centre.description}</p>
                          <p className="mt-1 text-xs text-akiva-text-muted">{centre.locationName} · capacity {formatNumber(centre.capacity)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold text-akiva-text">{formatNumber(centre.openOrders, 0)} WOs</p>
                          <p className="mt-1 text-xs text-akiva-text-muted">{formatNumber(centre.remainingQuantity)} units</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </Panel>

                <Panel title="Manufacturing calendar" icon={CalendarCheck}>
                  <CalendarAvailability rows={calendarAvailability} loading={loading} />
                </Panel>
              </section>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
              <Panel title="Highest BOM cost" icon={Boxes}>
                {bomCostRollup.length === 0 ? (
                  <EmptyState message={loading ? 'Loading BOM costs...' : 'No active BOM lines found.'} />
                ) : bomCostRollup.map((row) => (
                  <div key={row.parent} className="rounded-lg border border-akiva-border bg-akiva-surface p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-akiva-text">{row.parent}</p>
                        <p className="mt-1 truncate text-xs text-akiva-text-muted">{row.description}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold text-akiva-text">{formatCompactMoney(row.estimatedCost, currency)}</p>
                    </div>
                    <p className="mt-2 text-xs text-akiva-text-muted">{formatNumber(row.componentCount, 0)} components · {row.locations || 'All factories'}</p>
                  </div>
                ))}
              </Panel>

              <Panel title="Factory readiness" icon={Gauge}>
                <ReadinessRow label="Work centres" value={formatNumber(summary.activeWorkCentres, 0)} detail="Configured production centres" ok={summary.activeWorkCentres > 0} />
                <ReadinessRow label="BOM parents" value={formatNumber(summary.activeBomParents, 0)} detail="Active manufactured assemblies" ok={summary.activeBomParents > 0} />
                <ReadinessRow label="Calendar days" value={formatNumber(summary.manufacturingDays, 0)} detail="Available days in filter period" ok={summary.manufacturingDays > 0} />
                <ReadinessRow label="Material shortages" value={formatNumber(summary.componentShortages, 0)} detail="Components requiring attention" ok={summary.componentShortages === 0} />
              </Panel>

              <Panel title="Schedule snapshot" icon={Timer}>
                <SnapshotRow label="Scheduled WOs" value={formatNumber(summary.scheduledWorkOrders, 0)} />
                <SnapshotRow label="Completed this period" value={formatNumber(summary.completedThisPeriod, 0)} />
                <SnapshotRow label="Remaining units" value={formatNumber(summary.remainingUnits)} />
                <SnapshotRow label="MRP demand units" value={formatNumber(summary.mrpDemandQuantity)} />
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
  tone?: 'default' | 'danger' | 'warning' | 'success';
  onClick?: () => void;
}) {
  const iconTone = {
    default: 'bg-akiva-accent-soft text-akiva-accent-text',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
  }[tone];
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

  return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <div className={className}>{content}</div>;
}

function ChartPanel({ title, note, icon: Icon, children }: { title: string; note: string; icon: LucideIcon; children: ReactNode }) {
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

function ProductionTrendChart({ rows, loading }: { rows: ProductionTrend[]; loading: boolean }) {
  if (rows.length === 0) {
    return <ChartEmptyState loading={loading} message="No production trend found." />;
  }

  const data = rows.map((row) => ({ ...row, dateLabel: formatShortDate(row.date) }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--akiva-chart-grid)" />
        <XAxis dataKey="dateLabel" tick={chartAxisTick} axisLine={false} tickLine={false} minTickGap={14} />
        <YAxis tickFormatter={(value) => formatNumber(Number(value), 0)} tick={chartAxisTick} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const required = Number(payload.find((item) => item.dataKey === 'requiredQuantity')?.value ?? 0);
          const received = Number(payload.find((item) => item.dataKey === 'receivedQuantity')?.value ?? 0);
          const orders = Number(payload.find((item) => item.dataKey === 'workOrders')?.value ?? 0);
          return (
            <ChartTooltip>
              <p className="font-semibold text-akiva-text">{label}</p>
              <p className="mt-1 text-akiva-text-muted">WOs: {formatNumber(orders, 0)}</p>
              <p className="mt-1 text-blue-700 dark:text-blue-200">Required: {formatNumber(required)}</p>
              <p className="mt-1 text-emerald-700 dark:text-emerald-200">Received: {formatNumber(received)}</p>
            </ChartTooltip>
          );
        }} />
        <Bar dataKey="requiredQuantity" name="Required" fill="#2563eb" radius={[6, 6, 0, 0]} barSize={12} />
        <Bar dataKey="receivedQuantity" name="Received" fill="#059669" radius={[6, 6, 0, 0]} barSize={12} />
        <Bar dataKey="workOrders" name="Work orders" fill="#6d28d9" radius={[6, 6, 0, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StatusBreakdownChart({ rows, loading }: { rows: NamedValue[]; loading: boolean }) {
  if (rows.length === 0) {
    return <ChartEmptyState loading={loading} message="No work order statuses found." />;
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="grid h-full gap-3 sm:grid-cols-[1fr_1.1fr] xl:grid-cols-1 2xl:grid-cols-[1fr_1.1fr]">
      <div className="relative min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3}>
              {rows.map((entry, index) => (
                <Cell key={entry.name} fill={statusColors[index % statusColors.length]} />
              ))}
            </Pie>
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as NamedValue;
              return (
                <ChartTooltip>
                  <p className="font-semibold text-akiva-text">{row.name}</p>
                  <p className="mt-1 text-akiva-text-muted">{formatNumber(row.value, 0)} work orders</p>
                </ChartTooltip>
              );
            }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold text-akiva-text">{formatNumber(total, 0)}</p>
          <p className="text-xs text-akiva-text-muted">work orders</p>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2">
        {rows.map((row, index) => (
          <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: statusColors[index % statusColors.length] }} />
              <span className="truncate text-xs font-semibold text-akiva-text">{row.name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-akiva-text-muted">{formatNumber(row.value, 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MrpDemandTrendChart({ rows, loading }: { rows: MrpDemandTrend[]; loading: boolean }) {
  if (rows.length === 0) {
    return <ChartEmptyState loading={loading} message="No MRP demand found." />;
  }

  const data = rows.map((row) => ({ ...row, dateLabel: formatShortDate(row.date) }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--akiva-chart-grid)" />
        <XAxis dataKey="dateLabel" tick={chartAxisTick} axisLine={false} tickLine={false} minTickGap={14} />
        <YAxis tickFormatter={(value) => formatNumber(Number(value), 0)} tick={chartAxisTick} axisLine={false} tickLine={false} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const demand = Number(payload.find((item) => item.dataKey === 'demandQuantity')?.value ?? 0);
          const requirements = Number(payload.find((item) => item.dataKey === 'requirementQuantity')?.value ?? 0);
          return (
            <ChartTooltip>
              <p className="font-semibold text-akiva-text">{label}</p>
              <p className="mt-1 text-blue-700 dark:text-blue-200">Demand: {formatNumber(demand)}</p>
              <p className="mt-1 text-amber-700 dark:text-amber-200">Requirements: {formatNumber(requirements)}</p>
            </ChartTooltip>
          );
        }} />
        <Area type="monotone" dataKey="demandQuantity" stroke="#2563eb" fill="rgba(37, 99, 235, 0.16)" strokeWidth={2} />
        <Area type="monotone" dataKey="requirementQuantity" stroke="#d97706" fill="rgba(217, 119, 6, 0.14)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CalendarAvailability({ rows, loading }: { rows: NamedValue[]; loading: boolean }) {
  if (rows.length === 0) {
    return <EmptyState message={loading ? 'Loading manufacturing calendar...' : 'No manufacturing calendar days found.'} />;
  }

  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-[150px_1fr] xl:grid-cols-1 2xl:grid-cols-[150px_1fr]">
      <div className="relative h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="56%" outerRadius="82%" paddingAngle={3}>
              {rows.map((entry, index) => (
                <Cell key={entry.name} fill={calendarColors[index % calendarColors.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl font-semibold text-akiva-text">{formatNumber(total, 0)}</p>
          <p className="text-xs text-akiva-text-muted">days</p>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2">
        {rows.map((row, index) => (
          <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendarColors[index % calendarColors.length] }} />
              <span className="truncate text-xs font-semibold text-akiva-text">{row.name}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-akiva-text-muted">{formatNumber(row.value, 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-xs shadow-xl">
      {children}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
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

function ReadinessRow({ label, value, detail, ok }: { label: string; value: string; detail: string; ok: boolean }) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  const tone = ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-akiva-text">{label}</p>
        <p className="mt-1 text-xs text-akiva-text-muted">{detail}</p>
      </div>
      <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
        {value}
      </span>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2.5">
      <span className="text-sm font-semibold text-akiva-text">{label}</span>
      <span className="shrink-0 text-sm font-semibold text-akiva-text-muted">{value}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-6 text-center text-sm text-akiva-text-muted">
      {message}
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
