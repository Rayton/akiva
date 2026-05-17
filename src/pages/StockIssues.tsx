import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardMinus,
  Eye,
  PackageMinus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DatePicker } from '../components/common/DatePicker';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
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

interface IssueItem {
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

interface IssueLine {
  id: string;
  item: IssueItem;
  quantity: string;
  tag: string;
}

interface StockIssueRow {
  issueNumber: number;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  date: string;
  quantity: number;
  newOnHand: number;
  unitCost: number;
  value: number;
  reason: string;
  postedBy: string;
  units: string;
}

interface WorkbenchPayload {
  nextIssueNumber: number;
  locations: LocationOption[];
  tags: TagOption[];
  recentIssues: StockIssueRow[];
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
  data?: IssueItem[];
}

interface IssueResponse {
  success: boolean;
  message?: string;
  data?: {
    nextIssueNumber?: number;
    recentIssues?: StockIssueRow[];
  };
  issue?: {
    issueNumber: number;
  };
}

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

function decimalPlacesFor(item: IssueItem): number {
  return item.decimalPlaces || 2;
}

export function StockIssues() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationFilter, setLocationFilter] = useState('All');
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeValue | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<StockIssueRow | null>(null);

  const [formLocation, setFormLocation] = useState('');
  const [issueDate, setIssueDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [itemFocused, setItemFocused] = useState(false);
  const [itemLoading, setItemLoading] = useState(false);
  const [items, setItems] = useState<IssueItem[]>([]);
  const [lines, setLines] = useState<IssueLine[]>([]);

  const locations = payload?.locations ?? [];
  const tags = payload?.tags ?? [];
  const currency = payload?.currency ?? 'TZS';
  const recentIssues = payload?.recentIssues ?? [];
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...locations], [locations]);
  const formLocationOptions = useMemo(() => locations.map((location) => ({ value: location.value, label: `${location.label} (${location.code})` })), [locations]);
  const tagOptions = useMemo(() => [{ value: '0', label: 'No tag' }, ...tags], [tags]);

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (locationFilter !== 'All') params.set('location', locationFilter);
      if (dateRangeFilter) {
        params.set('from', dateRangeFilter.from);
        params.set('to', dateRangeFilter.to);
      }
      if (tableSearch.trim()) params.set('q', tableSearch.trim());
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-issues/workbench${query}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock issues could not be loaded.');
      }

      setPayload(json.data);
      setFormLocation((current) => current || json.data?.locations?.[0]?.value || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock issues could not be loaded.');
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
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-issue-items?${params.toString()}`));
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
  }, [locationFilter, dateRangeFilter?.from, dateRangeFilter?.to]);

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

  const issuedToday = recentIssues.filter((row) => row.date === todayIso()).length;
  const recentValue = recentIssues.reduce((sum, row) => sum + row.value, 0);
  const itemLinesThisMonth = recentIssues.filter((row) => row.date.slice(0, 7) === todayIso().slice(0, 7)).length;
  const belowReorderCount = lines.filter((line) => {
    const quantity = numericValue(line.quantity);
    return line.item.balance.reorderLevel > 0 && line.item.balance.onHand - quantity <= line.item.balance.reorderLevel;
  }).length;
  const issueTotal = lines.reduce((sum, line) => sum + numericValue(line.quantity) * line.item.unitCost, 0);
  const hasInvalidLine = lines.some((line) => {
    const quantity = numericValue(line.quantity);
    const decimalParts = line.quantity.replace(/,/g, '').split('.')[1] ?? '';
    return quantity <= 0 || decimalParts.replace(/0+$/, '').length > line.item.decimalPlaces;
  });
  const hasNegativeLine = Boolean(payload?.settings.prohibitNegativeStock) && lines.some((line) => numericValue(line.quantity) > line.item.balance.onHand);
  const canPost = Boolean(formLocation) && Boolean(issueDate) && reason.trim() !== '' && lines.length > 0 && !hasInvalidLine && !hasNegativeLine && !saving;

  const resetForm = () => {
    setIssueDate(todayIso());
    setReason('');
    setItemQuery('');
    setItemFocused(false);
    setItems([]);
    setLines([]);
  };

  const openCreate = () => {
    resetForm();
    setFormLocation((current) => current || locations[0]?.value || '');
    setCreateOpen(true);
  };

  const addItemToLines = (item: IssueItem) => {
    if (lines.some((line) => line.item.stockId === item.stockId)) {
      setMessage(`${item.stockId} is already on this issue.`);
      setItemFocused(false);
      setItemQuery('');
      return;
    }

    setLines((current) => [
      ...current,
      {
        id: `${item.stockId}-${Date.now()}`,
        item,
        quantity: item.balance.onHand > 0 ? '1' : '',
        tag: '0',
      },
    ]);
    setItemFocused(false);
    setItemQuery('');
  };

  const updateLine = (lineId: string, updates: Partial<IssueLine>) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...updates } : line)));
  };

  const removeLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const postIssue = async () => {
    if (!canPost) {
      setError('Choose a location, add items, enter quantities, and record why the stock is being issued.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/stock-issues'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: formLocation,
          date: issueDate,
          reason: reason.trim(),
          lines: lines.map((line) => ({
            stockId: line.item.stockId,
            quantity: numericValue(line.quantity),
            tag: Number(line.tag || 0),
          })),
        }),
      });
      const json = (await response.json()) as IssueResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Stock issue could not be posted.');
      }

      setPayload((current) => current ? {
        ...current,
        nextIssueNumber: json.data?.nextIssueNumber ?? current.nextIssueNumber,
        recentIssues: json.data?.recentIssues ?? current.recentIssues,
      } : current);
      setCreateOpen(false);
      resetForm();
      setMessage(json.issue ? `Issue ${json.issue.issueNumber} posted.` : 'Stock issue posted.');
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock issue could not be posted.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<AdvancedTableColumn<StockIssueRow>[]>(
    () => [
      {
        id: 'issueNumber',
        header: 'Issue',
        accessor: (row) => row.issueNumber,
        width: 120,
        cell: (row) => <span className="font-semibold text-akiva-text">#{row.issueNumber}</span>,
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
        header: 'Qty issued',
        accessor: (row) => row.quantity,
        align: 'right',
        width: 130,
        cell: (row) => <span className="font-semibold text-rose-700 dark:text-rose-300">{formatNumber(row.quantity)} {row.units}</span>,
      },
      {
        id: 'value',
        header: 'Value',
        accessor: (row) => row.value,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold">{formatMoney(row.value, currency)}</span>,
      },
      {
        id: 'newOnHand',
        header: 'On hand after',
        accessor: (row) => row.newOnHand,
        align: 'right',
        width: 150,
        cell: (row) => formatNumber(row.newOnHand),
      },
      { id: 'reason', header: 'Reason', accessor: (row) => row.reason, minWidth: 260 },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.issueNumber,
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
                    <PackageMinus className="h-4 w-4 text-akiva-accent-text" />
                    Inventory transactions
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ClipboardMinus className="h-4 w-4 text-akiva-accent-text" />
                    Issue stock
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Stock Issues
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Issue items from a location with quantities, reason, value impact and on-hand balance kept together.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter issues" title="Filter issues" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  New issue
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <span className={labelClass}>Location</span>
                    <SearchableSelect value={locationFilter} onChange={setLocationFilter} options={locationOptions} inputClassName={inputClass} placeholder="Location" />
                  </div>
                  <div className="md:col-span-2">
                    <span className={labelClass}>Date range</span>
                    {dateRangeFilter ? (
                      <DateRangePicker
                        value={dateRangeFilter}
                        onChange={setDateRangeFilter}
                        label="Start and end date"
                        triggerClassName="h-11 rounded-lg px-3"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDateRangeFilter(getDefaultDateRange())}
                        className="inline-flex h-11 w-full min-w-0 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-left text-sm text-akiva-text shadow-sm transition hover:border-akiva-accent focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                      >
                        <CalendarDays className="h-4 w-4 shrink-0 text-akiva-text-muted" />
                        <span className="min-w-0 truncate font-medium text-akiva-text">All dates</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={() => {
                        setLocationFilter('All');
                        setDateRangeFilter(null);
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Issued today" value={String(issuedToday)} note="Lines posted today" icon={ClipboardMinus} onClick={openCreate} />
              <MetricCard label="Recent issue value" value={formatMoney(recentValue, currency)} note="Value in the current list" icon={PackageMinus} onClick={() => setFilterOpen(true)} />
              <MetricCard label="This month" value={String(itemLinesThisMonth)} note="Issue lines posted this month" icon={CheckCircle2} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Stock protection" value={payload?.settings.prohibitNegativeStock ? 'On' : 'Off'} note={payload?.settings.prohibitNegativeStock ? 'Prevents negative balances' : 'Negative balances are allowed'} icon={ShieldCheck} onClick={() => setFilterOpen(true)} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Recent stock issues</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Issued quantities reduce stock on hand and keep the reason visible.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void loadWorkbench(); }} className={`${inputClass} pl-10`} placeholder="Search item, reason or number" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-issues"
                  columns={columns}
                  rows={recentIssues}
                  rowKey={(row, index) => `${row.issueNumber}-${row.stockId}-${index}`}
                  emptyMessage={loading ? 'Loading stock issues...' : 'No stock issues match these filters.'}
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
        title="Create Stock Issue"
        size="lg"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={postIssue} disabled={!canPost}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {saving ? 'Posting...' : 'Post issue'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="block">
                <span className={labelClass}>Location</span>
                <SearchableSelect
                  value={formLocation}
                  onChange={(value) => {
                    setFormLocation(value);
                    setLines([]);
                    setItems([]);
                    setItemQuery('');
                  }}
                  options={formLocationOptions}
                  inputClassName={inputClass}
                  placeholder="Choose location"
                />
              </label>
              <label className="block">
                <span className={labelClass}>Issue date</span>
                <DatePicker value={issueDate} onChange={setIssueDate} inputClassName={inputClass} />
              </label>
              <label className="relative block md:col-span-2">
                <span className={labelClass}>Add item</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    value={itemQuery}
                    onFocus={() => {
                      setItemFocused(true);
                      void loadItems('', formLocation);
                    }}
                    onChange={(event) => setItemQuery(event.target.value)}
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
                        onClick={() => addItemToLines(item)}
                      >
                        <span className="block font-semibold text-akiva-text">{item.stockId} - {item.description}</span>
                        <span className="mt-1 block text-xs text-akiva-text-muted">
                          {formatNumber(item.balance?.onHand ?? 0, decimalPlacesFor(item))} {item.units} on hand . {formatMoney(item.unitCost, currency)} each
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="block md:col-span-4">
                <span className={labelClass}>Reason</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-[88px] w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm" placeholder="Why this stock is being issued" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-akiva-text">Issue lines</h3>
                <p className="mt-1 text-sm text-akiva-text-muted">Each row shows available stock, quantity to issue and value.</p>
              </div>
              <div className="text-sm font-semibold text-akiva-text">{formatMoney(issueTotal, currency)}</div>
            </div>

            <div className="mt-4 space-y-3">
              {lines.length === 0 ? (
                <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
                  Search and choose an item to start the issue.
                </div>
              ) : lines.map((line) => {
                const quantity = numericValue(line.quantity);
                const afterIssue = line.item.balance.onHand - quantity;
                const belowReorder = line.item.balance.reorderLevel > 0 && afterIssue <= line.item.balance.reorderLevel;
                const tooMuch = Boolean(payload?.settings.prohibitNegativeStock) && afterIssue < 0;

                return (
                  <div key={line.id} className="rounded-xl border border-akiva-border bg-akiva-surface p-3 shadow-sm">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_120px_170px_44px] sm:items-end">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-akiva-text">{line.item.stockId} - {line.item.description}</div>
                        <div className="mt-1 text-xs text-akiva-text-muted">
                          {formatNumber(line.item.balance.onHand, decimalPlacesFor(line.item))} {line.item.units} on hand . {formatMoney(line.item.unitCost, currency)} each
                        </div>
                      </div>
                      <label className="block">
                        <span className={labelClass}>Qty</span>
                        <input value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} inputMode="decimal" className={`${inputClass} text-right font-semibold`} placeholder="0" />
                      </label>
                      <label className="block">
                        <span className={labelClass}>Tag</span>
                        <SearchableSelect value={line.tag} onChange={(value) => updateLine(line.id, { tag: value })} options={tagOptions} inputClassName={inputClass} placeholder="Tag" />
                      </label>
                      <button type="button" onClick={() => removeLine(line.id)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-akiva-border text-akiva-text-muted transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${line.item.stockId}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                      <InfoPill label="After issue" value={`${formatNumber(afterIssue, decimalPlacesFor(line.item))} ${line.item.units}`} tone={tooMuch ? 'danger' : belowReorder ? 'warning' : 'normal'} />
                      <InfoPill label="Line value" value={formatMoney(quantity * line.item.unitCost, currency)} />
                      <InfoPill label="Bin" value={line.item.balance.bin || 'Not set'} />
                    </div>
                  </div>
                );
              })}
            </div>

            {hasInvalidLine ? <WarningText message="Check the quantities. They must be greater than zero and match each item precision." /> : null}
            {hasNegativeLine ? <WarningText message="One or more lines would make the location balance negative." /> : null}
            {belowReorderCount > 0 ? <WarningText message={`${belowReorderCount} item${belowReorderCount === 1 ? '' : 's'} will reach or go below reorder level after this issue.`} /> : null}
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `Issue #${detailRow.issueNumber}` : 'Stock Issue'}
        size="sm"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="font-semibold text-akiva-text">{detailRow.stockId} - {detailRow.description}</div>
              <div className="mt-2 text-sm text-akiva-text-muted">{detailRow.locationName} ({detailRow.location})</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="Qty issued" value={`${formatNumber(detailRow.quantity)} ${detailRow.units}`} />
                <InfoTile label="On hand after" value={formatNumber(detailRow.newOnHand)} />
                <InfoTile label="Unit cost" value={formatMoney(detailRow.unitCost, currency)} />
                <InfoTile label="Value issued" value={formatMoney(detailRow.value, currency)} />
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

function InfoPill({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warning' | 'danger' }) {
  const toneClass = tone === 'danger'
    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
      : 'border-akiva-border bg-akiva-surface-raised text-akiva-text';

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <span className="font-semibold uppercase tracking-wide opacity-70">{label}</span>
      <span className="ml-2 font-semibold">{value}</span>
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
