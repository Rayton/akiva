import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  PackageSearch,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DatePicker } from '../components/common/DatePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface LocationOption {
  value: string;
  label: string;
  code: string;
}

interface TagOption {
  value: string;
  label: string;
}

interface StockBalance {
  onHand: number;
  available: number;
  reorderLevel: number;
  bin: string;
}

interface AdjustmentItem {
  stockId: string;
  description: string;
  longDescription: string;
  units: string;
  category: string;
  decimalPlaces: number;
  controlled: boolean;
  serialised: boolean;
  unitCost: number;
  balance: StockBalance;
}

interface StockAdjustmentRow {
  adjustmentNumber: number;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  date: string;
  quantity: number;
  newOnHand: number;
  unitCost: number;
  valueImpact: number;
  reason: string;
  postedBy: string;
  units: string;
  direction: 'Increase' | 'Decrease';
}

interface WorkbenchPayload {
  nextAdjustmentNumber: number;
  locations: LocationOption[];
  tags: TagOption[];
  recentAdjustments: StockAdjustmentRow[];
  currency: string;
  settings: {
    prohibitNegativeStock: boolean;
  };
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

interface ItemSearchResponse {
  success: boolean;
  message?: string;
  data?: AdjustmentItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface AdjustmentResponse {
  success: boolean;
  message?: string;
  data?: {
    nextAdjustmentNumber?: number;
    recentAdjustments?: StockAdjustmentRow[];
  };
  adjustment?: StockAdjustmentRow;
}

type DirectionFilter = 'All' | 'Increase' | 'Decrease';

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number, currency = 'TZS'): string {
  return `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)}`;
}

function numericValue(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

function directionClass(direction: StockAdjustmentRow['direction']): string {
  if (direction === 'Increase') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200';
}

export function StockAdjustments() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('All');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('All');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<StockAdjustmentRow | null>(null);

  const [formLocation, setFormLocation] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(todayIso());
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [tag, setTag] = useState('0');
  const [itemQuery, setItemQuery] = useState('');
  const [itemFocused, setItemFocused] = useState(false);
  const [itemLoading, setItemLoading] = useState(false);
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AdjustmentItem | null>(null);

  const locations = payload?.locations ?? [];
  const tags = payload?.tags ?? [];
  const currency = payload?.currency ?? 'TZS';
  const recentAdjustments = payload?.recentAdjustments ?? [];
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...locations], [locations]);
  const formLocationOptions = useMemo(() => locations.map((location) => ({ value: location.value, label: `${location.label} (${location.code})` })), [locations]);
  const tagOptions = useMemo(() => [{ value: '0', label: 'No tag' }, ...tags], [tags]);

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (locationFilter !== 'All') params.set('location', locationFilter);
      if (tableSearch.trim()) params.set('q', tableSearch.trim());
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiFetch(buildApiUrl(`/api/inventory/adjustments/workbench${query}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Inventory adjustments could not be loaded.');
      }

      setPayload(json.data);
      setFormLocation((current) => current || json.data?.locations?.[0]?.value || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory adjustments could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async (query: string, location: string) => {
    if (!location) {
      setItems([]);
      return;
    }

    setItemLoading(true);
    try {
      const params = new URLSearchParams({ location, q: query, limit: '20' });
      const response = await apiFetch(buildApiUrl(`/api/inventory/adjustment-items?${params.toString()}`));
      const json = (await response.json()) as ItemSearchResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Items could not be loaded.');
      }
      setItems(json.data ?? []);
    } catch (caught) {
      setItems([]);
      setError(caught instanceof Error ? caught.message : 'Items could not be loaded.');
    } finally {
      setItemLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, [locationFilter]);

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

  useEffect(() => {
    if (!itemFocused || !formLocation) return;
    const timer = window.setTimeout(() => {
      void loadItems(itemQuery, formLocation);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [formLocation, itemFocused, itemQuery]);

  const filteredRows = useMemo(() => {
    const direction = directionFilter;
    return recentAdjustments.filter((row) => direction === 'All' || row.direction === direction);
  }, [directionFilter, recentAdjustments]);

  const adjustmentsThisMonth = recentAdjustments.filter((row) => row.date.slice(0, 7) === todayIso().slice(0, 7)).length;
  const netValueImpact = recentAdjustments.reduce((sum, row) => sum + row.valueImpact, 0);
  const reductionsCount = recentAdjustments.filter((row) => row.quantity < 0).length;
  const quantityChange = numericValue(quantity);
  const onHandBefore = selectedItem?.balance?.onHand ?? 0;
  const onHandAfter = selectedItem ? onHandBefore + quantityChange : 0;
  const valueImpact = selectedItem ? quantityChange * selectedItem.unitCost : 0;
  const canPost =
    Boolean(formLocation) &&
    Boolean(selectedItem) &&
    Boolean(adjustmentDate) &&
    quantityChange !== 0 &&
    reason.trim() !== '' &&
    !(selectedItem?.controlled || selectedItem?.serialised) &&
    !(payload?.settings.prohibitNegativeStock && selectedItem && onHandAfter < 0);

  const resetForm = () => {
    setAdjustmentDate(todayIso());
    setQuantity('');
    setReason('');
    setTag('0');
    setItemQuery('');
    setItems([]);
    setSelectedItem(null);
  };

  const openCreate = () => {
    resetForm();
    setFormLocation((current) => current || locations[0]?.value || '');
    setCreateOpen(true);
  };

  const postAdjustment = async () => {
    if (!canPost || !selectedItem) {
      setError('Choose an item, quantity, date, and reason before posting.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/adjustments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockId: selectedItem.stockId,
          location: formLocation,
          quantity: quantityChange,
          date: adjustmentDate,
          reason: reason.trim(),
          tag: Number(tag || 0),
        }),
      });
      const json = (await response.json()) as AdjustmentResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Inventory adjustment could not be posted.');
      }

      setPayload((current) => current ? {
        ...current,
        nextAdjustmentNumber: json.data?.nextAdjustmentNumber ?? current.nextAdjustmentNumber,
        recentAdjustments: json.data?.recentAdjustments ?? current.recentAdjustments,
      } : current);
      setCreateOpen(false);
      resetForm();
      setMessage(json.adjustment ? `Adjustment ${json.adjustment.adjustmentNumber} posted.` : 'Inventory adjustment posted.');
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory adjustment could not be posted.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<AdvancedTableColumn<StockAdjustmentRow>[]>(
    () => [
      {
        id: 'adjustmentNumber',
        header: 'Adjustment',
        accessor: (row) => row.adjustmentNumber,
        width: 130,
        cell: (row) => <span className="font-semibold text-akiva-text">#{row.adjustmentNumber}</span>,
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
        header: 'Change',
        accessor: (row) => row.quantity,
        align: 'right',
        width: 120,
        cell: (row) => <span className={row.quantity >= 0 ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'font-semibold text-rose-700 dark:text-rose-300'}>{row.quantity >= 0 ? '+' : ''}{formatNumber(row.quantity)}</span>,
      },
      {
        id: 'valueImpact',
        header: 'Value',
        accessor: (row) => row.valueImpact,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold">{formatMoney(row.valueImpact, currency)}</span>,
      },
      {
        id: 'direction',
        header: 'Type',
        accessor: (row) => row.direction,
        width: 130,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${directionClass(row.direction)}`}>{row.direction}</span>,
      },
      { id: 'reason', header: 'Reason', accessor: (row) => row.reason, minWidth: 260 },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.adjustmentNumber,
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
                    <ClipboardCheck className="h-4 w-4 text-akiva-accent-text" />
                    Inventory transactions
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <PackageSearch className="h-4 w-4 text-akiva-accent-text" />
                    Stock corrections
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Inventory Adjustments
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Correct stock on hand with a documented reason and ledger impact.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter adjustments" title="Filter adjustments" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  New adjustment
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <SearchableSelect value={locationFilter} onChange={setLocationFilter} options={locationOptions} inputClassName={inputClass} placeholder="Location" />
                  <SearchableSelect value={directionFilter} onChange={(value) => setDirectionFilter(value as DirectionFilter)} options={[
                    { value: 'All', label: 'All adjustments' },
                    { value: 'Increase', label: 'Increases' },
                    { value: 'Decrease', label: 'Decreases' },
                  ]} inputClassName={inputClass} placeholder="Type" />
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="This month" value={String(adjustmentsThisMonth)} note="Corrections posted this month" icon={ClipboardCheck} onClick={() => setDirectionFilter('All')} />
              <MetricCard label="Net value impact" value={formatMoney(netValueImpact, currency)} note="Based on recent corrections" icon={netValueImpact < 0 ? TrendingDown : TrendingUp} onClick={() => setDirectionFilter('All')} />
              <MetricCard label="Reductions" value={String(reductionsCount)} note="Stock decreases in the list" icon={TrendingDown} onClick={() => setDirectionFilter('Decrease')} />
              <MetricCard label="Stock protection" value={payload?.settings.prohibitNegativeStock ? 'On' : 'Off'} note={payload?.settings.prohibitNegativeStock ? 'Prevents negative balances' : 'Negative balances are allowed'} icon={ShieldCheck} onClick={() => setFilterOpen(true)} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Recent adjustments</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Every posted correction keeps the quantity, reason and value impact visible.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadWorkbench(); }} className={`${inputClass} pl-10`} placeholder="Search item, reason or number" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="inventory-adjustments"
                  columns={columns}
                  rows={filteredRows}
                  rowKey={(row) => String(row.adjustmentNumber)}
                  emptyMessage={loading ? 'Loading adjustments...' : 'No adjustments match these filters.'}
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
        isOpen={createOpen}
        onClose={() => !saving && setCreateOpen(false)}
        title="Create Inventory Adjustment"
        size="md"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={postAdjustment} disabled={saving || !canPost}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {saving ? 'Posting...' : 'Post adjustment'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Location</span>
                <SearchableSelect
                  value={formLocation}
                  onChange={(value) => {
                    setFormLocation(value);
                    setSelectedItem(null);
                    setItemQuery('');
                    setItems([]);
                  }}
                  options={formLocationOptions}
                  inputClassName={inputClass}
                  placeholder="Choose location"
                />
              </label>
              <label className="relative block">
                <span className={labelClass}>Item</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    value={itemFocused ? itemQuery : selectedItem ? `${selectedItem.stockId} - ${selectedItem.description}` : itemQuery}
                    onFocus={() => {
                      setItemFocused(true);
                      setItemQuery('');
                      void loadItems('', formLocation);
                    }}
                    onChange={(event) => {
                      setSelectedItem(null);
                      setItemQuery(event.target.value);
                    }}
                    onBlur={() => window.setTimeout(() => setItemFocused(false), 160)}
                    className={`${inputClass} pl-10`}
                    placeholder={formLocation ? 'Search or choose item' : 'Choose location first'}
                    disabled={!formLocation}
                    autoComplete="off"
                  />
                </div>
                {itemFocused ? (
                  <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-akiva-border bg-akiva-surface-raised py-1 text-sm text-akiva-text shadow-xl">
                    {itemLoading ? (
                      <div className="px-3 py-3 text-akiva-text-muted">Loading items...</div>
                    ) : items.length === 0 ? (
                      <div className="px-3 py-3 text-akiva-text-muted">No items found</div>
                    ) : items.map((item) => (
                      <button
                        type="button"
                        key={item.stockId}
                        className="block w-full px-3 py-2 text-left transition hover:bg-akiva-accent-soft"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSelectedItem(item);
                          setItemQuery('');
                          setItemFocused(false);
                        }}
                      >
                        <span className="block font-semibold text-akiva-text">{item.stockId} - {item.description}</span>
                        <span className="mt-1 block text-xs text-akiva-text-muted">
                          {formatNumber(item.balance?.onHand ?? 0, item.decimalPlaces || 2)} {item.units} on hand . {formatMoney(item.unitCost, currency)} each
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="block">
                <span className={labelClass}>Adjustment date</span>
                <DatePicker value={adjustmentDate} onChange={setAdjustmentDate} inputClassName={inputClass} />
              </label>
              <label className="block">
                <span className={labelClass}>Quantity change</span>
                <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" className={`${inputClass} text-right font-semibold`} placeholder="Example: -2 or 5" />
              </label>
              <label className="block md:col-span-2">
                <span className={labelClass}>Reason</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-[96px] w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm" placeholder="Reason for the correction" />
              </label>
              {tagOptions.length > 1 ? (
                <label className="block md:col-span-2">
                  <span className={labelClass}>Tag</span>
                  <SearchableSelect value={tag} onChange={setTag} options={tagOptions} inputClassName={inputClass} placeholder="Tag" />
                </label>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-akiva-text">Review before posting</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoTile label="On hand" value={selectedItem ? `${formatNumber(onHandBefore, selectedItem.decimalPlaces || 2)} ${selectedItem.units}` : '-'} />
              <InfoTile label="After adjustment" value={selectedItem ? `${formatNumber(onHandAfter, selectedItem.decimalPlaces || 2)} ${selectedItem.units}` : '-'} />
              <InfoTile label="Unit cost" value={selectedItem ? formatMoney(selectedItem.unitCost, currency) : '-'} />
              <InfoTile label="Value impact" value={selectedItem ? formatMoney(valueImpact, currency) : '-'} />
            </div>
            {selectedItem?.controlled || selectedItem?.serialised ? (
              <WarningText message="This item is batch or serial controlled. Use the controlled-stock adjustment flow before posting." />
            ) : null}
            {payload?.settings.prohibitNegativeStock && selectedItem && onHandAfter < 0 ? (
              <WarningText message="This would make the selected location negative, so it cannot be posted." />
            ) : null}
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `Adjustment #${detailRow.adjustmentNumber}` : 'Adjustment'}
        size="sm"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="font-semibold text-akiva-text">{detailRow.stockId} - {detailRow.description}</div>
              <div className="mt-2 text-sm text-akiva-text-muted">{detailRow.locationName} ({detailRow.location})</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="Quantity change" value={`${detailRow.quantity >= 0 ? '+' : ''}${formatNumber(detailRow.quantity)} ${detailRow.units}`} />
                <InfoTile label="New on hand" value={formatNumber(detailRow.newOnHand)} />
                <InfoTile label="Unit cost" value={formatMoney(detailRow.unitCost, currency)} />
                <InfoTile label="Value impact" value={formatMoney(detailRow.valueImpact, currency)} />
              </div>
            </section>
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Reason</div>
              <p className="mt-2 text-sm leading-6 text-akiva-text">{detailRow.reason || 'No reason recorded.'}</p>
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

function WarningText({ message }: { message: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
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
