import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, DollarSign, Layers3, Loader2, Percent, RefreshCw, Save, Search, Tags } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { applyMarkupPrices, fetchMarkupPriceWorkbench, previewMarkupPrices } from '../data/markupPricesApi';
import type { MarkupCostBasis, MarkupPriceForm, MarkupPriceLookupOption, MarkupPriceRow, MarkupPriceRunPayload, MarkupPriceWorkbenchPayload } from '../types/markupPrices';

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

function emptyForm(): MarkupPriceForm {
  return {
    priceList: '',
    currency: '',
    costBasis: 'standard-cost',
    basePriceList: '',
    categoryFrom: '',
    categoryTo: '',
    roundingFactor: 0.01,
    markupPercent: 0,
    startDate: '',
    endDate: '',
  };
}

function optionLabel(option: MarkupPriceLookupOption): string {
  return option.code === option.name ? option.name : `${option.code} - ${option.name}`;
}

function currencyLabel(option: MarkupPriceLookupOption): string {
  const base = optionLabel(option);
  return option.rate === undefined ? base : `${base} (${formatNumber(option.rate, 6)})`;
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value || 0);
}

function formatMoney(value: number | null, currency = '', decimals = 2): string {
  if (value === null || value === undefined) return '-';
  return `${currency} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.max(2, decimals),
  }).format(value || 0)}`.trim();
}

