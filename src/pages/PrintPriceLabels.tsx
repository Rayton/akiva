import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  FileText,
  PackageSearch,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { BarcodeGraphic } from '../components/common/BarcodeGraphic';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { LabelTemplate } from '../types/labelTemplate';

interface Option {
  value: string;
  label: string;
  code?: string;
  decimalPlaces?: number;
}

interface PriceLabelItem {
  stockId: string;
  description: string;
  longDescription: string;
  barcode: string;
  category: string;
  categoryName: string;
  price: number;
  currency: string;
  priceList: string;
  units: string;
  decimalPlaces: number;
  quantityDecimalPlaces: number;
  startDate: string;
  endDate: string;
}

interface WorkbenchPayload {
  labels: LabelTemplate[];
  categories: Option[];
  salesTypes: Option[];
  currencies: Option[];
  defaults: {
    labelId: number | null;
    category: string;
    salesType: string;
    currency: string;
    effectiveDate: string;
    labelsPerItem: number;
  };
  summary: {
    pricedItems: number;
    templates: number;
    priceLists: number;
  };
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

interface ItemsResponse {
  success: boolean;
  message?: string;
  data?: PriceLabelItem[];
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number, currency = 'TZS', decimalPlaces = 2): string {
  return `${currency} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value || 0)}`;
}

function labelCapacity(template?: LabelTemplate | null): number {
  if (!template) return 0;
  const rows = template.rows ?? Math.max(1, Math.floor((template.pageHeight - template.topMargin) / template.rowHeight));
  const columns = template.columns ?? Math.max(1, Math.floor((template.pageWidth - template.leftMargin) / template.columnWidth));
  return Math.max(1, rows * columns);
}

export function PrintPriceLabels() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [items, setItems] = useState<PriceLabelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [labelId, setLabelId] = useState('');
  const [category, setCategory] = useState('All');
  const [salesType, setSalesType] = useState('');
  const [currency, setCurrency] = useState('TZS');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [labelsPerItem, setLabelsPerItem] = useState('1');
  const [selectedStockIds, setSelectedStockIds] = useState<Set<string>>(new Set());

