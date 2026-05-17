import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock3,
  PackageCheck,
  PanelRightOpen,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Truck,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface LocationOption {
  value: string;
  label: string;
  code: string;
}

interface ItemBalance {
  onHand: number;
  inTransit: number;
  available: number;
  reorderLevel: number;
  bin: string;
}

interface TransferItem {
  stockId: string;
  description: string;
  longDescription: string;
  units: string;
  category: string;
  decimalPlaces: number;
  controlled: boolean;
  serialised: boolean;
  unitCost: number;
  balance: ItemBalance;
}

interface PendingTransfer {
  reference: number;
  fromLocation: string;
  fromLocationName: string;
  toLocation: string;
  toLocationName: string;
  shipDate: string;
  itemCount: number;
  shipQuantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  status: 'Sent' | 'Part received';
}

interface InventoryTransferPayload {
  nextReference: number;
  locations: LocationOption[];
  pendingTransfers: PendingTransfer[];
  settings: {
    prohibitNegativeStock: boolean;
  };
}

interface ApiResponse {
  success: boolean;
  message?: string;
  data?: InventoryTransferPayload & {
    pendingTransfers?: PendingTransfer[];
  };
  transfer?: {
    reference: number;
  };
}

interface ItemSearchResponse {
  success: boolean;
  message?: string;
  data: TransferItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface TransferDetailLine extends TransferItem {
  quantity: number;
  receivedQuantity: number;
}

interface TransferDetailResponse {
  success: boolean;
  message?: string;
  data?: PendingTransfer & {
    lines: TransferDetailLine[];
  };
}

interface TransferLine {
  id: string;
  stockId: string;
  description: string;
  units: string;
  category: string;
  decimalPlaces: number;
  unitCost: number;
  balance?: ItemBalance;
  quantity: string;
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const quantityClass =
  'h-10 w-full min-w-[6.5rem] rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-right text-sm font-semibold text-akiva-text shadow-sm focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const statusFilterOptions = [
  { value: 'All', label: 'All statuses' },
  { value: 'Sent', label: 'Sent' },
  { value: 'Part received', label: 'Part received' },
];

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(value || 0).replace('TZS', 'TZS ');
}

