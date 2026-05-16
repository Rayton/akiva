import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCheck2,
  PackageMinus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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

interface Option {
  value: string;
  label: string;
  code?: string;
}

interface ReversibleGrn {
  grnNo: number;
  batch: number;
  purchaseOrder: number;
  podetailItem: number;
  supplierCode: string;
  supplierName: string;
  supplierReference: string;
  stockId: string;
  description: string;
  location: string;
  locationName: string;
  date: string;
  quantityReceived: number;
  quantityInvoiced: number;
  quantityToReverse: number;
  unitCost: number;
  value: number;
  currency: string;
  controlled: boolean;
  serialised: boolean;
  units: string;
  decimalPlaces: number;
  status: 'Uninvoiced' | 'Part invoiced';
}

interface WorkbenchPayload {
  suppliers: Option[];
  locations: Option[];
  reversibleGrns: ReversibleGrn[];
  currency: string;
  settings: {
    stockLedgerLinked: boolean;
  };
}

interface WorkbenchResponse {
  success: boolean;
  message?: string;
  data?: WorkbenchPayload;
}

interface ReverseResponse {
  success: boolean;
  message?: string;
  data?: {
    reversibleGrns?: ReversibleGrn[];
  };
  reversal?: {
    grnNo: number;
    quantityReversed: number;
  };
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm';

const labelClass = 'mb-2 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted';

function defaultFromDate(): string {
  return '';
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatMoney(value: number, currency = 'TZS'): string {
  return `${currency.toUpperCase()} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)}`;
}

function statusClass(status: ReversibleGrn['status']): string {
  if (status === 'Part invoiced') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
}

export function ReverseGoodsReceived() {
  const [payload, setPayload] = useState<WorkbenchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [supplier, setSupplier] = useState('All');
  const [location, setLocation] = useState('All');
  const [fromDate, setFromDate] = useState(defaultFromDate());
  const [search, setSearch] = useState('');
  const [selectedGrn, setSelectedGrn] = useState<ReversibleGrn | null>(null);
  const [detailGrn, setDetailGrn] = useState<ReversibleGrn | null>(null);
  const [reason, setReason] = useState('');

  const reversibleGrns = payload?.reversibleGrns ?? [];
  const suppliers = useMemo(() => [{ value: 'All', label: 'All suppliers' }, ...(payload?.suppliers ?? [])], [payload?.suppliers]);
  const locations = useMemo(() => [{ value: 'All', label: 'All locations' }, ...(payload?.locations ?? [])], [payload?.locations]);
  const defaultCurrency = payload?.currency ?? 'TZS';

  const loadWorkbench = async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (supplier !== 'All') params.set('supplier', supplier);
      if (location !== 'All') params.set('location', location);
      if (fromDate) params.set('fromDate', fromDate);
      if (search.trim()) params.set('q', search.trim());
      const response = await apiFetch(buildApiUrl(`/api/inventory/reverse-grn/workbench?${params.toString()}`));
      const json = (await response.json()) as WorkbenchResponse;
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.message || 'Goods received reversals could not be loaded.');
      }
      setPayload(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Goods received reversals could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkbench();
  }, [supplier, location, fromDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadWorkbench();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage('');
      setError('');
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [error, message]);

  const totalQuantity = reversibleGrns.reduce((sum, row) => sum + row.quantityToReverse, 0);
  const totalValue = reversibleGrns.reduce((sum, row) => sum + row.value, 0);
  const partInvoiced = reversibleGrns.filter((row) => row.status === 'Part invoiced').length;
  const controlledCount = reversibleGrns.filter((row) => row.controlled || row.serialised).length;

  const openReverse = (grn: ReversibleGrn) => {
    setSelectedGrn(grn);
    setReason('');
  };

