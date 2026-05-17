import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Eye,
  PackageCheck,
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
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface Option {
  value: string;
  label: string;
  code?: string;
}

interface CountRow {
  stockId: string;
  description: string;
  longDescription: string;
  location: string;
  locationName: string;
  category: string;
  categoryName: string;
  units: string;
  decimalPlaces: number;
  frozenQuantity: number;
  countedQuantity: number | null;
  variance: number;
  countLines: number;
  lastReference: string;
  stockCheckDate: string;
  status: 'Not counted' | 'Matched' | 'Variance';
}

interface CountEntry {
  id: number;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  quantity: number;
  reference: string;
  units: string;
  decimalPlaces: number;
  frozenQuantity: number;
  stockCheckDate: string | null;
}

interface Summary {
  sheetItems: number;
  countedItems: number;
  notCountedItems: number;
  countLines: number;
  varianceUnits: number;
  activeCountDate: string | null;
}

interface WorkbenchPayload {
  locations: Option[];
  categories: Option[];
  countRows: CountRow[];
  recentEntries: CountEntry[];
  summary: Summary;
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

interface CountItemsResponse {
  success: boolean;
  message?: string;
  data?: CountRow[];
}

interface SaveCountResponse {
  success: boolean;
  message?: string;
  data?: Partial<WorkbenchPayload>;
}

type StatusFilter = 'All' | CountRow['status'];
type PrepareMode = 'update' | 'replace';

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function numericValue(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

function isValidCountInput(value: string): boolean {
  const normalized = value.trim().replace(/,/g, '');
  return normalized !== '' && Number.isFinite(Number(normalized));
}

function countRowKey(row: Pick<CountRow, 'location' | 'stockId'>): string {
  return `${row.location}::${row.stockId}`;
}

function statusClass(status: CountRow['status']): string {
  if (status === 'Matched') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'Variance') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200';
}

export function StockCounts() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<CountRow | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<CountEntry | null>(null);

  const [prepareLocation, setPrepareLocation] = useState('');
  const [prepareCategory, setPrepareCategory] = useState('All');
  const [prepareMode, setPrepareMode] = useState<PrepareMode>('update');
  const [onlyNonZero, setOnlyNonZero] = useState(false);