function toNumber(value: string): number {
  if (value.trim() === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function statusBadgeClass(row: MarkupPriceRow): string {
  if (row.status === 'ready' && row.action === 'insert') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  if (row.status === 'ready') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200';
  return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200';
}

function actionLabel(row: MarkupPriceRow): string {
  if (row.status !== 'ready') return row.reason || 'Skipped';
  if (row.action === 'replace') return 'Replace current';
  if (row.action === 'update') return 'Update same date';
  return 'Insert new';
}

export function MarkupPrices() {
  const [payload, setPayload] = useState<MarkupPriceWorkbenchPayload | null>(null);
  const [form, setForm] = useState<MarkupPriceForm>(() => emptyForm());
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => getDefaultDateRange());
  const [preview, setPreview] = useState<MarkupPriceRunPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchMarkupPriceWorkbench();
      setPayload(nextPayload);
      setForm(nextPayload.defaults);
      setDateRange({
        preset: 'last-3-months',
        from: nextPayload.defaults.startDate,
        to: nextPayload.defaults.endDate,
      });
      setPreview(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Markup price workbench could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, []);

  useEffect(() => {
    document.title = 'Cost-Based Prices | Akiva';
  }, []);

  const stats = payload?.stats ?? { totalItems: 0, priceRows: 0, pricedItems: 0, priceLists: 0, currencies: 0, categories: 0 };
  const summary = preview?.summary ?? {
    candidateCount: 0,
    readyCount: 0,
    skippedCount: 0,
    insertCount: 0,
    replaceCount: 0,
    updateCount: 0,
    currentRowsClosed: 0,
    insertedCount: 0,
    updatedPriceCount: 0,
  };

  const priceListOptions = useMemo(
    () => (payload?.lookups.priceLists ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    [payload]
  );

  const basePriceListOptions = useMemo(
    () => [
      { value: '', label: 'Select base price list', disabled: form.costBasis === 'other-price-list' },
      ...(payload?.lookups.priceLists ?? [])
        .filter((option) => option.code !== form.priceList)
        .map((option) => ({ value: option.code, label: optionLabel(option) })),
    ],
    [form.costBasis, form.priceList, payload]
  );

  const currencyOptions = useMemo(
    () => (payload?.lookups.currencies ?? []).map((option) => ({ value: option.code, label: currencyLabel(option) })),
    [payload]
  );

  const categoryOptions = useMemo(
    () => (payload?.lookups.categories ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    [payload]
  );

  const costBasisOptions = useMemo(
    () => (payload?.lookups.costBasisOptions ?? []).map((option) => ({ value: option.code, label: option.name })),
    [payload]
  );

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return (preview?.rows ?? []).filter((row) => {
      if (statusFilter === 'ready' && row.status !== 'ready') return false;
      if (statusFilter === 'skipped' && row.status !== 'skipped') return false;
      if (statusFilter === 'replace' && row.action !== 'replace') return false;
      if (statusFilter === 'insert' && row.action !== 'insert') return false;
      if (!needle) return true;

      return [
        row.stockId,
        row.description,
        row.categoryId,
        row.categoryName,
        row.reason,
        actionLabel(row),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [preview, searchTerm, statusFilter]);

  const setField = <K extends keyof MarkupPriceForm>(fieldName: K, value: MarkupPriceForm[K]) => {
    setForm((previous) => {
      const next = { ...previous, [fieldName]: value };
      if (fieldName === 'priceList' && next.basePriceList === value) {
        next.basePriceList = '';
      }
      if (fieldName === 'costBasis' && value !== 'other-price-list') {
        next.basePriceList = '';
      }
      return next;
    });
    setPreview(null);
    setMessage('');
  };

  const setEffectiveDateRange = (range: DateRangeValue) => {
    setDateRange(range);
    setForm((previous) => ({
      ...previous,
      startDate: range.from,
      endDate: range.to,
    }));
    setPreview(null);
    setMessage('');
  };

  const submitPreview = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setPreviewing(true);
    setError('');
    setMessage('');
    try {
      const response = await previewMarkupPrices(form);
      if (response.data) setPreview(response.data);
      setMessage('Preview calculated.');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Markup price preview could not be calculated.');
    } finally {
      setPreviewing(false);
    }
  };

  const applyPrices = async () => {
    if (!preview || preview.summary.readyCount === 0) return;

    const confirmed = await confirm({
      title: 'Apply Markup Prices',
      description: 'This will close current matching price rows where needed and save the new price rows.',
      detail: `${preview.summary.readyCount.toLocaleString()} ready, ${preview.summary.skippedCount.toLocaleString()} skipped`,
      confirmLabel: 'Apply Prices',
      tone: 'warning',
    });
    if (!confirmed) return;

    setApplying(true);
    setError('');
    setMessage('');
    try {
      const response = await applyMarkupPrices(form);
      if (response.data) setPreview(response.data);
      setMessage(response.message ?? 'Markup prices applied.');
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Markup prices could not be applied.');
    } finally {
      setApplying(false);
    }
  };

  const columns = useMemo<AdvancedTableColumn<MarkupPriceRow>[]>(
    () => [
      { id: 'stockId', header: 'Item', accessor: (row) => row.stockId, width: 160 },
      { id: 'description', header: 'Description', accessor: (row) => row.description, width: 300 },
      { id: 'category', header: 'Category', accessor: (row) => `${row.categoryId} ${row.categoryName}`, cell: (row) => row.categoryName, width: 220 },
      { id: 'basisCost', header: 'Basis', accessor: (row) => row.basisCost ?? '', cell: (row) => formatMoney(row.basisCost, row.currency), align: 'right', width: 150 },
      { id: 'currentPrice', header: 'Current', accessor: (row) => row.currentPrice ?? '', cell: (row) => formatMoney(row.currentPrice, row.currency), align: 'right', width: 150 },
      {
        id: 'newPrice',
        header: 'New Price',
        accessor: (row) => row.newPrice ?? '',
        cell: (row) => <span className="font-semibold text-akiva-text">{formatMoney(row.newPrice, row.currency)}</span>,
        align: 'right',
        width: 150,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: actionLabel,
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(row)}`}>
            {actionLabel(row)}
          </span>
        ),
        width: 180,
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Inventory Maintenance</p>
              <h1 className="mt-1 text-xl font-bold leading-tight text-akiva-text sm:text-[1.625rem]">Cost-Based Prices</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                Calculate stock prices from cost, preferred supplier data, or another price list.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadWorkbench()} disabled={loading || previewing || applying}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
            {[
              ['Items', stats.totalItems, Tags],
              ['Priced Items', stats.pricedItems, DollarSign],
              ['Price Rows', stats.priceRows, Layers3],
              ['Ready', summary.readyCount, CheckCircle2],
              ['Skipped', summary.skippedCount, Layers3],
              ['To Replace', summary.replaceCount, Percent],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof Tags;
              return (
                <div key={String(label)} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{String(label)}</p>
                    <StatIcon className="h-4 w-4 text-akiva-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-akiva-text">{Number(value).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <form onSubmit={submitPreview} className="grid gap-4">
            <div className="grid gap-3 min-[900px]:grid-cols-3 min-[1300px]:grid-cols-4">
              <label className="block text-sm font-medium text-akiva-text">
                Price list
                <SearchableSelect className="mt-1" value={form.priceList} onChange={(value) => setField('priceList', value)} options={priceListOptions} required />
              </label>
              <label className="block text-sm font-medium text-akiva-text">
                Currency
                <SearchableSelect className="mt-1" value={form.currency} onChange={(value) => setField('currency', value)} options={currencyOptions} required />
              </label>
              <label className="block text-sm font-medium text-akiva-text">
                Cost basis
                <SearchableSelect className="mt-1" value={form.costBasis} onChange={(value) => setField('costBasis', value as MarkupCostBasis)} options={costBasisOptions} required />
              </label>
              <label className="block text-sm font-medium text-akiva-text">
                Base price list
                <SearchableSelect
                  className="mt-1"
                  value={form.basePriceList}
                  onChange={(value) => setField('basePriceList', value)}
                  options={basePriceListOptions}
                  disabled={form.costBasis !== 'other-price-list'}
                  required={form.costBasis === 'other-price-list'}
                />
              </label>
              <label className="block text-sm font-medium text-akiva-text">
                Category from
                <SearchableSelect className="mt-1" value={form.categoryFrom} onChange={(value) => setField('categoryFrom', value)} options={categoryOptions} required />
              </label>
              <label className="block text-sm font-medium text-akiva-text">
                Category to
                <SearchableSelect className="mt-1" value={form.categoryTo} onChange={(value) => setField('categoryTo', value)} options={categoryOptions} required />
              </label>
              <label className="block text-sm font-medium text-akiva-text">
                Rounding factor
                <input className={`${inputClassName} mt-1`} type="number" min="0.0001" step="0.0001" value={String(form.roundingFactor)} onChange={(event) => setField('roundingFactor', toNumber(event.target.value))} required />
              </label>
              <label className="block text-sm font-medium text-akiva-text">
                Markup %
                <input className={`${inputClassName} mt-1`} type="number" step="0.01" value={String(form.markupPercent)} onChange={(event) => setField('markupPercent', toNumber(event.target.value))} required />
              </label>
              <div className="block text-sm font-medium text-akiva-text min-[900px]:col-span-2">
                <span>Start and end date</span>
                <DateRangePicker value={dateRange} onChange={setEffectiveDateRange} label="Start and end date" triggerClassName="mt-1 h-11 rounded-lg px-3" />
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="submit" disabled={loading || previewing || applying}>
                <span className="inline-flex items-center justify-center gap-2">
                  {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                  Preview
                </span>
              </Button>
              <Button variant="success" onClick={() => void applyPrices()} disabled={!preview || preview.summary.readyCount === 0 || loading || previewing || applying}>
                <span className="inline-flex items-center justify-center gap-2">
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Apply Prices
                </span>
              </Button>
            </div>
          </form>

          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(18rem,1fr)_minmax(10rem,14rem)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder="Search item, description, category, or status..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All rows' },
                { value: 'ready', label: 'Ready' },
                { value: 'insert', label: 'Insert new' },
                { value: 'replace', label: 'Replace current' },
                { value: 'skipped', label: 'Skipped' },
              ]}
              inputClassName={inputClassName}
              placeholder="Status"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">Price Preview</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                {filteredRows.length.toLocaleString()} shown from {(preview?.rows.length ?? 0).toLocaleString()} calculated rows
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId="markup-price-preview"
              columns={columns}
              rows={filteredRows}
              rowKey={(row) => row.stockId}
              loading={loading || previewing}
              loadingMessage={loading ? 'Loading markup price workbench...' : 'Calculating markup prices...'}
              emptyMessage="Preview prices to see matching inventory items."
              initialPageSize={25}
            />
          </div>

          {preview ? (
            <div className="mt-4 grid gap-3 text-sm text-akiva-text-muted sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                <p className="font-semibold text-akiva-text">New rows</p>
                <p className="mt-1">{summary.insertCount.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                <p className="font-semibold text-akiva-text">Current rows to close</p>
                <p className="mt-1">{summary.replaceCount.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                <p className="font-semibold text-akiva-text">Rows inserted</p>
                <p className="mt-1">{summary.insertedCount.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                <p className="font-semibold text-akiva-text">Rows updated</p>
                <p className="mt-1">{summary.updatedPriceCount.toLocaleString()}</p>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {confirmationDialog}
    </div>
  );
}
