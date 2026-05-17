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
}

interface QuantityRow {
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  location: string;
  locationName: string;
  quantity: number;
  reorderLevel: number;
  aboveReorder: number;
  decimalPlaces: number;
  serialised: boolean;
  controlled: boolean;
  units: string;
  attention: boolean;
}

interface Summary {
  lines: number;
  items: number;
  locations: number;
  quantity: number;
  belowReorder: number;
  controlledLines: number;
}

interface WorkbenchPayload {
  categories: Option[];
  rows: QuantityRow[];
  summary: Summary;
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

type SelectionMode = 'All' | 'Multiple';

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

export function InventoryQuantities() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [selection, setSelection] = useState<SelectionMode>('All');
  const [category, setCategory] = useState('All');
  const [tableSearch, setTableSearch] = useState('');
  const [detailRow, setDetailRow] = useState<QuantityRow | null>(null);

  const rows = payload?.rows ?? [];
  const summary = payload?.summary ?? {
    lines: 0,
    items: 0,
    locations: 0,
    quantity: 0,
    belowReorder: 0,
    controlledLines: 0,
  };

  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set('selection', selection);
    params.set('category', category);
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  }, [category, selection, tableSearch]);

  const loadWorkbench = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/inventory-quantities/workbench?${buildParams().toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Inventory quantities could not be loaded.');
      }
      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory quantities could not be loaded.');
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
    setSelection('All');
    setCategory('All');
    setTableSearch('');
  };

  const exportReport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    setError('');
    setMessage('');

    const exportUrl = buildApiUrl(`/api/inventory/inventory-quantities/export/${format}?${buildParams().toString()}`);

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
          throw new Error(json.message || 'Inventory quantities Excel file could not be created.');
        }
        throw new Error('Inventory quantities Excel file could not be created.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-quantities-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Excel report created.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory quantities Excel file could not be created.');
    } finally {
      setExporting('');
    }
  };

  const openMovements = (row: QuantityRow) => {
    const params = new URLSearchParams();
    params.set('item', row.stockId);
    params.set('location', row.location);
    window.history.pushState({}, '', `/inventory/inquiries-and-reports/stockmovements?${params.toString()}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const columns = useMemo<AdvancedTableColumn<QuantityRow>[]>(
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
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName, minWidth: 190 },
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => row.locationName,
        minWidth: 220,
        cell: (row) => (
          <div className="min-w-0">
            <div className="font-medium text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      { id: 'quantity', header: 'Quantity', accessor: (row) => row.quantity, align: 'right', width: 130, cell: (row) => <span className="font-semibold text-akiva-text">{formatNumber(row.quantity, row.decimalPlaces)}</span> },
      { id: 'reorderLevel', header: 'Reorder', accessor: (row) => row.reorderLevel, align: 'right', width: 130, cell: (row) => formatNumber(row.reorderLevel, row.decimalPlaces) },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => (row.attention ? 'Below reorder' : 'In stock'),
        width: 160,
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${row.attention ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'}`}>
            {row.attention ? 'Below reorder' : 'In stock'}
          </span>
        ),
      },
      {
        id: 'control',
        header: 'Control',
        accessor: (row) => `${row.controlled ? 'Controlled' : ''} ${row.serialised ? 'Serialised' : ''}`,
        width: 150,
        cell: (row) => row.controlled || row.serialised ? (
          <span className="text-sm font-medium text-akiva-text">{[row.controlled ? 'Controlled' : '', row.serialised ? 'Serialised' : ''].filter(Boolean).join(', ')}</span>
        ) : (
          <span className="text-sm text-akiva-text-muted">Standard</span>
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
                    Quantity by location
                  </span>
                </div>
                <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                  Inventory Quantities
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review stocked items with quantity on hand by location, reorder level, and controlled stock status.
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[280px_minmax(260px,1fr)_auto] xl:items-end">
                  <div>
                    <span className={labelClass}>Selection</span>
                    <SearchableSelect
                      value={selection}
                      onChange={(value) => setSelection(value === 'Multiple' ? 'Multiple' : 'All')}
                      options={[
                        { value: 'All', label: 'All quantities' },
                        { value: 'Multiple', label: 'Only items in multiple locations' },
                      ]}
                      placeholder="Choose selection"
                    />
                  </div>
                  <div>
                    <span className={labelClass}>Category</span>
                    <SearchableSelect value={category} onChange={(value) => setCategory(value || 'All')} options={categoryOptions} placeholder="Choose category" />
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
              <MetricCard label="Stocked items" value={formatNumber(summary.items, 0)} note="Items with quantity on hand" icon={PackageCheck} loading={loading} />
              <MetricCard label="Location lines" value={formatNumber(summary.lines, 0)} note="Item and location combinations" icon={MapPin} loading={loading} />
              <MetricCard label="Below reorder" value={formatNumber(summary.belowReorder, 0)} note="Lines needing purchasing attention" icon={AlertTriangle} loading={loading} />
              <MetricCard label="Controlled lines" value={formatNumber(summary.controlledLines, 0)} note="Serialised or controlled stock" icon={ShieldCheck} loading={loading} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Quantities by location</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Current non-zero stock quantities from inventory locations.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadWorkbench(); }} className={`${inputClass} pl-10`} placeholder="Search item, category or location" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="inventory-quantities"
                  columns={columns}
                  rows={rows}
                  rowKey={(row, index) => `${row.stockId}-${row.location}-${index}`}
                  emptyMessage={loading ? 'Loading inventory quantities...' : 'No inventory quantities match these filters.'}
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
        title={detailRow ? `${detailRow.stockId} Quantity` : 'Quantity Detail'}
        size="md"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <h2 className="text-base font-semibold text-akiva-text">{detailRow.description}</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">{detailRow.categoryName}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile label="Location" value={`${detailRow.locationName} (${detailRow.location})`} />
              <InfoTile label="Quantity" value={`${formatNumber(detailRow.quantity, detailRow.decimalPlaces)} ${detailRow.units}`.trim()} />
              <InfoTile label="Reorder level" value={formatNumber(detailRow.reorderLevel, detailRow.decimalPlaces)} />
              <InfoTile label="Above reorder" value={formatNumber(detailRow.aboveReorder, detailRow.decimalPlaces)} />
              <InfoTile label="Controlled" value={detailRow.controlled ? 'Yes' : 'No'} />
              <InfoTile label="Serialised" value={detailRow.serialised ? 'Yes' : 'No'} />
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
