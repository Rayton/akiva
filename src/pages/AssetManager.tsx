import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Landmark,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { fetchAssetManagerDashboard } from '../data/assetManagerApi';
import { formatDateWithSystemFormat, useSystemDateFormat } from '../lib/dateFormat';
import type {
  AssetManagerAsset,
  AssetManagerDashboard,
  AssetManagerExposure,
  AssetManagerSettings,
  AssetManagerTransaction,
} from '../types/assetManager';

const defaultSettings: AssetManagerSettings = {
  companyName: 'Company',
  currencyCode: 'USD',
  currencyName: 'US Dollar',
  currencyDecimalPlaces: 2,
  dateFormat: 'Y-m-d',
};

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatMoney(value: number, settings: AssetManagerSettings): string {
  const decimals = Math.max(0, Number(settings.currencyDecimalPlaces ?? 2));
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings.currencyCode || 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value || 0);
  } catch {
    return `${settings.currencyCode || 'USD'} ${(value || 0).toFixed(decimals)}`;
  }
}

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value || 0)}%`;
}

function formatDate(value: string | null | undefined, dateFormat: string): string {
  if (!value) return '-';
  const raw = String(value);
  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? raw;
  return formatDateWithSystemFormat(isoDate, dateFormat) || raw;
}

function statusClasses(status: AssetManagerAsset['status']): string {
  return status === 'Active'
    ? 'border-akiva-success bg-akiva-success-soft text-akiva-success'
    : 'border-akiva-warning bg-akiva-warning-soft text-akiva-warning';
}

function AssetChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <Icon className="h-4 w-4 text-akiva-accent-text" />
      {children}
    </span>
  );
}

function AssetPanel({
  title,
  detail,
  icon: Icon,
  children,
  actions,
}: {
  title: string;
  detail?: string;
  icon: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
            {detail ? <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{detail}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="mt-4 min-w-0">{children}</div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'info';
}) {
  const iconTone =
    tone === 'success'
      ? 'bg-akiva-success-soft text-akiva-success'
      : tone === 'warning'
        ? 'bg-akiva-warning-soft text-akiva-warning'
        : tone === 'info'
          ? 'bg-akiva-info-soft text-akiva-info'
          : 'bg-akiva-accent-soft text-akiva-accent-text';

  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
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
    </div>
  );
}

function StatusPill({ status }: { status: AssetManagerAsset['status'] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${statusClasses(status)}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {status}
    </span>
  );
}

function ExposureList({
  rows,
  mode,
  settings,
}: {
  rows: AssetManagerExposure[];
  mode: 'category' | 'location';
  settings: AssetManagerSettings;
}) {
  const maxValue = Math.max(...rows.map((row) => Math.abs(row.netBookValue)), 1);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
        No exposure rows found.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const label =
          mode === 'category'
            ? row.categoryDescription || row.categoryId || 'Uncategorised'
            : row.locationDescription || row.locationId || 'Unassigned';
        const width = `${Math.max(5, Math.round((Math.abs(row.netBookValue) / maxValue) * 100))}%`;

        return (
          <div key={`${mode}-${row.categoryId ?? row.locationId ?? label}`} className="rounded-lg border border-akiva-border bg-akiva-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-akiva-text">{label}</p>
                <p className="mt-1 text-xs text-akiva-text-muted">
                  {formatCount(row.activeCount)} active of {formatCount(row.assetCount)} assets
                </p>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold text-akiva-text">{formatMoney(row.netBookValue, settings)}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-akiva-surface-muted">
              <div className="h-2 rounded-full bg-akiva-accent" style={{ width }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function AssetManager() {
  const systemDateFormat = useSystemDateFormat();
  const [dashboard, setDashboard] = useState<AssetManagerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [location, setLocation] = useState('all');
  const [status, setStatus] = useState('all');

  const settings = dashboard?.settings ?? { ...defaultSettings, dateFormat: systemDateFormat };
  const dateFormat = settings.dateFormat || systemDateFormat;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const payload = await fetchAssetManagerDashboard({
        q: debouncedSearch,
        category,
        location,
        status,
      });
      setDashboard(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Asset manager dashboard could not be loaded.');
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, [category, debouncedSearch, location, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshKey]);

  const assetColumns = useMemo<AdvancedTableColumn<AssetManagerAsset>[]>(() => [
    {
      id: 'assetId',
      header: 'Asset',
      accessor: (row) => row.assetId,
      cell: (row) => <span className="font-mono font-semibold">#{row.assetId}</span>,
      width: 92,
      alwaysVisible: true,
    },
    {
      id: 'description',
      header: 'Description',
      accessor: (row) => `${row.description} ${row.longDescription}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-akiva-text">{row.description || 'Unnamed asset'}</p>
          <p className="mt-1 line-clamp-2 text-xs text-akiva-text-muted">{row.longDescription || row.serialNo || 'No description recorded'}</p>
        </div>
      ),
      width: 300,
      alwaysVisible: true,
    },
    {
      id: 'serialNo',
      header: 'Serial',
      accessor: (row) => row.serialNo,
      cell: (row) => row.serialNo || '-',
      width: 150,
    },
    {
      id: 'category',
      header: 'Category',
      accessor: (row) => row.categoryDescription || row.categoryId,
      cell: (row) => (
        <span>
          {row.categoryDescription || row.categoryId || '-'}
          {row.categoryId ? <span className="mt-1 block font-mono text-xs text-akiva-text-muted">{row.categoryId}</span> : null}
        </span>
      ),
      width: 180,
    },
    {
      id: 'location',
      header: 'Location',
      accessor: (row) => row.locationDescription || row.locationId,
      cell: (row) => (
        <span>
          {row.locationDescription || row.locationId || '-'}
          {row.locationId ? <span className="mt-1 block font-mono text-xs text-akiva-text-muted">{row.locationId}</span> : null}
        </span>
      ),
      width: 180,
    },
    {
      id: 'datePurchased',
      header: 'Purchased',
      accessor: (row) => formatDate(row.datePurchased, dateFormat),
      sortValue: (row) => row.datePurchased ?? '',
      width: 130,
    },
    {
      id: 'cost',
      header: 'Cost',
      accessor: (row) => row.cost,
      cell: (row) => formatMoney(row.cost, settings),
      exportValue: (row) => row.cost,
      align: 'right',
      width: 150,
    },
    {
      id: 'accumulatedDepreciation',
      header: 'Accum Depn',
      accessor: (row) => row.accumulatedDepreciation,
      cell: (row) => formatMoney(row.accumulatedDepreciation, settings),
      exportValue: (row) => row.accumulatedDepreciation,
      align: 'right',
      width: 150,
    },
    {
      id: 'netBookValue',
      header: 'NBV',
      accessor: (row) => row.netBookValue,
      cell: (row) => <span className="font-semibold">{formatMoney(row.netBookValue, settings)}</span>,
      exportValue: (row) => row.netBookValue,
      align: 'right',
      width: 150,
    },
    {
      id: 'depreciation',
      header: 'Depn',
      accessor: (row) => `${row.depreciationTypeLabel} ${row.depreciationRate}`,
      cell: (row) => (
        <span>
          {row.depreciationTypeLabel}
          <span className="mt-1 block text-xs text-akiva-text-muted">{formatPercent(row.depreciationRate)}</span>
        </span>
      ),
      width: 160,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (row) => <StatusPill status={row.status} />,
      width: 130,
      sticky: 'right',
    },
  ], [dateFormat, settings]);

  const transactionColumns = useMemo<AdvancedTableColumn<AssetManagerTransaction>[]>(() => [
    {
      id: 'date',
      header: 'Date',
      accessor: (row) => formatDate(row.date, dateFormat),
      sortValue: (row) => row.date ?? '',
      width: 130,
    },
    {
      id: 'asset',
      header: 'Asset',
      accessor: (row) => `${row.assetId} ${row.assetDescription}`,
      cell: (row) => (
        <span>
          <span className="font-mono font-semibold">#{row.assetId}</span>
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">{row.assetDescription || 'No description'}</span>
        </span>
      ),
      width: 240,
    },
    {
      id: 'transactionType',
      header: 'Type',
      accessor: (row) => row.transactionType,
      cell: (row) => row.transactionType || '-',
      width: 130,
    },
    { id: 'periodNo', header: 'Period', accessor: (row) => row.periodNo, width: 100, align: 'right' },
    { id: 'transactionNo', header: 'Trans No', accessor: (row) => row.transactionNo, width: 110, align: 'right' },
    {
      id: 'amount',
      header: 'Amount',
      accessor: (row) => row.amount,
      cell: (row) => <span className="font-semibold">{formatMoney(row.amount, settings)}</span>,
      exportValue: (row) => row.amount,
      align: 'right',
      width: 150,
    },
  ], [dateFormat, settings]);

  const summary = dashboard?.summary ?? {
    totalAssets: 0,
    activeAssets: 0,
    disposedAssets: 0,
    totalCost: 0,
    accumulatedDepreciation: 0,
    netBookValue: 0,
    disposalProceeds: 0,
    averageDepreciationRate: 0,
  };
  const assets = dashboard?.assets ?? [];
  const categoryExposure = dashboard?.categoryExposure ?? [];
  const locationExposure = dashboard?.locationExposure ?? [];
  const recentTransactions = dashboard?.recentTransactions ?? [];
  const asOfLabel = dashboard?.asOf ? formatDate(dashboard.asOf, dateFormat) : formatDate(new Date().toISOString().slice(0, 10), dateFormat);
  const depreciationCoverage = summary.totalCost > 0 ? (summary.accumulatedDepreciation / summary.totalCost) * 100 : 0;

  return (
    <div className="akiva-page-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <AssetChip icon={Archive}>Asset Manager</AssetChip>
                  <AssetChip icon={PackageCheck}>{formatCount(summary.activeAssets)} active</AssetChip>
                  <AssetChip icon={summary.disposedAssets > 0 ? AlertTriangle : CheckCircle2}>
                    {formatCount(summary.disposedAssets)} disposed
                  </AssetChip>
                </div>
                <h1 className="mt-4 akiva-page-title">Asset Manager</h1>
                <p className="akiva-page-subtitle">
                  Fixed asset register, net book value, depreciation exposure, and location accountability.
                </p>
                <p className="mt-2 text-xs font-medium text-akiva-text-muted">
                  {settings.companyName} | {settings.currencyCode} | Updated {asOfLabel}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label="Refresh asset manager"
                  title="Refresh asset manager"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <Button type="button" variant="secondary" onClick={() => {
                  setSearchInput('');
                  setCategory('all');
                  setLocation('all');
                  setStatus('all');
                }}>
                  Clear filters
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {error ? (
              <div className="rounded-lg border border-akiva-danger bg-akiva-danger-soft px-4 py-3 text-sm text-akiva-danger">
                {error}
              </div>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Net book value"
                value={formatMoney(summary.netBookValue, settings)}
                note={`${formatCount(summary.totalAssets)} assets in the filtered register`}
                icon={Landmark}
                tone="success"
              />
              <MetricCard
                label="Gross cost"
                value={formatMoney(summary.totalCost, settings)}
                note={`${formatPercent(depreciationCoverage)} depreciated to date`}
                icon={BarChart3}
                tone="info"
              />
              <MetricCard
                label="Accum depreciation"
                value={formatMoney(summary.accumulatedDepreciation, settings)}
                note={`${formatPercent(summary.averageDepreciationRate)} average active rate`}
                icon={Gauge}
              />
              <MetricCard
                label="Disposed proceeds"
                value={formatMoney(summary.disposalProceeds, settings)}
                note={`${formatCount(summary.disposedAssets)} assets no longer active`}
                icon={ShieldCheck}
                tone={summary.disposedAssets > 0 ? 'warning' : 'default'}
              />
            </section>

            <section className="grid gap-4 lg:grid-cols-12">
              <main className="min-w-0 space-y-4 lg:col-span-8">
                <AssetPanel
                  title="Fixed Asset Register"
                  detail={loading ? 'Loading asset register...' : `${formatCount(assets.length)} assets match the current filters.`}
                  icon={Archive}
                  actions={
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                      <input
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        className="h-10 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised pl-9 pr-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                        placeholder="Search assets, serials, barcode"
                      />
                    </div>
                  }
                >
                  <div className="mb-4 grid gap-3 md:grid-cols-3">
                    <SearchableSelect
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className="h-10 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm"
                    >
                      <option value="all">All categories</option>
                      {(dashboard?.filterOptions.categories ?? []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </SearchableSelect>
                    <SearchableSelect
                      value={location}
                      onChange={(event) => setLocation(event.target.value)}
                      className="h-10 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm"
                    >
                      <option value="all">All locations</option>
                      {(dashboard?.filterOptions.locations ?? []).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </SearchableSelect>
                    <SearchableSelect
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="h-10 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm"
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Active</option>
                      <option value="disposed">Disposed</option>
                    </SearchableSelect>
                  </div>

                  <AdvancedTable<AssetManagerAsset>
                    tableId="asset-manager-register"
                    ariaLabel="Fixed asset register"
                    columns={assetColumns}
                    rows={assets}
                    rowKey={(row) => row.id}
                    emptyMessage="No fixed assets found."
                    loading={loading}
                    loadingMessage="Loading asset register..."
                    density="compact"
                    maxTableHeight="min(68vh, 720px)"
                    selectableRows
                    showSearch={false}
                    initialPageSize={25}
                  />
                </AssetPanel>

                <AssetPanel
                  title="Recent Asset Transactions"
                  detail="Cost, depreciation, disposal, and adjustment entries from the fixed asset ledger."
                  icon={CalendarClock}
                >
                  <AdvancedTable<AssetManagerTransaction>
                    tableId="asset-manager-transactions"
                    ariaLabel="Recent fixed asset transactions"
                    columns={transactionColumns}
                    rows={recentTransactions}
                    rowKey={(row) => String(row.id)}
                    emptyMessage="No fixed asset transactions found."
                    loading={loading}
                    loadingMessage="Loading asset transactions..."
                    density="compact"
                    maxTableHeight="420px"
                    initialPageSize={10}
                  />
                </AssetPanel>
              </main>

              <aside className="min-w-0 space-y-4 lg:col-span-4">
                <AssetPanel title="Category Exposure" detail="Net book value by fixed asset category." icon={Building2}>
                  <ExposureList rows={categoryExposure} mode="category" settings={settings} />
                </AssetPanel>

                <AssetPanel title="Location Accountability" detail="Active asset value by location." icon={MapPin}>
                  <ExposureList rows={locationExposure} mode="location" settings={settings} />
                </AssetPanel>
              </aside>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
