import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
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
  searchText?: string;
}

interface MovementSerial {
  serialNo: string;
  quantity: number;
}

interface StockMovementRow {
  movementNumber: number;
  stockId: string;
  description: string;
  longDescription: string;
  category: string;
  categoryName: string;
  type: number;
  typeName: string;
  transactionNumber: number;
  location: string;
  locationName: string;
  date: string;
  postedBy: string;
  customer: string;
  branch: string;
  quantity: number;
  absoluteQuantity: number;
  newOnHand: number;
  unitCost: number;
  movementValue: number;
  price: number;
  discountPercent: number;
  netPrice: number;
  reference: string;
  narrative: string;
  units: string;
  decimalPlaces: number;
  controlled: boolean;
  serialised: boolean;
  serials: MovementSerial[];
  direction: 'In' | 'Out' | 'Zero';
}

interface Summary {
  movementLines: number;
  itemsMoved: number;
  locationsMoved: number;
  inboundQuantity: number;
  outboundQuantity: number;
  movementValue: number;
  lastMovementDate: string | null;
}

interface WorkbenchPayload {
  locations: Option[];
  items: Option[];
  movementTypes: Option[];
  movements: StockMovementRow[];
  summary: Summary;
  currency: string;
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

type DirectionFilter = 'All' | 'In' | 'Out' | 'Zero';

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

function directionClass(direction: StockMovementRow['direction']): string {
  if (direction === 'In') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (direction === 'Out') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
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

export function StockMovements() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'pdf' | 'excel' | ''>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemLookupOptions, setItemLookupOptions] = useState<Option[]>([]);
  const [locationFilter, setLocationFilter] = useState('All');
  const [itemFilter, setItemFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('All');
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(getDefaultDateRange());
  const [detailRow, setDetailRow] = useState<StockMovementRow | null>(null);

  const movements = payload?.movements ?? [];
  const summary = payload?.summary ?? {
    movementLines: 0,
    itemsMoved: 0,
    locationsMoved: 0,
    inboundQuantity: 0,
    outboundQuantity: 0,
    movementValue: 0,
    lastMovementDate: null,
  };
  const currency = payload?.currency ?? 'TZS';
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const itemOptions = useMemo(
    () => mergeOptions([{ value: 'All', label: 'All items' }], payload?.items ?? [], itemLookupOptions),
    [payload?.items, itemLookupOptions]
  );
  const typeOptions = useMemo(() => [{ value: 'All', label: 'All movement types' }, ...(payload?.movementTypes ?? [])], [payload?.movementTypes]);
  const directionOptions = [
    { value: 'All', label: 'All directions' },
    { value: 'In', label: 'Stock in' },
    { value: 'Out', label: 'Stock out' },
    { value: 'Zero', label: 'No quantity change' },
  ];

  const buildMovementParams = (limit = '500') => {
    const params = new URLSearchParams({ limit });
    if (locationFilter !== 'All') params.set('location', locationFilter);
    if (itemFilter !== 'All') params.set('item', itemFilter);
    if (typeFilter !== 'All') params.set('type', typeFilter);
    if (directionFilter !== 'All') params.set('direction', directionFilter);
    if (dateRange) {
      params.set('from', dateRange.from);
      params.set('to', dateRange.to);
    }
    if (tableSearch.trim()) params.set('q', tableSearch.trim());
    return params;
  };

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const params = buildMovementParams();

      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-movements/workbench?${params.toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock movements could not be loaded.');
      }

      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock movements could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadItemOptions = async (query = '') => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (query.trim()) params.set('q', query.trim());

      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-movement-items?${params.toString()}`));
      const json = (await response.json()) as ItemLookupResponse;
      if (!response.ok || !json.success || !Array.isArray(json.data)) {
        throw new Error(json.message || 'Items could not be loaded.');
      }

      setItemLookupOptions(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Items could not be loaded.');
    }
  };

  const exportReport = async (format: 'pdf' | 'excel') => {
    setExporting(format);
    setError('');
    setMessage('');

    const pdfWindow = format === 'pdf' ? window.open('', '_blank') : null;
    if (pdfWindow) {
      pdfWindow.document.write('<!doctype html><title>Preparing report</title><body style="font-family:system-ui,sans-serif;padding:32px;color:#211019;background:#fff8fb"><h1 style="font-size:20px;margin:0 0 8px">Preparing Stock Movements PDF</h1><p style="margin:0;color:#7b6170">The report will open here in a moment.</p></body>');
      pdfWindow.document.close();
    }

    try {
      const params = buildMovementParams('500');
      const exportUrl = buildApiUrl(`/api/inventory/stock-movements/export/${format}?${params.toString()}`);

      const response = await apiFetch(exportUrl);

      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          throw new Error(json.message || `Stock movements ${format.toUpperCase()} export could not be created.`);
        }
        throw new Error(`Stock movements ${format.toUpperCase()} export could not be created.`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (format === 'pdf') {
        if (pdfWindow) {
          pdfWindow.location.replace(url);
        } else {
          window.open(url, '_blank');
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage('Stock movements PDF opened.');
        return;
      }

      const disposition = response.headers.get('content-disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'stock-movements.xlsx';
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      setMessage('Stock movements Excel file downloaded.');
    } catch (caught) {
      if (pdfWindow && !pdfWindow.closed) {
        const message = caught instanceof Error ? caught.message : 'Stock movements PDF could not be created.';
        pdfWindow.document.body.innerHTML = '<div style="font-family:system-ui,sans-serif;padding:32px;color:#211019;background:#fff8fb"><h1 style="font-size:20px;margin:0 0 8px">Report could not be opened</h1><p style="margin:0;color:#7b6170"></p></div>';
        pdfWindow.document.querySelector('p')!.textContent = message;
      }
      setError(caught instanceof Error ? caught.message : `Stock movements ${format.toUpperCase()} export could not be created.`);
    } finally {
      setExporting('');
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, [locationFilter, itemFilter, typeFilter, directionFilter, dateRange?.from, dateRange?.to]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItemOptions(itemSearch);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [itemSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkbench();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [tableSearch]);

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
    setItemFilter('All');
    setTypeFilter('All');
    setDirectionFilter('All');
    setDateRange(null);
    setTableSearch('');
  };

  const columns = useMemo<AdvancedTableColumn<StockMovementRow>[]>(
    () => [
      {
        id: 'movementNumber',
        header: 'Move',
        accessor: (row) => row.movementNumber,
        width: 120,
        cell: (row) => <span className="font-semibold text-akiva-text">#{row.movementNumber}</span>,
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
      {
        id: 'source',
        header: 'Source',
        accessor: (row) => `${row.typeName} ${row.transactionNumber}`,
        minWidth: 210,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.typeName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">Document #{row.transactionNumber}</div>
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
      { id: 'date', header: 'Date', accessor: (row) => row.date, width: 130 },
      {
        id: 'quantity',
        header: 'Movement',
        accessor: (row) => row.quantity,
        sortValue: (row) => row.quantity,
        align: 'right',
        width: 160,
        cell: (row) => (
          <span className={row.direction === 'In' ? 'font-semibold text-emerald-700 dark:text-emerald-300' : row.direction === 'Out' ? 'font-semibold text-rose-700 dark:text-rose-300' : 'font-semibold text-akiva-text'}>
            {row.quantity > 0 ? '+' : ''}{formatNumber(row.quantity, row.decimalPlaces || 2)} {row.units}
          </span>
        ),
      },
      {
        id: 'newOnHand',
        header: 'On hand after',
        accessor: (row) => row.newOnHand,
        align: 'right',
        width: 150,
        cell: (row) => formatNumber(row.newOnHand, row.decimalPlaces || 2),
      },
      {
        id: 'movementValue',
        header: 'Cost value',
        accessor: (row) => row.movementValue,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatMoney(row.movementValue, currency)}</span>,
      },
      {
        id: 'reference',
        header: 'Reference',
        accessor: (row) => row.reference,
        minWidth: 260,
        cell: (row) => <span className="line-clamp-2">{row.reference || '-'}</span>,
      },
      {
        id: 'direction',
        header: 'Direction',
        accessor: (row) => row.direction,
        width: 140,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${directionClass(row.direction)}`}>{row.direction === 'In' ? 'Stock in' : row.direction === 'Out' ? 'Stock out' : 'No change'}</span>,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.movementNumber,
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
    [currency]
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
                    <History className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Stock audit trail
                  </span>
                </div>
                <h1 className="text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">Stock Movements</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Review when items moved, which document created the movement, who posted it, and the balance left after posting.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter movements" title="Filter movements" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" variant="secondary" onClick={() => void exportReport('excel')} disabled={exporting !== '' || movements.length === 0}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {exporting === 'excel' ? 'Exporting...' : 'Excel'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void exportReport('pdf')} disabled={exporting !== '' || movements.length === 0}>
                  <FileText className="mr-2 h-4 w-4" />
                  {exporting === 'pdf' ? 'Exporting...' : 'PDF'}
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <span className={labelClass}>Item</span>
                    <SearchableSelect value={itemFilter} onChange={setItemFilter} onSearchChange={setItemSearch} options={itemOptions} inputClassName={inputClass} placeholder="Search item code or name" />
                  </div>
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={locationFilter} onChange={setLocationFilter} options={locationOptions} inputClassName={inputClass} placeholder="Location" />
                  </div>
                  <div>
                    <span className={labelClass}>Movement type</span>
                    <SearchableSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} inputClassName={inputClass} placeholder="Type" />
                  </div>
                  <div>
                    <span className={labelClass}>Direction</span>
                    <SearchableSelect value={directionFilter} onChange={(value) => setDirectionFilter(value as DirectionFilter)} options={directionOptions} inputClassName={inputClass} placeholder="Direction" />
                  </div>
                  <div className="md:col-span-2">
                    <span className={labelClass}>Date range</span>
                    {dateRange ? (
                      <DateRangePicker value={dateRange} onChange={setDateRange} label="Start and end date" triggerClassName="h-11 rounded-lg px-3" />
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
                  <div className="flex items-end md:col-span-2">
                    <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={clearFilters}>
                      Clear filters
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Movement lines" value={formatNumber(summary.movementLines, 0)} note={`${formatNumber(summary.itemsMoved, 0)} items in this view`} icon={History} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Stock in" value={formatNumber(summary.inboundQuantity)} note="Quantity received or added" icon={ArrowDownLeft} onClick={() => setDirectionFilter('In')} />
              <MetricCard label="Stock out" value={formatNumber(summary.outboundQuantity)} note="Quantity issued, sold or moved out" icon={ArrowUpRight} onClick={() => setDirectionFilter('Out')} />
              <MetricCard label="Cost value" value={formatMoney(summary.movementValue, currency)} note={summary.lastMovementDate ? `Last movement ${summary.lastMovementDate}` : 'No movements in this view'} icon={PackageSearch} onClick={() => setFilterOpen(true)} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Movement history</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">The newest movements are shown first. Use filters for item, location, document type or date range.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, reference or document" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-movements"
                  columns={columns}
                  rows={movements}
                  rowKey={(row) => String(row.movementNumber)}
                  emptyMessage={loading ? 'Loading stock movements...' : 'No stock movements match these filters.'}
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
        title={detailRow ? `Movement #${detailRow.movementNumber}` : 'Movement Detail'}
        size="md"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-akiva-text">{detailRow.stockId} - {detailRow.description}</div>
                  <div className="mt-1 text-sm text-akiva-text-muted">{detailRow.locationName} ({detailRow.location})</div>
                </div>
                <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${directionClass(detailRow.direction)}`}>
                  {detailRow.direction === 'In' ? 'Stock in' : detailRow.direction === 'Out' ? 'Stock out' : 'No change'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="Source" value={`${detailRow.typeName} #${detailRow.transactionNumber}`} />
                <InfoTile label="Date" value={detailRow.date} />
                <InfoTile label="Quantity" value={`${detailRow.quantity > 0 ? '+' : ''}${formatNumber(detailRow.quantity, detailRow.decimalPlaces || 2)} ${detailRow.units}`} />
                <InfoTile label="On hand after" value={formatNumber(detailRow.newOnHand, detailRow.decimalPlaces || 2)} />
                <InfoTile label="Unit cost" value={formatMoney(detailRow.unitCost, currency)} />
                <InfoTile label="Cost value" value={formatMoney(detailRow.movementValue, currency)} />
                <InfoTile label="Price" value={formatMoney(detailRow.price, currency)} />
                <InfoTile label="Discount" value={`${formatNumber(detailRow.discountPercent, 2)}%`} />
                <InfoTile label="Posted by" value={detailRow.postedBy || '-'} />
                <InfoTile label="Customer / branch" value={[detailRow.customer, detailRow.branch].filter(Boolean).join(' / ') || '-'} />
              </div>
            </section>

            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-akiva-text">Reference</h3>
              <p className="mt-2 text-sm leading-6 text-akiva-text-muted">{detailRow.reference || 'No reference recorded.'}</p>
              {detailRow.narrative ? <p className="mt-2 text-sm leading-6 text-akiva-text-muted">{detailRow.narrative}</p> : null}
            </section>

            {detailRow.serials.length > 0 ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-akiva-text">Serial or batch details</h3>
                <div className="mt-3 divide-y divide-akiva-border rounded-lg border border-akiva-border">
                  {detailRow.serials.map((serial) => (
                    <div key={serial.serialNo} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="font-semibold text-akiva-text">{serial.serialNo}</span>
                      <span className="text-akiva-text-muted">{formatNumber(serial.quantity, detailRow.decimalPlaces || 2)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
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