  const labels = payload?.labels ?? [];
  const selectedLabel = labels.find((label) => String(label.id) === labelId) ?? labels[0] ?? null;
  const labelOptions = useMemo(() => labels.map((label) => ({ value: String(label.id), label: label.description })), [labels]);
  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...(payload?.categories ?? [])], [payload?.categories]);
  const selectedItems = useMemo(() => items.filter((item) => selectedStockIds.has(item.stockId)), [items, selectedStockIds]);
  const copiesPerItem = Math.max(1, Number(labelsPerItem) || 1);
  const selectedLabelCount = selectedItems.length * copiesPerItem;
  const capacity = labelCapacity(selectedLabel);
  const estimatedPages = capacity > 0 ? Math.ceil(selectedLabelCount / capacity) : 0;

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/price-labels/workbench'));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Price labels could not be loaded.');
      }

      setPayload(json.data);
      setLabelId(String(json.data.defaults.labelId ?? json.data.labels[0]?.id ?? ''));
      setCategory(json.data.defaults.category || 'All');
      setSalesType(json.data.defaults.salesType || json.data.salesTypes[0]?.value || '');
      setCurrency(json.data.defaults.currency || json.data.currencies[0]?.value || 'TZS');
      setEffectiveDate(json.data.defaults.effectiveDate);
      setLabelsPerItem(String(json.data.defaults.labelsPerItem || 1));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Price labels could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    if (!salesType || !currency || !effectiveDate) {
      setItems([]);
      setSelectedStockIds(new Set());
      return;
    }

    setItemsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        category,
        salesType,
        currency,
        effectiveDate,
        q: tableSearch.trim(),
        limit: '200',
      });
      const response = await apiFetch(buildApiUrl(`/api/inventory/price-label-items?${params.toString()}`));
      const json = (await response.json()) as ItemsResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Price label items could not be loaded.');
      }

      const nextItems = json.data ?? [];
      setItems(nextItems);
      setSelectedStockIds((current) => new Set(nextItems.filter((item) => current.has(item.stockId)).map((item) => item.stockId)));
    } catch (caught) {
      setItems([]);
      setError(caught instanceof Error ? caught.message : 'Price label items could not be loaded.');
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadItems();
    }, 260);
    return () => window.clearTimeout(timer);
  }, [category, salesType, currency, effectiveDate, tableSearch]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const toggleSelected = (stockId: string) => {
    setSelectedStockIds((current) => {
      const next = new Set(current);
      if (next.has(stockId)) {
        next.delete(stockId);
      } else {
        next.add(stockId);
      }
      return next;
    });
  };

  const selectVisibleItems = () => {
    setSelectedStockIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = items.length > 0 && items.every((item) => next.has(item.stockId));
      if (allVisibleSelected) {
        items.forEach((item) => next.delete(item.stockId));
      } else {
        items.forEach((item) => next.add(item.stockId));
      }
      return next;
    });
  };

  const clearFilters = () => {
    setCategory('All');
    setTableSearch('');
    setSelectedStockIds(new Set());
  };

  const printLabels = async () => {
    if (!selectedLabel || selectedItems.length === 0) {
      setError('Select at least one item to print.');
      return;
    }

    const pdfWindow = window.open('', '_blank');
    setPrinting(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/price-labels/print'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelId: selectedLabel.id,
          category,
          salesType,
          currency,
          effectiveDate,
          labelsPerItem: copiesPerItem,
          stockIds: selectedItems.map((item) => item.stockId),
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const json = await response.json();
          throw new Error(json.message || 'Price labels could not be printed.');
        }
        throw new Error('Price labels could not be printed.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (pdfWindow) {
        pdfWindow.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      setMessage(`${formatNumber(selectedLabelCount)} labels prepared for printing.`);
    } catch (caught) {
      pdfWindow?.close();
      setError(caught instanceof Error ? caught.message : 'Price labels could not be printed.');
    } finally {
      setPrinting(false);
    }
  };

  const columns = useMemo<AdvancedTableColumn<PriceLabelItem>[]>(
    () => [
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
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName, minWidth: 190 },
      {
        id: 'barcode',
        header: 'Barcode',
        accessor: (row) => row.barcode,
        minWidth: 170,
        cell: (row) => <span className="font-mono text-sm text-akiva-text">{row.barcode || '-'}</span>,
      },
      {
        id: 'price',
        header: 'Price',
        accessor: (row) => row.price,
        sortValue: (row) => row.price,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold text-akiva-text">{formatMoney(row.price, row.currency, row.decimalPlaces)}</span>,
      },
      { id: 'units', header: 'Unit', accessor: (row) => row.units || '-', width: 120 },
      {
        id: 'startDate',
        header: 'Effective from',
        accessor: (row) => row.startDate,
        width: 150,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        align: 'right',
        sticky: 'right',
        width: 150,
        cell: (row) => {
          const selected = selectedStockIds.has(row.stockId);
          return (
            <button
              type="button"
              onClick={() => toggleSelected(row.stockId)}
              className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition ${
                selected
                  ? 'bg-akiva-accent text-white hover:bg-akiva-accent-strong'
                  : 'border border-akiva-border bg-akiva-surface-raised text-akiva-text hover:border-akiva-accent hover:text-akiva-accent-text'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              {selected ? 'Selected' : 'Select'}
            </button>
          );
        },
      },
    ],
    [selectedStockIds]
  );

  const previewItem = selectedItems[0] ?? items[0] ?? null;

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <Tags className="h-4 w-4 text-akiva-accent-text" />
                    Inventory reports
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Price list labels
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Print Price Labels
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Choose a label format, select current prices, and print shelf or item labels from the approved price list.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadItems()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${itemsLoading || loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Label setup" title="Label setup" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" onClick={printLabels} disabled={printing || selectedItems.length === 0 || !selectedLabel}>
                  <Printer className="mr-2 h-4 w-4" />
                  {printing ? 'Preparing...' : 'Print labels'}
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <span className={labelClass}>Label format</span>
                    <SearchableSelect value={labelId} onChange={setLabelId} options={labelOptions} inputClassName={inputClass} placeholder="Choose label format" />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Category</span>
                    <SearchableSelect value={category} onChange={setCategory} options={categoryOptions} inputClassName={inputClass} placeholder="Choose category" />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Price list</span>
                    <SearchableSelect value={salesType} onChange={setSalesType} options={payload?.salesTypes ?? []} inputClassName={inputClass} placeholder="Choose price list" />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Currency</span>
                    <SearchableSelect value={currency} onChange={setCurrency} options={payload?.currencies ?? []} inputClassName={inputClass} placeholder="Currency" />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Effective date</span>
                    <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Labels per item</span>
                    <input type="number" min={1} max={500} value={labelsPerItem} onChange={(event) => setLabelsPerItem(event.target.value)} className={`${inputClass} text-right font-semibold`} />
                  </label>
                  <div className="flex items-end gap-2 xl:col-span-2">
                    <Button type="button" variant="secondary" onClick={clearFilters} className="w-full sm:w-auto">
                      Clear
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void loadItems()} className="w-full sm:w-auto">
                      Apply
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Priced items" value={formatNumber(items.length)} note="Items matching the current setup" icon={PackageSearch} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Selected labels" value={formatNumber(selectedLabelCount)} note={`${formatNumber(selectedItems.length)} items x ${copiesPerItem} each`} icon={CheckSquare} onClick={selectVisibleItems} />
              <MetricCard label="Labels per sheet" value={formatNumber(capacity)} note={selectedLabel ? selectedLabel.description : 'Choose a label format'} icon={Tags} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Estimated pages" value={formatNumber(estimatedPages)} note={selectedLabelCount > 0 ? 'Based on selected labels' : 'Select items to print'} icon={FileText} onClick={printLabels} disabled={selectedItems.length === 0} />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Items with current prices</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Select the items that need labels. Prices are taken from the chosen price list and date.</p>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto md:items-center">
                    <button type="button" onClick={selectVisibleItems} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text">
                      <CheckSquare className="h-4 w-4" />
                      {items.length > 0 && items.every((item) => selectedStockIds.has(item.stockId)) ? 'Clear visible' : 'Select visible'}
                    </button>
                    <div className="relative w-full md:w-80">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                      <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, barcode or description" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <AdvancedTable
                    tableId="price-label-items"
                    columns={columns}
                    rows={items}
                    rowKey={(row) => row.stockId}
                    emptyMessage={itemsLoading || loading ? 'Loading priced items...' : 'No current priced items match this setup.'}
                    loading={itemsLoading || loading}
                    initialPageSize={10}
                    initialScroll="left"
                  />
                </div>
              </section>

              <aside className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Label preview</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Preview uses the first selected item.</p>
                  </div>
                  <Tags className="h-5 w-5 text-akiva-accent-text" />
                </div>
                <LabelPreview template={selectedLabel} item={previewItem} currency={currency} />
                <div className="mt-4 space-y-2 text-sm text-akiva-text-muted">
                  <InfoRow label="Format" value={selectedLabel?.description ?? '-'} />
                  <InfoRow label="Sheet" value={selectedLabel ? `${selectedLabel.pageWidth} x ${selectedLabel.pageHeight} mm` : '-'} />
                  <InfoRow label="Each label" value={selectedLabel ? `${selectedLabel.width} x ${selectedLabel.height} mm` : '-'} />
                  <InfoRow label="Copies" value={selectedLabelCount > 0 ? `${selectedLabelCount} labels` : '-'} />
                </div>
              </aside>
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
  onClick,
  disabled = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70 disabled:cursor-not-allowed disabled:opacity-75">
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

