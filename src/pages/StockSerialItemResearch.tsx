import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Eye,
  History,
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

interface CurrentSerial {
  serialNo: string;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  quantity: number;
  expirationDate: string | null;
  qualityText: string;
  createdAt: string | null;
  units: string;
  decimalPlaces: number;
  status: 'Available' | 'Depleted' | 'Expired' | 'Expiring';
}

interface SerialMovement {
  serialMoveNumber: number;
  stockMoveNumber: number;
  serialNo: string;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  transactionDate: string;
  movementQuantity: number;
  totalMoveQuantity: number;
  currentQuantity: number | null;
  newOnHand: number;
  transactionType: number;
  transactionTypeName: string;
  transactionNumber: number;
  debtorNo: string;
  branchCode: string;
  reference: string;
  postedBy: string;
  units: string;
  decimalPlaces: number;
  unitCost: number;
  value: number;
  direction: 'In' | 'Out';
}

interface Summary {
  matchingSerials: number;
  availableSerials: number;
  currentQuantity: number;
  movementLines: number;
  lastMovementDate: string | null;
  attentionSerials: number;
}

interface WorkbenchPayload {
  locations: Option[];
  items: Option[];
  currentSerials: CurrentSerial[];
  movements: SerialMovement[];
  summary: Summary;
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
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)}`;
}

function directionClass(direction: SerialMovement['direction']): string {
  if (direction === 'In') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
}

function statusClass(status: CurrentSerial['status']): string {
  if (status === 'Available') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'Expired') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
  if (status === 'Expiring') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

export function StockSerialItemResearch() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [serialSearch, setSerialSearch] = useState('');
  const [itemFilter, setItemFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null);
  const [detailMovement, setDetailMovement] = useState<SerialMovement | null>(null);

  const locations = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const items = useMemo(() => [{ value: 'All', label: 'All controlled items' }, ...(payload?.items ?? [])], [payload?.items]);
  const currentSerials = payload?.currentSerials ?? [];
  const movements = payload?.movements ?? [];
  const summary = payload?.summary ?? {
    matchingSerials: 0,
    availableSerials: 0,
    currentQuantity: 0,
    movementLines: 0,
    lastMovementDate: null,
    attentionSerials: 0,
  };

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (serialSearch.trim()) params.set('serial', serialSearch.trim());
      if (itemFilter !== 'All') params.set('item', itemFilter);
      if (locationFilter !== 'All') params.set('location', locationFilter);
      if (dateRange) {
        params.set('from', dateRange.from);
        params.set('to', dateRange.to);
      }

      const response = await apiFetch(buildApiUrl(`/api/inventory/serial-item-research/workbench?${params.toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Serial item research could not be loaded.');
      }

      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Serial item research could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkbench();
    }, 280);
    return () => window.clearTimeout(timer);
  }, [serialSearch, itemFilter, locationFilter, dateRange?.from, dateRange?.to]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const clearFilters = () => {
    setSerialSearch('');
    setItemFilter('All');
    setLocationFilter('All');
    setDateRange(null);
  };

  const balancePreview = currentSerials.slice(0, 4);

  const columns = useMemo<AdvancedTableColumn<SerialMovement>[]>(
    () => [
      {
        id: 'serialNo',
        header: 'Serial / batch',
        accessor: (row) => row.serialNo,
        minWidth: 220,
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-akiva-text">{row.serialNo}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">Move #{row.stockMoveNumber}</div>
          </div>
        ),
      },
      {
        id: 'item',
        header: 'Item',
        accessor: (row) => `${row.stockId} ${row.description}`,
        minWidth: 280,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-semibold text-akiva-text">{row.stockId}</div>
            <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.description}</div>
          </div>
        ),
      },
      { id: 'transactionDate', header: 'Date', accessor: (row) => row.transactionDate, width: 130 },
      {
        id: 'movement',
        header: 'Movement',
        accessor: (row) => row.movementQuantity,
        align: 'right',
        width: 150,
        cell: (row) => (
          <span className={row.direction === 'In' ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-rose-700 dark:text-rose-300'}>
            {row.movementQuantity > 0 ? '+' : ''}{formatNumber(row.movementQuantity, row.decimalPlaces || 2)} {row.units}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Source',
        accessor: (row) => `${row.transactionTypeName} ${row.transactionNumber}`,
        minWidth: 210,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.transactionTypeName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">#{row.transactionNumber}</div>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => `${row.locationName} ${row.location}`,
        minWidth: 210,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      {
        id: 'direction',
        header: 'Direction',
        accessor: (row) => row.direction,
        width: 120,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${directionClass(row.direction)}`}>{row.direction}</span>,
      },
      {
        id: 'currentQuantity',
        header: 'Current',
        accessor: (row) => row.currentQuantity ?? '',
        align: 'right',
        width: 130,
        cell: (row) => row.currentQuantity === null ? <span className="text-akiva-text-muted">-</span> : <span>{formatNumber(row.currentQuantity, row.decimalPlaces || 2)}</span>,
      },
      {
        id: 'reference',
        header: 'Reference',
        accessor: (row) => row.reference,
        minWidth: 240,
        cell: (row) => <span className="line-clamp-2 text-sm">{row.reference || '-'}</span>,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.serialMoveNumber,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 120,
        cell: (row) => (
          <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => setDetailMovement(row)}>
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
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <PackageSearch className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <History className="h-4 w-4 text-akiva-accent-text" />
                    Serial trace
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                  Serial Item Research
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Trace serial and batch balances through receipts, sales, transfers, adjustments and other inventory movements.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter serial research" title="Filter serial research" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Matches" value={String(summary.matchingSerials)} note="Serials or batches in this view" icon={PackageSearch} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Available" value={String(summary.availableSerials)} note={`${formatNumber(summary.currentQuantity)} units currently on hand`} icon={CheckCircle2} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Movements" value={String(summary.movementLines)} note={summary.lastMovementDate ? `Last activity ${summary.lastMovementDate}` : 'No activity in range'} icon={History} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Attention" value={summary.attentionSerials > 0 ? String(summary.attentionSerials) : 'Clear'} note="Expired or near-expiry balances" icon={ShieldCheck} onClick={() => setFilterOpen(true)} />
            </section>

            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label className="block">
                    <span className={labelClass}>Item</span>
                    <SearchableSelect value={itemFilter} onChange={setItemFilter} options={items} inputClassName={inputClass} placeholder="Controlled item" />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={locationFilter} onChange={setLocationFilter} options={locations} inputClassName={inputClass} placeholder="Location" />
                  </label>
                  <div>
                    <span className={labelClass}>Date range</span>
                    {dateRange ? (
                      <DateRangePicker value={dateRange} onChange={setDateRange} label="Movement dates" triggerClassName="h-11 rounded-lg px-3" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDateRange(getDefaultDateRange())}
                        className="inline-flex h-11 w-full min-w-0 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-left text-sm text-akiva-text shadow-sm transition hover:border-akiva-accent focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                      >
                        <CalendarDays className="h-4 w-4 shrink-0 text-akiva-text-muted" />
                        <span className="min-w-0 truncate font-medium text-akiva-text">All dates</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="secondary" className="w-full" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            {balancePreview.length > 0 ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Current balance</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Shown for matching serials or batches still recorded in stock.</p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{currentSerials.length} balance line{currentSerials.length === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {balancePreview.map((row) => (
                    <div key={`${row.stockId}-${row.location}-${row.serialNo}`} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-akiva-text">{row.serialNo}</div>
                          <div className="mt-1 truncate text-xs text-akiva-text-muted">{row.stockId} . {row.locationName}</div>
                        </div>
                        <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(row.status)}`}>{row.status}</span>
                      </div>
                      <div className="mt-3 text-xl font-semibold text-akiva-text">{formatNumber(row.quantity, row.decimalPlaces || 2)} {row.units}</div>
                      {row.expirationDate ? <div className="mt-1 text-xs text-akiva-text-muted">Expires {row.expirationDate}</div> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Movement history</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Showing the first 50 serial or batch movements. Search to narrow the trace.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    value={serialSearch}
                    onChange={(event) => setSerialSearch(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') void loadWorkbench(); }}
                    className={`${inputClass} pl-10`}
                    placeholder="Search serial or batch number"
                  />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-serial-item-research"
                  columns={columns}
                  rows={movements}
                  rowKey={(row) => String(row.serialMoveNumber)}
                  emptyMessage={loading ? 'Loading serial history...' : 'No serial or batch movements match these filters.'}
                  loading={loading}
                  initialPageSize={10}
                  initialScroll="left"
                />
              </div>
            </section>
          </div>
        </section>
      </div>

      <Modal
        isOpen={Boolean(detailMovement)}
        onClose={() => setDetailMovement(null)}
        title={detailMovement ? `${detailMovement.serialNo}` : 'Serial movement'}
        size="sm"
        footer={<Button type="button" onClick={() => setDetailMovement(null)}>Close</Button>}
      >
        {detailMovement ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="font-semibold text-akiva-text">{detailMovement.stockId} - {detailMovement.description}</div>
              <div className="mt-2 text-sm text-akiva-text-muted">{detailMovement.locationName} ({detailMovement.location})</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="Movement" value={`${detailMovement.movementQuantity > 0 ? '+' : ''}${formatNumber(detailMovement.movementQuantity, detailMovement.decimalPlaces || 2)} ${detailMovement.units}`} />
                <InfoTile label="Source" value={`${detailMovement.transactionTypeName} #${detailMovement.transactionNumber}`} />
                <InfoTile label="Date" value={detailMovement.transactionDate} />
                <InfoTile label="Current balance" value={detailMovement.currentQuantity === null ? '-' : formatNumber(detailMovement.currentQuantity, detailMovement.decimalPlaces || 2)} />
                <InfoTile label="Unit cost" value={formatMoney(detailMovement.unitCost)} />
                <InfoTile label="Value" value={formatMoney(detailMovement.value)} />
              </div>
            </section>
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Reference</div>
              <p className="mt-2 text-sm leading-6 text-akiva-text">{detailMovement.reference || 'No reference recorded.'}</p>
              {detailMovement.debtorNo || detailMovement.branchCode ? (
                <p className="mt-3 text-xs text-akiva-text-muted">
                  Customer {detailMovement.debtorNo || '-'} {detailMovement.branchCode ? `. Branch ${detailMovement.branchCode}` : ''}
                </p>
              ) : null}
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
      <div className="mt-1 truncate text-lg font-semibold text-akiva-text">{value}</div>
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