  const [countLocation, setCountLocation] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [itemFocused, setItemFocused] = useState(false);
  const [itemLoading, setItemLoading] = useState(false);
  const [items, setItems] = useState<CountRow[]>([]);
  const [selectedItem, setSelectedItem] = useState<CountRow | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});
  const [dirtyCountRows, setDirtyCountRows] = useState<Record<string, CountRow>>({});
  const [savingCountKeys, setSavingCountKeys] = useState<Record<string, boolean>>({});
  const [savedCountKeys, setSavedCountKeys] = useState<Record<string, boolean>>({});
  const saveTimersRef = useRef<Record<string, number>>({});

  const locations = payload?.locations ?? [];
  const categories = payload?.categories ?? [];
  const countRows = payload?.countRows ?? [];
  const recentEntries = payload?.recentEntries ?? [];
  const summary = payload?.summary ?? {
    sheetItems: 0,
    countedItems: 0,
    notCountedItems: 0,
    countLines: 0,
    varianceUnits: 0,
    activeCountDate: null,
  };

  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...locations], [locations]);
  const categoryOptions = useMemo(() => [{ value: 'All', label: 'All categories' }, ...categories], [categories]);
  const countLocationOptions = useMemo(() => locations.map((location) => ({ value: location.value, label: `${location.label} (${location.code})` })), [locations]);
  const statusOptions = [
    { value: 'All', label: 'All count lines' },
    { value: 'Not counted', label: 'Not counted' },
    { value: 'Variance', label: 'Variance' },
    { value: 'Matched', label: 'Matched' },
  ];

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (locationFilter !== 'All') params.set('location', locationFilter);
      if (categoryFilter !== 'All') params.set('category', categoryFilter);
      if (tableSearch.trim()) params.set('q', tableSearch.trim());
      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-counts/workbench${query}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Stock counts could not be loaded.');
      }

      setPayload(json.data);
      setPrepareLocation((current) => current || json.data.locations[0]?.value || '');
      setCountLocation((current) => current || json.data.locations[0]?.value || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Stock counts could not be loaded.');
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
      if (categoryFilter !== 'All') params.set('category', categoryFilter);
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-count-items?${params.toString()}`));
      const json = (await response.json()) as CountItemsResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Countable items could not be loaded.');
      }
      setItems(json.data ?? []);
    } catch (caught) {
      setItems([]);
      setError(caught instanceof Error ? caught.message : 'Countable items could not be loaded.');
    } finally {
      setItemLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, [locationFilter, categoryFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkbench();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [tableSearch]);

  useEffect(() => {
    if (!itemFocused || !countLocation) return;
    const timer = window.setTimeout(() => {
      void loadItems(itemQuery, countLocation);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [countLocation, itemFocused, itemQuery, categoryFilter]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  useEffect(() => {
    setCountDrafts((previous) => {
      const next = { ...previous };
      countRows.forEach((row) => {
        const key = countRowKey(row);
        if (dirtyCountRows[key] || savingCountKeys[key]) return;
        next[key] = row.countedQuantity === null ? '' : String(row.countedQuantity);
      });
      return next;
    });
  }, [countRows, dirtyCountRows, savingCountKeys]);

  const filteredRows = useMemo(
    () => countRows.filter((row) => statusFilter === 'All' || row.status === statusFilter),
    [countRows, statusFilter]
  );

  const completionRate = summary.sheetItems > 0 ? Math.round((summary.countedItems / summary.sheetItems) * 100) : 0;
  const varianceRows = countRows.filter((row) => row.status === 'Variance').length;
  const canSaveCount = Boolean(countLocation) && Boolean(selectedItem) && quantity.trim() !== '' && Number.isFinite(numericValue(quantity));

  const saveInlineCount = async (row: CountRow, value: string) => {
    if (!isValidCountInput(value)) return;

    const key = countRowKey(row);
    setSavingCountKeys((current) => ({ ...current, [key]: true }));
    setSavedCountKeys((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/stock-counts/line'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: row.location,
          stockId: row.stockId,
          quantity: numericValue(value),
          reference: row.lastReference || 'Table edit',
          filterLocation: locationFilter,
          category: categoryFilter,
          q: tableSearch.trim(),
        }),
      });
      const json = (await response.json()) as SaveCountResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Count could not be saved.');
      }

      updateFromResponse(json.data);
      setDirtyCountRows((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setSavedCountKeys((current) => ({ ...current, [key]: true }));
      window.setTimeout(() => {
        setSavedCountKeys((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }, 1800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Count could not be saved.');
    } finally {
      setSavingCountKeys((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  };

  const queueInlineSave = (row: CountRow, value: string) => {
    const key = countRowKey(row);
    setCountDrafts((current) => ({ ...current, [key]: value }));
    setDirtyCountRows((current) => ({ ...current, [key]: row }));

    if (saveTimersRef.current[key]) {
      window.clearTimeout(saveTimersRef.current[key]);
    }

    saveTimersRef.current[key] = window.setTimeout(() => {
      void saveInlineCount(row, value);
      delete saveTimersRef.current[key];
    }, 700);
  };

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const openPrepare = () => {
    setPrepareLocation((current) => current || locations[0]?.value || '');
    setPrepareCategory(categoryFilter);
    setPrepareMode('update');
    setOnlyNonZero(false);
    setPrepareOpen(true);
  };

  const openCount = (row?: CountRow) => {
    setSelectedItem(row ?? null);
    setCountLocation(row?.location || (locationFilter !== 'All' ? locationFilter : locations[0]?.value || ''));
    setQuantity(row?.countedQuantity !== null && row?.countedQuantity !== undefined ? String(row.countedQuantity) : '');
    setReference(row?.lastReference ?? '');
    setItemQuery('');
    setItems([]);
    setCountOpen(true);
  };

  const updateFromResponse = (data?: Partial<WorkbenchPayload>) => {
    if (!data) return;
    setPayload((current) => current ? {
      ...current,
      countRows: data.countRows ?? current.countRows,
      recentEntries: data.recentEntries ?? current.recentEntries,
      summary: data.summary ?? current.summary,
    } : current);
  };

  const prepareCountSheet = async () => {
    if (!prepareLocation) {
      setError('Choose the location to count.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/stock-counts/prepare'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: prepareLocation,
          category: prepareCategory,
          mode: prepareMode,
          onlyNonZero,
        }),
      });
      const json = (await response.json()) as SaveCountResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Count sheet could not be prepared.');
      }

      updateFromResponse(json.data);
      setLocationFilter(prepareLocation);
      setCategoryFilter(prepareCategory);
      setPrepareOpen(false);
      setMessage(json.message || 'Count sheet prepared.');
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Count sheet could not be prepared.');
    } finally {
      setSaving(false);
    }
  };

  const saveCount = async () => {
    if (!canSaveCount || !selectedItem) {
      setError('Choose an item and enter the counted quantity.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/stock-counts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: countLocation,
          stockId: selectedItem.stockId,
          quantity: numericValue(quantity),
          reference: reference.trim(),
        }),
      });
      const json = (await response.json()) as SaveCountResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Count line could not be saved.');
      }

      updateFromResponse(json.data);
      setCountOpen(false);
      setSelectedItem(null);
      setQuantity('');
      setReference('');
      setMessage(json.message || 'Count line saved.');
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Count line could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCountLine = async () => {
    if (!deleteEntry) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/stock-counts/${deleteEntry.id}`), { method: 'DELETE' });
      const json = (await response.json()) as SaveCountResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Count line could not be deleted.');
      }

      updateFromResponse(json.data);
      setDeleteEntry(null);
      setMessage(json.message || 'Count line deleted.');
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Count line could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<AdvancedTableColumn<CountRow>[]>(
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
      {
        id: 'location',
        header: 'Location',
        accessor: (row) => `${row.locationName} ${row.location}`,
        minWidth: 200,
        cell: (row) => (
          <div>
            <div className="font-semibold text-akiva-text">{row.locationName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.location}</div>
          </div>
        ),
      },
      { id: 'category', header: 'Category', accessor: (row) => row.categoryName, minWidth: 190 },
      {
        id: 'frozenQuantity',
        header: 'Expected',
        accessor: (row) => row.frozenQuantity,
        align: 'right',
        width: 130,
        cell: (row) => `${formatNumber(row.frozenQuantity, row.decimalPlaces || 2)} ${row.units}`,
      },
      {
        id: 'countedQuantity',
        header: 'Counted',
        accessor: (row) => row.countedQuantity ?? '',
        align: 'right',
        width: 180,
        cell: (row) => {
          const key = countRowKey(row);
          const value = countDrafts[key] ?? (row.countedQuantity === null ? '' : String(row.countedQuantity));
          const isDirty = Boolean(dirtyCountRows[key]);
          const isSaving = Boolean(savingCountKeys[key]);
          const isSaved = Boolean(savedCountKeys[key]);
          return (
            <div className="flex flex-col items-end gap-1">
              <div className="flex w-full max-w-[160px] items-center gap-1.5">
                <input
                  value={value}
                  onChange={(event) => queueInlineSave(row, event.target.value)}
                  onBlur={(event) => {
                    if (saveTimersRef.current[key]) {
                      window.clearTimeout(saveTimersRef.current[key]);
                      delete saveTimersRef.current[key];
                    }
                    void saveInlineCount(row, event.target.value);
                  }}
                  inputMode="decimal"
                  aria-label={`Counted quantity for ${row.stockId}`}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-akiva-border bg-akiva-surface px-2 text-right text-sm font-semibold text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                  placeholder="0"
                />
                <span className="shrink-0 text-xs text-akiva-text-muted">{row.units}</span>
              </div>
              <span className={`text-[11px] font-semibold ${isSaving ? 'text-akiva-accent-text' : isSaved ? 'text-emerald-700 dark:text-emerald-300' : isDirty ? 'text-akiva-text-muted' : 'text-transparent'}`}>
                {isSaving ? 'Saving...' : isSaved ? 'Saved' : isDirty ? 'Autosaves' : 'Saved'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'variance',
        header: 'Variance',
        accessor: (row) => row.variance,
        align: 'right',
        width: 120,
        cell: (row) => (
          <span className={row.status === 'Variance' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold text-akiva-text'}>
            {row.countLines === 0 ? '-' : formatNumber(row.variance, row.decimalPlaces || 2)}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 140,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>,
      },
      { id: 'stockCheckDate', header: 'Sheet date', accessor: (row) => row.stockCheckDate, width: 140 },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.stockId,
        sortable: false,
        filterable: false,
        align: 'right',
        sticky: 'right',
        width: 190,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDetailRow(row)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text">
              <Eye className="h-4 w-4" />
              View
            </button>
            <button type="button" onClick={() => openCount(row)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-akiva-accent px-3 text-xs font-semibold text-white shadow-sm hover:bg-akiva-accent-strong">
              <Plus className="h-4 w-4" />
              Count
            </button>
          </div>
        ),
      },
    ],
    [countDrafts, dirtyCountRows, savedCountKeys, savingCountKeys]
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
                    <ClipboardList className="h-4 w-4 text-akiva-accent-text" />
                    Inventory transactions
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Count, review, then adjust
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                  Stock Counts
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Prepare count sheets, enter physical quantities, and review differences before inventory is corrected.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter counts" title="Filter counts" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <Button type="button" variant="secondary" onClick={openPrepare}>
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Prepare count
                </Button>
                <Button type="button" onClick={() => openCount()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Enter count
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <SearchableSelect value={locationFilter} onChange={setLocationFilter} options={locationOptions} inputClassName={inputClass} placeholder="Location" />
                  <SearchableSelect value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} inputClassName={inputClass} placeholder="Category" />
                  <SearchableSelect value={statusFilter} onChange={(value) => setStatusFilter(value as StatusFilter)} options={statusOptions} inputClassName={inputClass} placeholder="Status" />
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Count progress" value={`${completionRate}%`} note={`${formatNumber(summary.countedItems, 0)} of ${formatNumber(summary.sheetItems, 0)} items counted`} icon={PackageCheck} onClick={() => setStatusFilter('All')} />
              <MetricCard label="Still to count" value={formatNumber(summary.notCountedItems, 0)} note="Items on the sheet without a count" icon={ClipboardList} onClick={() => setStatusFilter('Not counted')} />
              <MetricCard label="Variance items" value={formatNumber(varianceRows, 0)} note={`${formatNumber(summary.varianceUnits)} units different`} icon={AlertTriangle} onClick={() => setStatusFilter('Variance')} />
              <MetricCard label="Last sheet" value={summary.activeCountDate ?? '-'} note="Current frozen stock count date" icon={ShieldCheck} onClick={openPrepare} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Count sheet items</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Counted quantities are saved as progress. Inventory is not adjusted from this page.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search item, category or location" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="stock-counts"
                  columns={columns}
                  rows={filteredRows}
                  rowKey={(row) => `${row.location}-${row.stockId}`}
                  emptyMessage={loading ? 'Loading stock counts...' : 'No count sheet items match these filters.'}
                  loading={loading}
                  initialPageSize={10}
                  initialScroll="left"
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="border-b border-akiva-border px-4 py-3">
                <h2 className="text-sm font-semibold text-akiva-text">Recently entered counts</h2>
                <p className="mt-1 text-sm text-akiva-text-muted">Use delete only for entry mistakes before count comparison is posted.</p>
              </div>
              <div className="divide-y divide-akiva-border">
                {recentEntries.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-akiva-text-muted">No count lines have been entered for this view.</div>
                ) : recentEntries.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold text-akiva-text">{entry.stockId} - {entry.description}</div>
                      <div className="mt-1 text-sm text-akiva-text-muted">{entry.locationName} . {formatNumber(entry.quantity, entry.decimalPlaces || 2)} {entry.units} counted . {entry.reference || 'No reference'}</div>
                    </div>
                    <button type="button" onClick={() => setDeleteEntry(entry)} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100 sm:w-auto">
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>

      <Modal
        isOpen={prepareOpen}
        onClose={() => !saving && setPrepareOpen(false)}
        title="Prepare Stock Count"
        size="md"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setPrepareOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={prepareCountSheet} disabled={saving || !prepareLocation}>
              <ClipboardList className="mr-2 h-4 w-4" />
              {saving ? 'Preparing...' : 'Prepare count'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Location</span>
                <SearchableSelect value={prepareLocation} onChange={setPrepareLocation} options={countLocationOptions} inputClassName={inputClass} placeholder="Choose location" />
              </label>
              <label className="block">
                <span className={labelClass}>Category</span>
                <SearchableSelect value={prepareCategory} onChange={setPrepareCategory} options={categoryOptions} inputClassName={inputClass} placeholder="Category" />
              </label>
              <label className="block">
                <span className={labelClass}>Action</span>
                <SearchableSelect
                  value={prepareMode}
                  onChange={(value) => setPrepareMode(value as PrepareMode)}
                  options={[
                    { value: 'update', label: 'Add or update sheet' },
                    { value: 'replace', label: 'Replace selected sheet' },
                  ]}
                  inputClassName={inputClass}
                  placeholder="Action"
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text">
                <input type="checkbox" checked={onlyNonZero} onChange={(event) => setOnlyNonZero(event.target.checked)} className="h-4 w-4 rounded border-akiva-border-strong text-akiva-accent-text focus:ring-akiva-accent" />
                Only include items with stock on hand
              </label>
            </div>
          </section>
          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-muted/60 p-4 text-sm leading-6 text-akiva-text-muted">
            Preparing the count stores the expected quantity for the selected location. Counts entered afterwards are compared with this frozen quantity.
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={countOpen}
        onClose={() => !saving && setCountOpen(false)}
        title="Enter Stock Count"
        size="md"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setCountOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={saveCount} disabled={saving || !canSaveCount}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save count'}
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
                  value={countLocation}
                  onChange={(value) => {
                    setCountLocation(value);
                    setSelectedItem(null);
                    setItemQuery('');
                    setItems([]);
                  }}
                  options={countLocationOptions}
                  inputClassName={inputClass}
                  placeholder="Choose location"
                  disabled={Boolean(selectedItem)}
                />
              </label>
              <label className="relative block">
                <span className={labelClass}>Item</span>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    value={itemFocused ? itemQuery : selectedItem ? `${selectedItem.stockId} - ${selectedItem.description}` : itemQuery}
                    onFocus={() => {
                      if (selectedItem) return;
                      setItemFocused(true);
                      void loadItems('', countLocation);
                    }}
                    onChange={(event) => {
                      setSelectedItem(null);
                      setItemQuery(event.target.value);
                    }}
                    onBlur={() => window.setTimeout(() => setItemFocused(false), 160)}
                    className={`${inputClass} pl-10`}
                    placeholder={countLocation ? 'Search item or scan code' : 'Choose location first'}
                    disabled={!countLocation || Boolean(selectedItem)}
                    autoComplete="off"
                  />
                </div>
                {itemFocused && !selectedItem ? (
                  <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-akiva-border bg-akiva-surface-raised py-1 text-sm text-akiva-text shadow-xl">
                    {itemLoading ? (
                      <div className="px-3 py-3 text-akiva-text-muted">Loading items...</div>
                    ) : items.length === 0 ? (
                      <div className="px-3 py-3 text-akiva-text-muted">No count sheet items found</div>
                    ) : items.map((item) => (
                      <button
                        type="button"
                        key={`${item.location}-${item.stockId}`}
                        className="block w-full px-3 py-2 text-left transition hover:bg-akiva-accent-soft"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSelectedItem(item);
                          setCountLocation(item.location);
                          setQuantity(item.countedQuantity !== null ? String(item.countedQuantity) : '');
                          setReference(item.lastReference || '');
                          setItemQuery('');
                          setItemFocused(false);
                        }}
                      >
                        <span className="block font-semibold text-akiva-text">{item.stockId} - {item.description}</span>
                        <span className="mt-1 block text-xs text-akiva-text-muted">
                          Expected {formatNumber(item.frozenQuantity, item.decimalPlaces || 2)} {item.units} . {item.status}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <label className="block">
                <span className={labelClass}>Counted quantity</span>
                <input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" className={`${inputClass} text-right font-semibold`} placeholder="Quantity counted" />
              </label>
              <label className="block">
                <span className={labelClass}>Reference</span>
                <input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={20} className={inputClass} placeholder="Shelf, sheet, counter" />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-akiva-text">Review count</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <InfoTile label="Expected" value={selectedItem ? `${formatNumber(selectedItem.frozenQuantity, selectedItem.decimalPlaces || 2)} ${selectedItem.units}` : '-'} />
              <InfoTile label="Counted" value={selectedItem && quantity.trim() ? `${formatNumber(numericValue(quantity), selectedItem.decimalPlaces || 2)} ${selectedItem.units}` : '-'} />
              <InfoTile label="Difference" value={selectedItem && quantity.trim() ? formatNumber(numericValue(quantity) - selectedItem.frozenQuantity, selectedItem.decimalPlaces || 2) : '-'} />
            </div>
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `${detailRow.stockId} Count` : 'Count Detail'}
        size="sm"
        footer={<Button type="button" onClick={() => setDetailRow(null)}>Close</Button>}
      >
        {detailRow ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="font-semibold text-akiva-text">{detailRow.stockId} - {detailRow.description}</div>
              <div className="mt-2 text-sm text-akiva-text-muted">{detailRow.locationName} ({detailRow.location})</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="Expected" value={`${formatNumber(detailRow.frozenQuantity, detailRow.decimalPlaces || 2)} ${detailRow.units}`} />
                <InfoTile label="Counted" value={detailRow.countedQuantity === null ? '-' : `${formatNumber(detailRow.countedQuantity, detailRow.decimalPlaces || 2)} ${detailRow.units}`} />
                <InfoTile label="Variance" value={formatNumber(detailRow.variance, detailRow.decimalPlaces || 2)} />
                <InfoTile label="Count lines" value={String(detailRow.countLines)} />
              </div>
            </section>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(deleteEntry)}
        onClose={() => !saving && setDeleteEntry(null)}
        title="Delete Count Line"
        size="sm"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setDeleteEntry(null)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={deleteCountLine} disabled={saving}>
              <Trash2 className="mr-2 h-4 w-4" />
              {saving ? 'Deleting...' : 'Delete line'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-akiva-text-muted">
          Delete this count line only if it was entered by mistake. The count sheet item will return to its remaining saved count, if any.
        </p>
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