function LabelPreview({ template, item, currency }: { template?: LabelTemplate | null; item?: PriceLabelItem | null; currency: string }) {
  if (!template) {
    return <div className="mt-4 rounded-lg border border-dashed border-akiva-border p-6 text-sm text-akiva-text-muted">Choose a label format to preview.</div>;
  }

  const fields = template.fields.length > 0 ? template.fields : [
    { fieldValue: 'itemcode', hPos: 5, vPos: 5, fontSize: 10, barcode: true },
    { fieldValue: 'itemdescription', hPos: 5, vPos: 14, fontSize: 8, barcode: false },
    { fieldValue: 'price', hPos: 5, vPos: 23, fontSize: 11, barcode: false },
  ];
  const sortedFields = [...fields].sort((a, b) => a.vPos - b.vPos || a.hPos - b.hPos);

  const textFor = (fieldValue: string) => {
    const key = fieldValue.toLowerCase();
    if (!item) {
      if (key === 'price') return `${currency} 0.00`;
      if (key === 'itemdescription') return 'Item description';
      if (key === 'barcode') return 'BARCODE';
      return 'ITEMCODE';
    }
    if (key === 'itemcode') return item.stockId;
    if (key === 'itemdescription') return item.description;
    if (key === 'price') return formatMoney(item.price, item.currency, item.decimalPlaces);
    if (key === 'barcode') return item.barcode || item.stockId;
    if (key === 'logo') return 'Logo';
    return '';
  };

  return (
    <div className="mt-4 rounded-xl border border-akiva-border bg-white p-4 shadow-inner dark:bg-slate-950/40">
      <div
        className="relative mx-auto overflow-hidden rounded border border-akiva-border bg-white shadow-sm dark:bg-slate-900"
        style={{
          width: '100%',
          maxWidth: 260,
          aspectRatio: `${Math.max(1, template.width)} / ${Math.max(1, template.height)}`,
        }}
      >
        {sortedFields.map((field, index) => {
          const left = Math.min(94, Math.max(0, (field.hPos / template.width) * 100));
          const top = Math.min(90, Math.max(0, (field.vPos / template.height) * 100));
          const isPrice = field.fieldValue.toLowerCase() === 'price';
          const isBarcode = field.barcode || field.fieldValue.toLowerCase() === 'barcode';
          const text = textFor(field.fieldValue);
          const nextField = sortedFields.find((candidate, candidateIndex) => candidateIndex > index && candidate.vPos > field.vPos);
          const availableHeight = Math.max(
            3,
            Math.min(
              template.height - field.vPos - 1,
              nextField ? nextField.vPos - field.vPos - 1 : template.height - field.vPos - 1,
            ),
          );
          const width = Math.max(8, 100 - left - 3);
          const height = Math.max(12, Math.min(40, (availableHeight / template.height) * 100));

          if (isBarcode) {
            return (
              <span
                key={`${field.fieldValue}-${index}`}
                className="absolute block overflow-hidden bg-white"
                style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
              >
                <BarcodeGraphic value={text} showText={availableHeight > 12} />
              </span>
            );
          }

          return (
            <span
              key={`${field.fieldValue}-${index}`}
              className={`absolute max-w-[88%] truncate leading-none ${isPrice ? 'font-bold text-akiva-accent-text' : 'text-akiva-text'}`}
              style={{ left: `${left}%`, top: `${top}%`, fontSize: Math.max(9, Math.min(18, field.fontSize + 3)) }}
            >
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
      <span>{label}</span>
      <span className="min-w-0 truncate font-semibold text-akiva-text">{value}</span>
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