function numericQuantity(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

function makeLine(item: TransferItem, quantity = '1'): TransferLine {
  return {
    id: `${item.stockId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    stockId: item.stockId,
    description: item.description,
    units: item.units,
    category: item.category,
    decimalPlaces: item.decimalPlaces,
    unitCost: item.unitCost,
    balance: item.balance,
    quantity,
  };
}

function legacyUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return `${window.location.protocol}//${window.location.hostname}${path}`;
}

function statusClass(status: PendingTransfer['status']): string {
  if (status === 'Part received') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
}

export function InventoryTransfer() {
  const [payload, setPayload] = useState<InventoryTransferPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editingReference, setEditingReference] = useState<number | null>(null);

  const [tableQuery, setTableQuery] = useState('');
  const [filterFrom, setFilterFrom] = useState('All');
  const [filterTo, setFilterTo] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [itemQuery, setItemQuery] = useState('');
  const [itemPage, setItemPage] = useState(1);
  const [itemRows, setItemRows] = useState<TransferItem[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemHasMore, setItemHasMore] = useState(false);
  const [itemSearchFocused, setItemSearchFocused] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [lines, setLines] = useState<TransferLine[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await apiFetch(buildApiUrl('/api/inventory/transfers/workbench'));
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Inventory transfers could not be loaded.');
      }

      setPayload(json.data);
      setFromLocation((current) => current || json.data?.locations[0]?.value || '');
      setToLocation((current) => current || json.data?.locations.find((location) => location.value !== (json.data?.locations[0]?.value || ''))?.value || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory transfers could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const loadItems = async () => {
    if (!transferOpen || !fromLocation) {
      setItemRows([]);
      setItemTotal(0);
      setItemHasMore(false);
      return;
    }
    setItemsLoading(true);

    const query = new URLSearchParams({
      fromLocation,
      q: itemQuery,
      page: String(itemPage),
      limit: '20',
    });

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/transfer-items?${query.toString()}`));
      const json = (await response.json()) as ItemSearchResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Items could not be loaded.');
      }

      setItemRows((current) => (itemPage === 1 ? json.data : [...current, ...json.data]));
      setItemTotal(json.pagination.total);
      setItemHasMore(json.pagination.hasMore);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Items could not be loaded.');
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadItems();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [transferOpen, fromLocation, itemQuery, itemPage, itemSearchFocused]);

  useEffect(() => {
    setItemPage(1);
    setItemRows([]);
  }, [fromLocation, itemQuery]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const locations = payload?.locations ?? [];
  const pendingTransfers = payload?.pendingTransfers ?? [];
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All locations' }, ...locations], [locations]);

  const filteredTransfers = useMemo(() => {
    const search = tableQuery.trim().toLowerCase();
    return pendingTransfers.filter((transfer) => {
      if (filterStatus !== 'All' && transfer.status !== filterStatus) return false;
      if (filterFrom !== 'All' && transfer.fromLocation !== filterFrom) return false;
      if (filterTo !== 'All' && transfer.toLocation !== filterTo) return false;
      if (!search) return true;
      return [
        transfer.reference,
        transfer.fromLocation,
        transfer.fromLocationName,
        transfer.toLocation,
        transfer.toLocationName,
        transfer.status,
      ].join(' ').toLowerCase().includes(search);
    });
  }, [filterFrom, filterStatus, filterTo, pendingTransfers, tableQuery]);

  const totalQuantity = lines.reduce((sum, line) => sum + numericQuantity(line.quantity), 0);
  const totalCost = lines.reduce((sum, line) => sum + numericQuantity(line.quantity) * line.unitCost, 0);
  const readyLines = lines.filter((line) => {
    const quantity = numericQuantity(line.quantity);
    return quantity > 0 && (!line.balance || quantity <= line.balance.available);
  }).length;
  const awaitingReceiptQty = pendingTransfers.reduce((sum, transfer) => sum + transfer.outstandingQuantity, 0);
  const readyToReceiveCount = pendingTransfers.filter((transfer) => transfer.status === 'Sent').length;
  const readyToReceiveQty = pendingTransfers
    .filter((transfer) => transfer.status === 'Sent')
    .reduce((sum, transfer) => sum + transfer.outstandingQuantity, 0);
  const partReceivedCount = pendingTransfers.filter((transfer) => transfer.status === 'Part received').length;
  const partReceivedQty = pendingTransfers
    .filter((transfer) => transfer.status === 'Part received')
    .reduce((sum, transfer) => sum + transfer.outstandingQuantity, 0);
  const oldestTransfer = useMemo(() => {
    return pendingTransfers.reduce<PendingTransfer | null>((oldest, transfer) => {
      if (!oldest) return transfer;
      return Date.parse(transfer.shipDate) < Date.parse(oldest.shipDate) ? transfer : oldest;
    }, null);
  }, [pendingTransfers]);
  const oldestTransferAge = oldestTransfer
    ? Math.max(0, Math.floor((Date.now() - Date.parse(oldestTransfer.shipDate)) / 86_400_000))
    : 0;

  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (!fromLocation || !toLocation) messages.push('Choose sending and receiving locations.');
    if (fromLocation && toLocation && fromLocation === toLocation) messages.push('Sending and receiving locations must be different.');
    if (lines.length === 0) messages.push('Add at least one item.');
    lines.forEach((line) => {
      const quantity = numericQuantity(line.quantity);
      if (quantity <= 0) messages.push(`${line.stockId} needs a quantity greater than zero.`);
      if ((payload?.settings.prohibitNegativeStock ?? true) && line.balance && quantity > line.balance.available) {
        messages.push(`${line.stockId} exceeds the available stock at the sending location.`);
      }
    });
    return messages;
  }, [fromLocation, lines, payload?.settings.prohibitNegativeStock, toLocation]);

  const addItem = (item: TransferItem) => {
    setLines((current) => {
      const existing = current.find((line) => line.stockId === item.stockId);
      if (!existing) return [...current, makeLine(item)];
      return current.map((line) => (
        line.id === existing.id
          ? { ...line, quantity: String(numericQuantity(line.quantity) + 1), balance: item.balance }
          : line
      ));
    });
    setItemQuery('');
    setItemPage(1);
    setItemSearchFocused(false);
  };

  const updateLine = (lineId: string, quantity: string) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, quantity } : line)));
  };

  const removeLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = text
        .split(/\r?\n/)
        .map((row) => row.trim())
        .filter(Boolean)
        .map((row) => {
          const [stockId, quantity] = row.split(',').map((cell) => cell.trim());
          return {
            id: `${stockId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            stockId: (stockId ?? '').toUpperCase(),
            description: 'Imported item',
            units: '',
            category: '',
            decimalPlaces: 2,
            unitCost: 0,
            quantity: quantity || '1',
          } satisfies TransferLine;
        })
        .filter((line) => line.stockId && numericQuantity(line.quantity) > 0);

      setLines((current) => [...current, ...imported]);
      setMessage(`${imported.length} line${imported.length === 1 ? '' : 's'} imported.`);
      setTransferOpen(true);
    } finally {
      event.target.value = '';
    }
  };

  const openCreate = () => {
    setEditingReference(null);
    setLines([]);
    setItemQuery('');
    setItemRows([]);
    setItemPage(1);
    setTransferOpen(true);
    setError('');
    setMessage('');
  };

  const createTransfer = async () => {
    if (validationMessages.length > 0) {
      setError(validationMessages[0]);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(editingReference ? `/api/inventory/transfers/${editingReference}` : '/api/inventory/transfers'), {
        method: editingReference ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromLocation,
          toLocation,
          lines: lines.map((line) => ({
            stockId: line.stockId,
            quantity: numericQuantity(line.quantity),
          })),
        }),
      });
      const json = (await response.json()) as ApiResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Transfer shipment could not be created.');
      }

      if (json.data && payload) {
        setPayload({
          ...payload,
          nextReference: json.data.nextReference ?? payload.nextReference,
          pendingTransfers: json.data.pendingTransfers ?? payload.pendingTransfers,
        });
      } else {
        await loadWorkbench();
      }

      setLines([]);
      setEditingReference(null);
      setTransferOpen(false);
      setMessage(editingReference ? `Transfer ${editingReference} updated.` : `Transfer ${json.transfer?.reference ?? ''} is ready for receiving.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : editingReference ? 'Transfer shipment could not be updated.' : 'Transfer shipment could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = async (reference: number) => {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/transfers/${reference}`));
      const json = (await response.json()) as TransferDetailResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Transfer shipment could not be loaded.');
      }

      setEditingReference(reference);
      setFromLocation(json.data.fromLocation);
      setToLocation(json.data.toLocation);
      setItemQuery('');
      setItemRows([]);
      setItemPage(1);
      setLines(json.data.lines.map((line) => ({
        id: `${reference}-${line.stockId}`,
        stockId: line.stockId,
        description: line.description,
        units: line.units,
        category: line.category,
        decimalPlaces: line.decimalPlaces,
        unitCost: line.unitCost,
        balance: line.balance,
        quantity: String(line.quantity),
      })));
      setTransferOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transfer shipment could not be loaded.');
    } finally {
      setSaving(false);
    }
  };

  const openPrint = (reference: number) => {
    window.open(buildApiUrl(`/api/inventory/transfers/${encodeURIComponent(String(reference))}/print`), '_blank', 'noopener,noreferrer');
  };

  const openReceive = (reference: number) => {
    window.location.href = `/inventory/transactions/stockloctransferreceive?reference=${encodeURIComponent(String(reference))}`;
  };

  const pendingColumns = useMemo<AdvancedTableColumn<PendingTransfer>[]>(
    () => [
      {
        id: 'reference',
        header: 'Transfer',
        accessor: (row) => row.reference,
        width: 130,
        cell: (row) => <span className="font-semibold text-akiva-text">#{row.reference}</span>,
      },
      {
        id: 'route',
        header: 'Route',
        accessor: (row) => `${row.fromLocationName} ${row.toLocationName}`,
        minWidth: 280,
        cell: (row) => (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-akiva-text">
              <span className="truncate">{row.fromLocationName}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-akiva-text-muted" />
              <span className="truncate">{row.toLocationName}</span>
            </div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.fromLocation} to {row.toLocation}</div>
          </div>
        ),
      },
      { id: 'items', header: 'Items', accessor: (row) => row.itemCount, align: 'right', width: 100 },
      {
        id: 'outstanding',
        header: 'Outstanding',
        accessor: (row) => row.outstandingQuantity,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold">{formatNumber(row.outstandingQuantity)}</span>,
      },
      { id: 'shipDate', header: 'Sent', accessor: (row) => row.shipDate, width: 130 },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 150,
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
            {row.status}
          </span>
        ),
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.reference,
        sortable: false,
        filterable: false,
        align: 'right',
        width: 280,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => void openEdit(row.reference)}>
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => openPrint(row.reference)}>
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-akiva-accent px-3 text-xs font-semibold text-white shadow-sm hover:bg-akiva-accent-strong" onClick={() => openReceive(row.reference)}>
              <PackageCheck className="h-4 w-4" />
              Receive
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
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ArrowRightLeft className="h-4 w-4 text-akiva-accent-text" />
                    Inventory transactions
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <Truck className="h-4 w-4 text-akiva-accent-text" />
                    Location transfer
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                  Inventory Location Transfers
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Send stock between locations and receive it when it arrives.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filters" title="Filters" onClick={() => setFiltersOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filtersOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Transfer panel" title="Transfer panel" onClick={() => setSidePanelOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <PanelRightOpen className="h-4 w-4" />
                </button>
                <Button onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  New transfer
                </Button>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void importCsv(event)} />
              </div>
            </div>
          </header>

          {filtersOpen ? (
            <div className="border-b border-akiva-border bg-akiva-surface/70 px-4 py-3 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 md:grid-cols-4">
                <div className="relative min-[520px]:col-span-2 md:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableQuery} onChange={(event) => setTableQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search transfer or location" />
                </div>
                <SearchableSelect value={filterFrom} onChange={setFilterFrom} options={locationOptions} inputClassName={inputClass} placeholder="From location" />
                <SearchableSelect value={filterTo} onChange={setFilterTo} options={locationOptions} inputClassName={inputClass} placeholder="To location" />
                <SearchableSelect value={filterStatus} onChange={setFilterStatus} options={statusFilterOptions} inputClassName={inputClass} placeholder="Status" />
              </div>
            </div>
          ) : null}

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            <section className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                label="Open transfers"
                value={String(pendingTransfers.length)}
                note={`${formatNumber(awaitingReceiptQty)} units awaiting receipt`}
                icon={Truck}
                active={filterStatus === 'All' && tableQuery === '' && filterFrom === 'All' && filterTo === 'All'}
                onClick={() => {
                  setFilterStatus('All');
                  setFilterFrom('All');
                  setFilterTo('All');
                  setTableQuery('');
                }}
              />
              <MetricCard
                label="Ready to receive"
                value={String(readyToReceiveCount)}
                note={`${formatNumber(readyToReceiveQty)} units not received yet`}
                icon={PackageCheck}
                active={filterStatus === 'Sent'}
                onClick={() => {
                  setFilterStatus('Sent');
                  setFilterFrom('All');
                  setFilterTo('All');
                  setTableQuery('');
                }}
              />
              <MetricCard
                label={partReceivedCount > 0 ? 'Part received' : 'Oldest waiting'}
                value={partReceivedCount > 0 ? String(partReceivedCount) : oldestTransfer ? `${oldestTransferAge}d` : '-'}
                note={partReceivedCount > 0 ? `${formatNumber(partReceivedQty)} units still open` : oldestTransfer ? `#${oldestTransfer.reference} ${oldestTransfer.fromLocation} to ${oldestTransfer.toLocation}` : 'No open transfers'}
                icon={Clock3}
                active={partReceivedCount > 0 ? filterStatus === 'Part received' : Boolean(oldestTransfer && tableQuery === String(oldestTransfer.reference))}
                onClick={() => {
                  setFilterFrom('All');
                  setFilterTo('All');
                  if (partReceivedCount > 0) {
                    setFilterStatus('Part received');
                    setTableQuery('');
                    return;
                  }
                  setFilterStatus('All');
                  setTableQuery(oldestTransfer ? String(oldestTransfer.reference) : '');
                }}
              />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="border-b border-akiva-border px-4 py-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Transfers awaiting receipt</h2>
                    <p className="mt-1 text-sm text-akiva-text-muted">Receive items when they arrive at the destination location.</p>
                  </div>
                  <div className="relative w-full xl:max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                    <input value={tableQuery} onChange={(event) => setTableQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search transfer or location" />
                  </div>
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="inventory-location-transfers"
                  columns={pendingColumns}
                  rows={filteredTransfers}
                  rowKey={(row) => String(row.reference)}
                  emptyMessage={loading ? 'Loading transfers...' : 'No transfers match these filters.'}
                  loading={loading}
                  initialPageSize={10}
                />
              </div>
            </section>
          </div>
        </section>
      </div>

      {sidePanelOpen ? (
        <div className="fixed inset-0 z-40">
          <button type="button" aria-label="Close transfer panel" className="absolute inset-0 bg-[#10090d]/25 backdrop-blur-[1px]" onClick={() => setSidePanelOpen(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-screen max-w-md flex-col border-l border-akiva-border bg-akiva-surface-raised text-akiva-text shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-akiva-border px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">Transfer panel</h2>
                <p className="mt-0.5 text-xs text-akiva-text-muted">Open transfers and shipment checks.</p>
              </div>
              <button type="button" aria-label="Close transfer panel" onClick={() => setSidePanelOpen(false)} className="rounded-lg p-2 text-akiva-text-muted transition hover:bg-akiva-accent-soft hover:text-akiva-accent-text">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <PanelSection title="Next actions" icon={PackageCheck}>
                <div className="space-y-2.5">
                  {pendingTransfers.slice(0, 6).map((transfer) => (
                    <button key={transfer.reference} type="button" onClick={() => openReceive(transfer.reference)} className="flex w-full items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-akiva-text">Receive transfer #{transfer.reference}</span>
                        <span className="mt-1 block truncate text-xs text-akiva-text-muted">{transfer.fromLocationName} to {transfer.toLocationName}</span>
                      </span>
                      <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(transfer.status)}`}>{transfer.status}</span>
                    </button>
                  ))}
                </div>
              </PanelSection>

              <PanelSection title="Shipment checks" icon={Check}>
                <div className="space-y-2.5">
                  <CheckRow checked label="Different source and destination" />
                  <CheckRow checked label="Stock checked before sending" />
                  <CheckRow checked label="Receiving remains separate" />
                </div>
              </PanelSection>
            </div>
          </aside>
        </div>
      ) : null}

      <Modal
        isOpen={transferOpen}
        onClose={() => !saving && setTransferOpen(false)}
        title={editingReference ? `Edit Inventory Transfer #${editingReference}` : 'Create Inventory Transfer'}
        size="xl"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setTransferOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={saving}>
              <Upload className="mr-2 h-4 w-4" />
              CSV import
            </Button>
            <Button type="button" onClick={createTransfer} disabled={saving || validationMessages.length > 0}>
              <Send className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : editingReference ? 'Save changes' : 'Send transfer'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {validationMessages.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {validationMessages[0]}
            </div>
          ) : null}

          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(12rem,0.9fr)_minmax(12rem,0.9fr)_minmax(18rem,1.4fr)]">
              <label className="block min-w-0">
                <span className="mb-2 block text-xs font-semibold uppercase text-akiva-text-muted">From location</span>
                <SearchableSelect value={fromLocation} onChange={(value) => setFromLocation(String(value))} options={locations} placeholder="Sending location" className={inputClass} />
              </label>
              <label className="block min-w-0">
                <span className="mb-2 block text-xs font-semibold uppercase text-akiva-text-muted">To location</span>
                <SearchableSelect value={toLocation} onChange={(value) => setToLocation(String(value))} options={locations.map((location) => ({ ...location, disabled: location.value === fromLocation }))} placeholder="Receiving location" className={inputClass} />
              </label>
              <div className="relative min-w-0 md:col-span-2 xl:col-span-1">
                <span className="mb-2 block text-xs font-semibold uppercase text-akiva-text-muted">Search item</span>
                <div className="relative min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    value={itemQuery}
                    onChange={(event) => setItemQuery(event.target.value)}
                    onFocus={() => setItemSearchFocused(true)}
                    onBlur={() => window.setTimeout(() => setItemSearchFocused(false), 160)}
                    className={`${inputClass} pl-10`}
                    placeholder="Type item code or name"
                  />
                </div>

                {itemSearchFocused ? (
                  <div className="absolute left-0 right-0 top-[4.35rem] z-30 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface-raised shadow-lg xl:min-w-[28rem]">
                    {itemsLoading && itemPage === 1 ? (
                      <div className="px-3 py-3 text-sm text-akiva-text-muted">Searching items...</div>
                    ) : itemRows.length === 0 ? (
                      <div className="px-3 py-3 text-sm text-akiva-text-muted">No items found.</div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto">
                        {itemRows.map((item) => (
                          <button
                            key={`${item.stockId}-${item.balance.available}`}
                            type="button"
                            onClick={() => addItem(item)}
                            className="flex w-full items-start justify-between gap-3 border-b border-akiva-border px-3 py-2.5 text-left last:border-b-0 hover:bg-akiva-surface-muted"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-akiva-text">{item.stockId} - {item.description}</span>
                              <span className="mt-1 block truncate text-xs text-akiva-text-muted">{item.category} . {item.units}</span>
                            </span>
                            <span className="shrink-0 rounded-full border border-akiva-border bg-akiva-surface px-2.5 py-1 text-xs font-semibold text-akiva-text">
                              {formatNumber(item.balance.available, item.decimalPlaces || 2)} available
                            </span>
                          </button>
                        ))}
                        {itemHasMore ? (
                          <button
                            type="button"
                            className="flex h-10 w-full items-center justify-center text-sm font-semibold text-akiva-accent-text hover:bg-akiva-accent-soft"
                            onClick={() => setItemPage((page) => page + 1)}
                            disabled={itemsLoading}
                          >
                            {itemsLoading ? 'Loading...' : `Show more (${itemTotal} matches)`}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            {lines.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-akiva-text-muted">
                <span className="rounded-full border border-akiva-border bg-akiva-surface px-2.5 py-1">{lines.length} lines</span>
                <span className="rounded-full border border-akiva-border bg-akiva-surface px-2.5 py-1">{formatNumber(totalQuantity)} total quantity</span>
                <span className="rounded-full border border-akiva-border bg-akiva-surface px-2.5 py-1">{formatMoney(totalCost)}</span>
              </div>
            ) : null}
          </section>

          <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-akiva-border p-4">
              <div>
                <h3 className="text-sm font-semibold text-akiva-text">Transfer lines</h3>
                <p className="mt-1 text-sm text-akiva-text-muted">{lines.length} lines . {formatNumber(totalQuantity)} total . {formatMoney(totalCost)}</p>
              </div>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm font-semibold text-akiva-text shadow-sm hover:border-rose-300 hover:text-rose-700 disabled:opacity-50" onClick={() => setLines([])} disabled={lines.length === 0}>
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-akiva-table-header text-xs font-semibold uppercase text-akiva-text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="sticky right-0 z-20 border-l border-akiva-border bg-akiva-table-header px-4 py-3 text-right shadow-[-10px_0_18px_rgba(15,23,42,0.08)]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-akiva-text-muted">Add items to prepare the shipment.</td></tr>
                  ) : lines.map((line) => {
                    const quantity = numericQuantity(line.quantity);
                    const available = line.balance?.available;
                    const overAvailable = typeof available === 'number' && quantity > available;
                    return (
                      <tr key={line.id} className="border-t border-akiva-border bg-akiva-surface-raised hover:bg-akiva-table-row-hover">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-akiva-text">{line.stockId}</div>
                          <div className="mt-1 max-w-[30rem] truncate text-xs text-akiva-text-muted">{line.description} {line.units ? `. ${line.units}` : ''}</div>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${overAvailable ? 'text-rose-700 dark:text-rose-300' : ''}`}>
                          {typeof available === 'number' ? formatNumber(available, line.decimalPlaces || 2) : 'Checked on send'}
                        </td>
                        <td className="px-4 py-3">
                          <input value={line.quantity} onChange={(event) => updateLine(line.id, event.target.value)} inputMode="decimal" className={quantityClass} />
                        </td>
                        <td className="sticky right-0 z-10 border-l border-akiva-border bg-akiva-surface-raised px-4 py-3 text-right shadow-[-10px_0_18px_rgba(15,23,42,0.08)]">
                          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm hover:border-rose-300 hover:text-rose-700" onClick={() => removeLine(line.id)} aria-label="Remove line" title="Remove line">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </Modal>

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
  active = false,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-lg border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70 focus:outline-none focus:ring-2 focus:ring-akiva-accent ${
        active ? 'border-akiva-accent bg-akiva-accent-soft/60' : 'border-akiva-border bg-akiva-surface-raised'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-akiva-text">{value}</p>
          <p className="mt-3 text-sm leading-5 text-akiva-text-muted">{note}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-akiva-accent-text transition ${active ? 'bg-white/80' : 'bg-akiva-accent-soft group-hover:bg-white/80'}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </button>
  );
}

function PanelSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-akiva-text">{title}</h3>
        <Icon className="h-5 w-5 text-akiva-accent" />
      </div>
      {children}
    </section>
  );
}

function CheckRow({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm">
      <span className="text-sm font-semibold text-akiva-text">{label}</span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border shadow-sm ${checked ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-transparent'}`}>
        <Check className="h-4 w-4 stroke-[3]" />
      </span>
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
  const Icon = type === 'success' ? CheckCircle2 : AlertTriangle;
  const tone =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950 dark:text-emerald-100'
      : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100';

  return (
    <div
      role={type === 'success' ? 'status' : 'alert'}
      className={`fixed bottom-4 right-4 z-[70] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl sm:max-w-md ${tone}`}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <p className="min-w-0 flex-1 leading-5">{message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        title="Dismiss notification"
        onClick={onClose}
        className="-mr-1 rounded-full p-1 opacity-70 transition hover:bg-white/50 hover:opacity-100 dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
