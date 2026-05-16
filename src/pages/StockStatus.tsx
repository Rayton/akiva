import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  History,
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

interface StockStatusItem {
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

interface StockStatusRow {
  stockId: string;
  location: string;
  locationName: string;
  bin: string;
  onHand: number;
  reorderLevel: number;
  demand: number;
  inTransit: number;
  available: number;
  onOrder: number;
  status: 'Available' | 'Reorder' | 'Short' | 'Out' | 'Non-stock';
  units: string;
  decimalPlaces: number;
}

interface Summary {
  locations: number;
  onHand: number;
  demand: number;
  inTransit: number;
  available: number;
  onOrder: number;
  attentionLocations: number;
}

interface WorkbenchPayload {
  items: Option[];
  locations: Option[];
  selectedItem: StockStatusItem | null;
  statusRows: StockStatusRow[];
  summary: Summary;
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

function statusClass(status: StockStatusRow['status']): string {
  if (status === 'Available') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'Reorder') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  if (status === 'Short' || status === 'Out') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
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

export function StockStatus() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemLookupOptions, setItemLookupOptions] = useState<Option[]>([]);
  const [itemFilter, setItemFilter] = useState(initialItemFromUrl);
  const [locationFilter, setLocationFilter] = useState('All');
  const [detailRow, setDetailRow] = useState<StockStatusRow | null>(null);

  const selectedItem = payload?.selectedItem ?? null;
  const statusRows = payload?.statusRows ?? [];
  const summary = payload?.summary ?? {
    locations: 0,
    onHand: 0,
    demand: 0,
    inTransit: 0,
    available: 0,
    onOrder: 0,
    attentionLocations: 0,
  };
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const itemOptions = useMemo(
    () => mergeOptions(payload?.items ?? [], itemLookupOptions, selectedItem ? [{ value: selectedItem.stockId, label: `${selectedItem.stockId} - ${selectedItem.description}` }] : []),
    [payload?.items, itemLookupOptions, selectedItem]
  );

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (itemFilter !== 'All') params.set('item', itemFilter);
      if (locationFilter !== 'All') params.set('location', locationFilter);

      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-status/workbench?${params.toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock status could not be loaded.');
      }