  const reverseGrn = async () => {
    if (!selectedGrn) return;
    if (reason.trim() === '') {
      setError('Enter the reason for reversing this goods receipt.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await apiFetch(buildApiUrl(`/api/inventory/reverse-grn/${encodeURIComponent(String(selectedGrn.grnNo))}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const json = (await response.json()) as ReverseResponse;
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Goods receipt could not be reversed.');
      }

      setPayload((current) => current ? {
        ...current,
        reversibleGrns: json.data?.reversibleGrns ?? current.reversibleGrns.filter((row) => row.grnNo !== selectedGrn.grnNo),
      } : current);
      setSelectedGrn(null);
      setReason('');
      setMessage(`GRN ${selectedGrn.grnNo} reversed.`);
      await loadWorkbench();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Goods receipt could not be reversed.');
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<AdvancedTableColumn<ReversibleGrn>[]>(
    () => [
      {
        id: 'grnNo',
        header: 'GRN',
        accessor: (row) => row.grnNo,
        width: 110,
        cell: (row) => <span className="font-semibold text-akiva-text">#{row.grnNo}</span>,
      },
      {
        id: 'supplier',
        header: 'Supplier',
        accessor: (row) => `${row.supplierName} ${row.supplierCode}`,
        minWidth: 260,
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-akiva-text">{row.supplierName}</div>
            <div className="mt-1 text-xs text-akiva-text-muted">{row.supplierCode}{row.supplierReference ? ` . Ref ${row.supplierReference}` : ''}</div>
          </div>
        ),
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
        id: 'po',
        header: 'PO',
        accessor: (row) => row.purchaseOrder,
        width: 100,
        cell: (row) => <span className="font-semibold">#{row.purchaseOrder}</span>,
      },
      { id: 'date', header: 'Received', accessor: (row) => row.date, width: 130 },
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
      {
        id: 'quantityToReverse',
        header: 'Reverse',
        accessor: (row) => row.quantityToReverse,
        align: 'right',
        width: 130,
        cell: (row) => <span className="font-semibold">{formatNumber(row.quantityToReverse, row.decimalPlaces || 2)} {row.units}</span>,
      },
      {
        id: 'value',
        header: 'Value',
        accessor: (row) => row.value,
        align: 'right',
        width: 150,
        cell: (row) => <span className="font-semibold">{formatMoney(row.value, row.currency || defaultCurrency)}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => row.status,
        width: 140,
        cell: (row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>{row.status}</span>,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (row) => row.grnNo,
        sortable: false,
        filterable: false,
        sticky: 'right',
        align: 'right',
        width: 220,
        cell: (row) => (
          <div className="flex justify-end gap-2">
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text shadow-sm hover:border-akiva-accent hover:text-akiva-accent-text" onClick={() => setDetailGrn(row)}>
              <Eye className="h-4 w-4" />
              View
            </button>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-akiva-accent px-3 text-xs font-semibold text-white shadow-sm hover:bg-akiva-accent-strong" onClick={() => openReverse(row)}>
              <RotateCcw className="h-4 w-4" />
              Reverse
            </button>
          </div>
        ),
      },
    ],
    [defaultCurrency]
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
                    <FileCheck2 className="h-4 w-4 text-akiva-accent-text" />
                    Purchase receiving
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <PackageMinus className="h-4 w-4 text-akiva-accent-text" />
                    GRN reversals
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                  Reverse Goods Received
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Reverse uninvoiced goods receipts when a receiving mistake needs to be corrected.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh" title="Refresh" onClick={() => void loadWorkbench()} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button type="button" aria-label="Filter receipts" title="Filter receipts" onClick={() => setFilterOpen((open) => !open)} className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${filterOpen ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'}`}>
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {filterOpen ? (
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <SearchableSelect value={supplier} onChange={setSupplier} options={suppliers} inputClassName={inputClass} placeholder="Supplier" />
                  <SearchableSelect value={location} onChange={setLocation} options={locations} inputClassName={inputClass} placeholder="Location" />
                  <label className="block">
                    <span className="sr-only">Received after</span>
                    <DatePicker value={fromDate} onChange={setFromDate} inputClassName={inputClass} placeholder="Received after" clearable />
                  </label>
                </div>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Reversible GRNs" value={String(reversibleGrns.length)} note="Uninvoiced receipt balances" icon={FileCheck2} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Quantity to reverse" value={formatNumber(totalQuantity)} note="Across filtered receipts" icon={PackageMinus} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Receipt value" value={formatMoney(totalValue, defaultCurrency)} note="Estimated stock and GRN suspense impact" icon={RotateCcw} onClick={() => setFilterOpen(true)} />
              <MetricCard label="Controls" value={controlledCount > 0 ? String(controlledCount) : 'Clear'} note={partInvoiced > 0 ? `${partInvoiced} partially invoiced` : 'Only uninvoiced quantities can reverse'} icon={ShieldCheck} onClick={() => setFilterOpen(true)} />
            </section>

            <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-akiva-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Outstanding goods receipts</h2>
                  <p className="mt-1 text-sm text-akiva-text-muted">Only GRN balances not yet matched to a supplier invoice are shown.</p>
                </div>
                <div className="relative w-full md:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} pl-10`} placeholder="Search GRN, supplier or item" />
                </div>
              </div>
              <div className="p-4">
                <AdvancedTable
                  tableId="reverse-goods-received"
                  columns={columns}
                  rows={reversibleGrns}
                  rowKey={(row) => String(row.grnNo)}
                  emptyMessage={loading ? 'Loading goods receipts...' : 'No reversible goods receipts match these filters.'}
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
        isOpen={Boolean(selectedGrn)}
        onClose={() => !saving && setSelectedGrn(null)}
        title={selectedGrn ? `Reverse GRN #${selectedGrn.grnNo}` : 'Reverse GRN'}
        size="md"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setSelectedGrn(null)} disabled={saving}>Cancel</Button>
            <Button type="button" onClick={reverseGrn} disabled={saving || reason.trim() === ''}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {saving ? 'Posting...' : 'Post reversal'}
            </Button>
          </>
        }
      >
        {selectedGrn ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="text-sm font-semibold text-akiva-text">{selectedGrn.stockId} - {selectedGrn.description}</div>
              <div className="mt-2 text-sm text-akiva-text-muted">{selectedGrn.supplierName} . PO #{selectedGrn.purchaseOrder} . {selectedGrn.locationName}</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoTile label="Received" value={`${formatNumber(selectedGrn.quantityReceived, selectedGrn.decimalPlaces || 2)} ${selectedGrn.units}`} />
                <InfoTile label="Already invoiced" value={`${formatNumber(selectedGrn.quantityInvoiced, selectedGrn.decimalPlaces || 2)} ${selectedGrn.units}`} />
                <InfoTile label="Reverse now" value={`${formatNumber(selectedGrn.quantityToReverse, selectedGrn.decimalPlaces || 2)} ${selectedGrn.units}`} />
                <InfoTile label="Value" value={formatMoney(selectedGrn.value, selectedGrn.currency || defaultCurrency)} />
              </div>
              {selectedGrn.quantityInvoiced > 0 ? (
                <WarningText message="Only the uninvoiced balance will reverse. Invoiced quantity must be handled through supplier credit processing." />
              ) : null}
              {selectedGrn.controlled || selectedGrn.serialised ? (
                <WarningText message="Batch or serial quantities must still be available at the receiving location for this reversal to post." />
              ) : null}
            </section>
            <label className="block">
              <span className={labelClass}>Reason</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-[104px] w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-base text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent sm:text-sm" placeholder="Why is this goods receipt being reversed?" />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(detailGrn)}
        onClose={() => setDetailGrn(null)}
        title={detailGrn ? `GRN #${detailGrn.grnNo}` : 'GRN'}
        size="sm"
        footer={<Button type="button" onClick={() => setDetailGrn(null)}>Close</Button>}
      >
        {detailGrn ? (
          <div className="space-y-4">
            <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="font-semibold text-akiva-text">{detailGrn.stockId} - {detailGrn.description}</div>
              <div className="mt-2 text-sm text-akiva-text-muted">{detailGrn.supplierName} ({detailGrn.supplierCode})</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile label="GRN batch" value={String(detailGrn.batch)} />
                <InfoTile label="Purchase order" value={`#${detailGrn.purchaseOrder}`} />
                <InfoTile label="Received date" value={detailGrn.date} />
                <InfoTile label="Location" value={detailGrn.locationName} />
                <InfoTile label="Quantity to reverse" value={`${formatNumber(detailGrn.quantityToReverse, detailGrn.decimalPlaces || 2)} ${detailGrn.units}`} />
                <InfoTile label="Value" value={formatMoney(detailGrn.value, detailGrn.currency || defaultCurrency)} />
              </div>
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
