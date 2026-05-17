import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
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
}

interface ReorderRow {
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  location: string;
  locationName: string;
  bin: string;
  onHand: number;
  reorderLevel: number;
  shortage: number;
  onOrder: number;
  suggestedOrder: number;
  transferAvailable: number;
  bestTransferLocation: string;
  unitCost: number;
  suggestedValue: number;
  units: string;
  decimalPlaces: number;
  status: 'Needs order' | 'Covered by open PO' | 'Can transfer';
}

interface Summary {
  lines: number;
  items: number;
  locations: number;
  needOrder: number;
  coveredByPo: number;
  canTransfer: number;
  suggestedValue: number;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  rows: ReorderRow[];
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
  return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)}`;
}

function statusClass(status: ReorderRow['status']): string {
  if (status === 'Covered by open PO') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'Can transfer') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
}

export function ReorderLevel() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [location, setLocation] = useState('All');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState('Needs order');
  const [tableSearch, setTableSearch] = useState('');
  const [detailRow, setDetailRow] = useState<ReorderRow | null>(null);

  const rows = payload?.rows ?? [];
  const currency = payload?.currency ?? 'TZS';
  const summary = payload?.summary ?? {
    lines: 0,
    items: 0,
    locations: 0,
    needOrder: 0,
    coveredByPo: 0,
    canTransfer: 0,
    suggestedValue: 0,
  };

  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);
  const visibleRows = useMemo(() => {
    const search = tableSearch.trim().toLowerCase();
    if (!search) return rows;

    return rows.filter((row) =>
      [
        row.stockId,
        row.description,
        row.longDescription,
        row.categoryName,
        row.locationName,
        row.location,
        row.bin,
        row.status,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }, [rows, tableSearch]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('location', location);
    params.set('category', category);
    params.set('status', status);
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [category, location, status, tableSearch]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/reorder-level/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Reorder levels could not be loaded.');
      }
      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reorder levels could not be loaded.');
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

  const clearFilters = () => {
    setLocation('All');
    setCategory('All');
    setStatus('Needs order');
    setTableSearch('');
  };

  const exportReport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    setError('');
    setMessage('');

    const exportUrl = buildApiUrl(`/api/inventory/reorder-level/export/${format}?${buildParams().toString()}`);

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
          throw new Error(json.message || 'Reorder level Excel file could not be created.');
        }
        throw new Error('Reorder level Excel file could not be created.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reorder-level-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Excel report created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reorder level Excel file could not be created.');
    } finally {
      setExporting('');
    }
  };

  const openMovements = (row: ReorderRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('location', row.location);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const openTransfer = (row: ReorderRow) => {
    const params = new URLSearchParams();
    params.set('to', row.location);
    params.set('item', row.stockId);
    window.history.pushState({}, '', `/inventory/transactions/stockloctransfer?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<ReorderRow>[]>(
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
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => row.locationName,
        minWidth: 220,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.bin ? `Bin ${row.bin}` : row.location}</div>
          </div>
        ),
      },
      { id: 'onHand', header: 'On hand', accessor: (row) => row.onHand, align: 'right', width: 130, cell: (row) => formatNumber(row.onHand, row.decimalPlaces) },
      { id: 'reorderLevel', header: 'Reorder', accessor: (row) => row.reorderLevel, align: 'right', width: 130, cell: (row) => formatNumber(row.reorderLevel, row.decimalPlaces) },
      { id: 'onOrder', header: 'On order', accessor: (row) => row.onOrder, align: 'right', width: 130, cell: (row) => formatNumber(row.onOrder, row.decimalPlaces) },
      {
        id: 'suggestedOrder',
        header: 'Suggested order',
        accessor: (row) => row.suggestedOrder,
        align: 'right',
        width: 160,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatNumber(row.suggestedOrder, row.decimalPlaces)}</span>,
      },
      {
        id: 'transferAvailable',
        header: 'Can transfer',
        accessor: (row) => row.transferAvailable,
        align: 'right',
        width: 140,
        cell: (row) => formatNumber(row.transferAvailable, row.decimalPlaces),
      },
      { id: 'value', header: 'Suggested value', accessor: (row) => row.suggestedValue, align: 'right', width: 160, cell: (row) => formatMoney(row.suggestedValue, currency) },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 180,
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
        width: 245,
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
    [currency]
  );

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                  Inventory / Purchase planning
                </p>
                <h1 className="mt-3 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                  Reorder Planning
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review stock below reorder level, open purchase orders, transfer cover, and suggested order quantities.
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={location} onChange={(value) => setLocation(value || 'All')} options={locationOptions} placeholder="Choose location" />
                  </div>
                  <div>
                    <span className={labelClass}>Category</span>
                    <SearchableSelect value={category} onChange={(value) => setCategory(value || 'All')} options={categoryOptions} placeholder="Choose category" />
                  </div>
                  <div>
                    <span className={labelClass}>Show</span>
                    <SearchableSelect
                      value={status}
                      onChange={(value) => setStatus(value || 'Needs order')}
                      options={[
                        { value: 'Needs order', label: 'Needs order' },
                        { value: 'Can transfer', label: 'Can transfer from another location' },
                        { value: 'Covered by open PO', label: 'Covered by open PO' },
                        { value: 'All below reorder', label: 'All below reorder' },
                      ]}
                      placeholder="Choose status"
                    />
                  </div>
                  <div className="flex gap-2">
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
              <MetricCard label="Needs order" value={formatNumber(summary.needOrder, 0)} note={`${formatNumber(summary.items, 0)} items below reorder`} icon={AlertTriangle} loading={loading} />
              <MetricCard label="Suggested value" value={formatMoney(summary.suggestedValue, currency)} note="Estimated cost to restore reorder cover" icon={ShoppingCart} loading={loading} />
              <MetricCard label="Can transfer" value={formatNumber(summary.canTransfer, 0)} note="Lines with cover at another location" icon={Truck} loading={loading} />
              <MetricCard label="Covered by PO" value={formatNumber(summary.coveredByPo, 0)} note={`${formatNumber(summary.locations, 0)} locations in this view`} icon={CheckCircle2} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Items below reorder</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Use suggested order after open POs, or transfer where another location has spare stock.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadWorkbench(); }} className={`${inputClass} pl-10`} placeholder="Search item, location, category or bin" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="reorder-level-report"
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(row, index) => `${row.stockId}-${row.location}-${index}`}
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

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `${detailRow.stockId} Reorder Detail` : 'Reorder Detail'}
        size="md"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-akiva-text">{detailRow.description}</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">{detailRow.categoryName}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile label="Location" value={`${detailRow.locationName} (${detailRow.location})`} />
              <InfoTile label="Bin" value={detailRow.bin || '-'} />
              <InfoTile label="On hand" value={`${formatNumber(detailRow.onHand, detailRow.decimalPlaces)} ${detailRow.units}`.trim()} />
              <InfoTile label="Reorder level" value={formatNumber(detailRow.reorderLevel, detailRow.decimalPlaces)} />
              <InfoTile label="Open PO quantity" value={formatNumber(detailRow.onOrder, detailRow.decimalPlaces)} />
              <InfoTile label="Suggested order" value={formatNumber(detailRow.suggestedOrder, detailRow.decimalPlaces)} />
              <InfoTile label="Transfer available" value={detailRow.bestTransferLocation ? `${formatNumber(detailRow.transferAvailable, detailRow.decimalPlaces)} from ${detailRow.bestTransferLocation}` : formatNumber(detailRow.transferAvailable, detailRow.decimalPlaces)} />
              <InfoTile label="Suggested value" value={formatMoney(detailRow.suggestedValue, currency)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => openMovements(detailRow)}>
                Open movements
              </Button>
              {detailRow.transferAvailable > 0 ? (
                <Button type="button" variant="secondary" onClick={() => openTransfer(detailRow)}>
                  Plan transfer
                </Button>
              ) : null}
            </div>
          </section>
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