      setPayload(json.data);
      if (itemFilter === 'All' && json.data.selectedItem?.stockId) {
        setItemFilter(json.data.selectedItem.stockId);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock status could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadItemOptions = async (query = '') => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (query.trim()) params.set('q', query.trim());

      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-status-items?${params.toString()}`));
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
  }, [itemFilter, locationFilter]);

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
    setTableSearch('');
  };

  const filteredRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) return statusRows;
    return statusRows.filter((row) =>
      [row.locationName, row.location, row.bin, row.status]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }, [statusRows, tableSearch]);

  const columns = useMemo<AdvancedTableColumn<StockStatusRow>[]>(
    () => [
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => `${row.locationName} ${row.location}`,
        minWidth: 240,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      { id: 'bin', header: 'Bin', accessor: (row) => row.bin || '-', width: 120 },
      {
        id: 'onHand',
        header: 'On hand',
        accessor: (row) => row.onHand,
        align: 'right',
        width: 140,
        cell: (row) => `${formatNumber(row.onHand, row.decimalPlaces || 2)} ${row.units}`,
      },
      {
        id: 'reorderLevel',
        header: 'Reorder level',
        accessor: (row) => row.reorderLevel,
        align: 'right',
        width: 150,
        cell: (row) => formatNumber(row.reorderLevel, row.decimalPlaces || 2),
      },
      {
        id: 'demand',
        header: 'Demand',
        accessor: (row) => row.demand,
        align: 'right',
        width: 130,
        cell: (row) => formatNumber(row.demand, row.decimalPlaces || 2),
      },
      {
        id: 'inTransit',
        header: 'In transit',
        accessor: (row) => row.inTransit,
        align: 'right',
        width: 140,
        cell: (row) => (
          <span className={row.inTransit < 0 ? 'font-semibold text-rose-700 dark:text-rose-300' : row.inTransit > 0 ? 'font-semibold text-emerald-700 dark:text-emerald-300' : ''}>
            {row.inTransit > 0 ? '+' : ''}{formatNumber(row.inTransit, row.decimalPlaces || 2)}
          </span>
        ),
      },
      {
        id: 'available',
        header: 'Available',
        accessor: (row) => row.available,
        align: 'right',
        width: 140,
        cell: (row) => (
          <span className={row.available < 0 ? 'font-semibold text-rose-700 dark:text-rose-300' : 'font-semibold text-akiva-text'}>
            {formatNumber(row.available, row.decimalPlaces || 2)}
          </span>
        ),
      },
      {
        id: 'onOrder',
        header: 'On order',
        accessor: (row) => row.onOrder,
        align: 'right',
        width: 140,
        cell: (row) => formatNumber(row.onOrder, row.decimalPlaces || 2),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 140,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.location,
        sortable: false,
        filterable: false,
        align: 'right',
        sticky: 'right',
        width: 120,
        cell: (row) => (
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => setDetailRow(row)}>
            <Eye className="h-4 w-4" />
            View
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
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Stock availability
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                  Stock Status
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Check where an item is held, what is committed, what is moving between locations, and what can still be issued.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter stock status" title="Filter stock status" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <span className={labelClass}>Item</span>
                    <SearchableSelect value={itemFilter} onChange={setItemFilter} onSearchChange={setItemSearch} options={itemOptions} inputClassName={inputClass} placeholder="Search item code or name" />
                  </div>
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={locationFilter} onChange={setLocationFilter} options={locationOptions} inputClassName={inputClass} placeholder="Location" />
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
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">{selectedItem.units || 'No unit'}</span>
                    <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">{selectedItem.stockHeld ? 'Stock-held' : 'Non-stock'}</span>
                    {selectedItem.serialised ? <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">Serialised</span> : null}
                    {selectedItem.controlled ? <span className="inline-flex rounded-full border border-akiva-border bg-akiva-surface px-3 py-1 text-xs font-semibold text-akiva-text-muted">Batch controlled</span> : null}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Available" value={formatNumber(summary.available, selectedItem?.decimalPlaces || 2)} note="After demand and outgoing transfers" icon={PackageCheck} onClick={() => setTableSearch('Available')} />
              <MetricCard label="On hand" value={formatNumber(summary.onHand, selectedItem?.decimalPlaces || 2)} note={`${formatNumber(summary.locations, 0)} locations with this item`} icon={MapPin} onClick={() => setTableSearch('')} />
              <MetricCard label="Committed" value={formatNumber(summary.demand, selectedItem?.decimalPlaces || 2)} note="Open sales and production demand" icon={History} onClick={() => setTableSearch('')} />
              <MetricCard label="Needs attention" value={formatNumber(summary.attentionLocations, 0)} note="Short, out, or at reorder level" icon={AlertTriangle} onClick={() => setTableSearch('Reorder')} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Availability by location</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Available = on hand minus demand, adjusted down for outgoing stock transfers.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search location, bin or status" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-status"
                  columns={columns}
                  rows={filteredRows}
                  rowKey={(row) => row.location}
                  emptyMessage={loading ? 'Loading stock status...' : 'No stock status matches these filters.'}
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
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `${detailRow.locationName} Status` : 'Location Status'}
        size="md"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-akiva-text">{detailRow.locationName}</div>
                  <div className="mt-1 text-sm text-akiva-text-muted">{detailRow.location} {detailRow.bin ? `- Bin ${detailRow.bin}` : ''}</div>
                </div>
                <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(detailRow.status)}`}>
                  {detailRow.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="On hand" value={`${formatNumber(detailRow.onHand, detailRow.decimalPlaces || 2)} ${detailRow.units}`} />
                <InfoTile label="Demand" value={formatNumber(detailRow.demand, detailRow.decimalPlaces || 2)} />
                <InfoTile label="In transit" value={formatNumber(detailRow.inTransit, detailRow.decimalPlaces || 2)} />
                <InfoTile label="Available" value={formatNumber(detailRow.available, detailRow.decimalPlaces || 2)} />
                <InfoTile label="On order" value={formatNumber(detailRow.onOrder, detailRow.decimalPlaces || 2)} />
                <InfoTile label="Reorder level" value={formatNumber(detailRow.reorderLevel, detailRow.decimalPlaces || 2)} />
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
