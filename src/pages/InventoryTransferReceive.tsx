import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
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

interface LocationOption {
  value: string;
  label: string;
  code: string;
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

interface ReceiveWorkbenchPayload {
  locations: LocationOption[];
  pendingTransfers: PendingTransfer[];
}

interface ReceiveWorkbenchResponse {
  success: boolean;
  message?: string;
  data?: ReceiveWorkbenchPayload;
}

interface TransferDetailLine {
  stockId: string;
  description: string;
  units: string;
  category: string;
  decimalPlaces: number;
  controlled: boolean;
  serialised: boolean;
  unitCost: number;
  quantity: number;
  receivedQuantity: number;
}

interface TransferDetail {
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
  lines: TransferDetailLine[];
}

interface TransferDetailResponse {
  success: boolean;
  message?: string;
  data?: TransferDetail;
}

interface ReceiveLine {
  stockId: string;
  description: string;
  units: string;
  decimalPlaces: number;
  controlled: boolean;
  serialised: boolean;
  shippedQuantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  quantity: string;
  cancelBalance: boolean;
}

interface ReceiveResponse {
  success: boolean;
  message?: string;
  data?: {
    pendingTransfers?: PendingTransfer[];
  };
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const quantityClass =
  'h-10 w-full min-w-[6.5rem] rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-right text-sm font-semibold text-akiva-text shadow-sm focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function numericQuantity(value: string): number {
  return Number(value.replace(/,/g, '')) || 0;
}

function statusClass(status: PendingTransfer['status']): string {
  if (status === 'Part received') return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
}

export function InventoryTransferReceive() {
  const [payload, setPayload] = useState<ReceiveWorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tableQuery, setTableQuery] = useState('');
  const [receivingLocation, setReceivingLocation] = useState('All');
  const [selectedTransfer, setSelectedTransfer] = useState<TransferDetail | null>(null);
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiveOpen, setReceiveOpen] = useState(false);

  const locations = payload?.locations ?? [];
  const pendingTransfers = payload?.pendingTransfers ?? [];
  const locationOptions = useMemo(() => [{ value: 'All', label: 'All receiving locations' }, ...locations], [locations]);

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const query = receivingLocation !== 'All' ? `?receivingLocation=${encodeURIComponent(receivingLocation)}` : '';
      const response = await apiFetch(buildApiUrl(`/api/inventory/transfers/receiving/workbench${query}`));
      const json = (await response.json()) as ReceiveWorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Inventory transfers could not be loaded.');
      }

      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Inventory transfers could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, [receivingLocation]);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference');
    if (reference) {
      void openReceive(Number(reference));
    }
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const filteredTransfers = useMemo(() => {
    const search = tableQuery.trim().toLowerCase();
    if (!search) return pendingTransfers;

    return pendingTransfers.filter((transfer) => [
      transfer.reference,
      transfer.fromLocation,
      transfer.fromLocationName,
      transfer.toLocation,
      transfer.toLocationName,
      transfer.status,
    ].join(' ').toLowerCase().includes(search));
  }, [pendingTransfers, tableQuery]);

  const totalOutstanding = pendingTransfers.reduce((sum, transfer) => sum + transfer.outstandingQuantity, 0);
  const partReceivedCount = pendingTransfers.filter((transfer) => transfer.status === 'Part received').length;
  const oldestTransfer = pendingTransfers.reduce<PendingTransfer | null>((oldest, transfer) => {
    if (!oldest) return transfer;
    return Date.parse(transfer.shipDate) < Date.parse(oldest.shipDate) ? transfer : oldest;
  }, null);
  const oldestTransferAge = oldestTransfer
    ? Math.max(0, Math.floor((Date.now() - Date.parse(oldestTransfer.shipDate)) / 86_400_000))
    : 0;

  const receiveTotal = receiveLines.reduce((sum, line) => sum + numericQuantity(line.quantity), 0);
  const controlledCount = receiveLines.filter((line) => line.controlled).length;
  const validationMessages = useMemo(() => {
    const messages: string[] = [];
    if (!selectedTransfer) messages.push('Choose a transfer to receive.');
    if (!receivedAt) messages.push('Choose the receiving date.');
    if (receiveLines.length === 0) messages.push('Choose a transfer with items to receive.');

    receiveLines.forEach((line) => {
      const quantity = numericQuantity(line.quantity);
      if (quantity < 0) messages.push(`${line.stockId} cannot be negative.`);
      if (quantity > line.outstandingQuantity) messages.push(`${line.stockId} has only ${formatNumber(line.outstandingQuantity, line.decimalPlaces || 2)} left to receive.`);
      if (quantity > 0 && line.controlled) messages.push(`${line.stockId} needs batch or serial receiving.`);
    });

    if (receiveLines.length > 0 && receiveTotal <= 0 && !receiveLines.some((line) => line.cancelBalance)) {
      messages.push('Enter a quantity to receive, or cancel a remaining balance.');
    }

    return messages;
  }, [receiveLines, receiveTotal, receivedAt, selectedTransfer]);

  const openReceive = async (reference: number) => {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/transfers/${reference}`));
      const json = (await response.json()) as TransferDetailResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Transfer could not be loaded.');
      }

      const lines = json.data.lines
        .map((line) => {
          const outstanding = Math.max(0, line.quantity - line.receivedQuantity);
          return {
            stockId: line.stockId,
            description: line.description,
            units: line.units,
            decimalPlaces: line.decimalPlaces,
            controlled: line.controlled,
            serialised: line.serialised,
            shippedQuantity: line.quantity,
            receivedQuantity: line.receivedQuantity,
            outstandingQuantity: outstanding,
            quantity: line.controlled ? '0' : String(outstanding),
            cancelBalance: false,
          };
        })
        .filter((line) => line.outstandingQuantity > 0);

      setSelectedTransfer(json.data);
      setReceiveLines(lines);
      setReceiveOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transfer could not be loaded.');
    } finally {
      setSaving(false);
    }
  };

  const updateLineQuantity = (stockId: string, quantity: string) => {
    setReceiveLines((current) => current.map((line) => (line.stockId === stockId ? { ...line, quantity } : line)));
  };

  const updateLineCancel = (stockId: string, cancelBalance: boolean) => {
    setReceiveLines((current) => current.map((line) => (line.stockId === stockId ? { ...line, cancelBalance } : line)));
  };

  const receiveTransfer = async () => {
    if (!selectedTransfer) return;
    if (validationMessages.length > 0) {
      setError(validationMessages[0]);
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/transfers/${selectedTransfer.reference}/receive`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receivedAt,
          lines: receiveLines.map((line) => ({
            stockId: line.stockId,
            quantity: numericQuantity(line.quantity),
            cancelBalance: line.cancelBalance,
          })),
        }),
      });
      const json = (await response.json()) as ReceiveResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Transfer could not be received.');
      }

      setPayload((current) => current ? {
        ...current,
        pendingTransfers: json.data?.pendingTransfers ?? current.pendingTransfers,
      } : current);
      setReceiveOpen(false);
      setSelectedTransfer(null);
      setReceiveLines([]);
      setMessage(`Transfer ${selectedTransfer.reference} received.`);
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Transfer could not be received.');
    } finally {
      setSaving(false);
    }
  };

  const openPrint = (reference: number) => {
    window.open(buildApiUrl(`/api/inventory/transfers/${encodeURIComponent(String(reference))}/print`), '_blank', 'noopener,noreferrer');
  };

  const columns = useMemo<AdvancedTableColumn<PendingTransfer>[]>(
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
        minWidth: 300,
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
      { id: 'items', header: 'Items', accessor: (row) => row.itemCount, align: 'right', width: 90 },
      {
        id: 'outstanding',
        header: 'To receive',
        accessor: (row) => row.outstandingQuantity,
        align: 'right',
        width: 140,
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
        width: 230,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => openPrint(row.reference)}>
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-akiva-accent px-3 text-xs font-semibold text-white shadow-sm hover:bg-akiva-accent-strong" onClick={() => void openReceive(row.reference)}>
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
                    <PackageCheck className="h-4 w-4 text-akiva-accent-text" />
                    Inventory transactions
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <Truck className="h-4 w-4 text-akiva-accent-text" />
                    Transfer receiving
                  </span>
                </div>
                <h1 className="mt-4 text-xl font-semibold tracking-normal text-akiva-text sm:text-[1.625rem] lg:text-[2rem]">
                  Receive Inventory Transfers
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Confirm arriving transfer quantities and post stock into the receiving location.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            <section className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Awaiting receipt" value={String(pendingTransfers.length)} note={`${formatNumber(totalOutstanding)} units in transit`} icon={Truck} />
              <MetricCard label="Part received" value={String(partReceivedCount)} note="Transfers with remaining balances" icon={PackageCheck} />
              <MetricCard label="Oldest waiting" value={oldestTransfer ? `${oldestTransferAge}d` : '-'} note={oldestTransfer ? `Transfer #${oldestTransfer.reference}` : 'No open transfers'} icon={Clock3} />
            </section>

            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={tableQuery} onChange={(event) => setTableQuery(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search transfer or location" />
                </div>
                <SearchableSelect value={receivingLocation} onChange={setReceivingLocation} options={locationOptions} inputClassName={inputClass} placeholder="Receiving location" />
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="border-b border-akiva-border px-4 py-3">
                <h2 className="text-sm font-semibold text-akiva-text">Incoming transfers</h2>
                <p className="mt-1 text-sm text-akiva-text-muted">Receive only what arrived. Cancel a remaining balance only when the shortage is confirmed.</p>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="inventory-transfer-receiving"
                  columns={columns}
                  rows={filteredTransfers}
                  rowKey={(row) => String(row.reference)}
                  emptyMessage={loading ? 'Loading transfers...' : 'No incoming transfers match these filters.'}
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
        isOpen={receiveOpen}
        onClose={() => !saving && setReceiveOpen(false)}
        title={selectedTransfer ? `Receive Transfer #${selectedTransfer.reference}` : 'Receive Transfer'}
        size="xl"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setReceiveOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={receiveTransfer} disabled={saving || validationMessages.length > 0}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {saving ? 'Posting...' : 'Post receipt'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {selectedTransfer ? (
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                <div>
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">From</span>
                  <div className="mt-1 font-semibold text-akiva-text">{selectedTransfer.fromLocationName}</div>
                  <div className="text-xs text-akiva-text-muted">{selectedTransfer.fromLocation}</div>
                </div>
                <ArrowRight className="hidden h-5 w-5 text-akiva-text-muted md:block" />
                <div>
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">To</span>
                  <div className="mt-1 font-semibold text-akiva-text">{selectedTransfer.toLocationName}</div>
                  <div className="text-xs text-akiva-text-muted">{selectedTransfer.toLocation}</div>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase text-akiva-text-muted">Received date</span>
                  <input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} className={inputClass} />
                </label>
                <InfoTile label="Outstanding" value={formatNumber(selectedTransfer.outstandingQuantity)} />
                <InfoTile label="This receipt" value={formatNumber(receiveTotal)} />
              </div>
            </section>
          ) : null}

          {controlledCount > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{controlledCount} item{controlledCount === 1 ? '' : 's'} need batch or serial receiving before posting.</span>
            </div>
          ) : null}

          {validationMessages.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{validationMessages[0]}</span>
            </div>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead className="bg-akiva-table-header text-xs font-semibold uppercase text-akiva-text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-right">Sent</th>
                    <th className="px-4 py-3 text-right">Received</th>
                    <th className="px-4 py-3 text-right">Open</th>
                    <th className="px-4 py-3 text-right">Receive now</th>
                    <th className="sticky right-0 z-20 border-l border-akiva-border bg-akiva-table-header px-4 py-3 text-right shadow-[-10px_0_18px_rgba(15,23,42,0.08)]">Short close</th>
                  </tr>
                </thead>
                <tbody>
                  {receiveLines.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-akiva-text-muted">This transfer has no open lines.</td></tr>
                  ) : receiveLines.map((line) => {
                    const decimals = line.decimalPlaces || 2;
                    return (
                      <tr key={line.stockId} className="border-t border-akiva-border bg-akiva-surface-raised hover:bg-akiva-table-row-hover">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-akiva-text">{line.stockId}</div>
                          <div className="mt-1 max-w-[30rem] truncate text-xs text-akiva-text-muted">
                            {line.description} {line.units ? `. ${line.units}` : ''}{line.controlled ? ' . batch/serial controlled' : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatNumber(line.shippedQuantity, decimals)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(line.receivedQuantity, decimals)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatNumber(line.outstandingQuantity, decimals)}</td>
                        <td className="px-4 py-3">
                          <input value={line.quantity} onChange={(event) => updateLineQuantity(line.stockId, event.target.value)} inputMode="decimal" className={quantityClass} disabled={line.controlled} />
                        </td>
                        <td className="sticky right-0 z-10 border-l border-akiva-border bg-akiva-surface-raised px-4 py-3 text-right shadow-[-10px_0_18px_rgba(15,23,42,0.08)]">
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-akiva-text-muted">
                            <input type="checkbox" checked={line.cancelBalance} onChange={(event) => updateLineCancel(line.stockId, event.target.checked)} className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent" />
                            Cancel balance
                          </label>
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

function MetricCard({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-left shadow-sm">
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
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
      <div className="text-xs font-semibold uppercase text-akiva-text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-akiva-text">{value}</div>
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
  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-akiva-text shadow-2xl" role={isError ? 'alert' : 'status'}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isError ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {isError ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{isError ? 'Could not post' : 'Done'}</p>
          <p className="mt-1 text-sm text-akiva-text-muted">{message}</p>
        </div>
        <button type="button" aria-label="Close notification" onClick={onClose} className="rounded-md p-1 text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
