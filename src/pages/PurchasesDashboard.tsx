import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../components/common/Button';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

type PoStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Reviewed'
  | 'Authorised'
  | 'Printed'
  | 'Part Received'
  | 'Received'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

interface PoLine {
  id: string;
  itemCode: string;
  supplierItem: string;
  description: string;
  category: string;
  supplierUnits: string;
  receivingUnits: string;
  conversionFactor: number;
  quantityOrdered: number;
  quantityReceived: number;
  quantityInvoiced: number;
  deliveryDate: string;
  unitPrice: number;
  taxRate: number;
  glCode: string;
  controlled?: boolean;
  completed?: boolean;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  realOrderNumber: string;
  supplierCode: string;
  supplierName: string;
  supplierAddress: string;
  currency: 'TZS' | 'USD';
  exchangeRate: number;
  orderDate: string;
  deliveryDate: string;
  initiatedBy: string;
  reviewer: string;
  location: string;
  requisitionNo: string;
  paymentTerms: string;
  deliveryBy: string;
  comments: string;
  status: PoStatus;
  allowPrint: boolean;
  lines: PoLine[];
}

interface PurchaseOrdersApiResponse {
  success: boolean;
  data: PurchaseOrder[];
}

interface PipelineRow {
  label: string;
  count: number;
  value: number;
  action: string;
  path: string;
  color: string;
}

interface SupplierExposure {
  supplier: string;
  value: number;
  orders: number;
  waitingQty: number;
}

interface RiskOrder {
  order: PurchaseOrder;
  days: number;
  outstandingQty: number;
  value: number;
  risk: 'Overdue' | 'Due soon' | 'Waiting';
}

const pipelineColors = ['#2563eb', '#f59e0b', '#14b8a6', '#8b5cf6'];
const supplierColors = ['#0ea5e9', '#f97316', '#22c55e', '#7c3aed', '#ef4444'];

function chartColor(colors: string[], index: number): string {
  return colors[index % colors.length];
}

function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('akiva:navigation'));
}

function orderTotal(order: PurchaseOrder): number {
  return order.lines.reduce((sum, line) => sum + line.quantityOrdered * line.unitPrice * (1 + line.taxRate / 100), 0);
}

function outstandingQuantity(order: PurchaseOrder): number {
  return order.lines.reduce((sum, line) => sum + Math.max(line.quantityOrdered - line.quantityReceived, 0), 0);
}

function uninvoicedReceivedValue(order: PurchaseOrder): number {
  return order.lines.reduce((sum, line) => sum + Math.max(line.quantityReceived - line.quantityInvoiced, 0) * line.unitPrice, 0);
}

function formatMoney(value: number, currency = 'TZS'): string {
  return `${currency} ${new Intl.NumberFormat('en-US', {
    notation: Math.abs(value) >= 1000000 ? 'compact' : 'standard',
    maximumFractionDigits: 0,
  }).format(value || 0)}`;
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value || 0);
}

function formatDate(value: string): string {
  if (!value) return '-';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);
}

function openOrders(orders: PurchaseOrder[]): PurchaseOrder[] {
  return orders.filter((order) => !['Completed', 'Cancelled', 'Rejected'].includes(order.status));
}

function chartTooltip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-xs text-akiva-text shadow-xl">
      {children}
    </div>
  );
}

export function PurchasesDashboard() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(buildApiUrl('/api/purchases/orders?limit=500'));
      const payload = (await response.json()) as PurchaseOrdersApiResponse;
      if (!response.ok || !payload.success) {
        throw new Error('Purchases dashboard could not be loaded.');
      }
      setOrders(Array.isArray(payload.data) ? payload.data : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Purchases dashboard could not be loaded.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders, refreshKey]);

  const currency = orders.find((order) => order.currency)?.currency ?? 'TZS';
  const today = useMemo(() => new Date(new Date().toISOString().slice(0, 10)), []);

  const metrics = useMemo(() => {
    const open = openOrders(orders);
    const approval = orders.filter((order) => ['Pending Review', 'Reviewed'].includes(order.status));
    const receiving = orders.filter((order) => order.status === 'Printed' || order.status === 'Part Received');
    const billMatch = orders.filter((order) => order.status === 'Received');
    const overdue = receiving.filter((order) => new Date(`${order.deliveryDate}T00:00:00`) < today);

    return {
      openCommitment: open.reduce((sum, order) => sum + orderTotal(order), 0),
      openCount: open.length,
      approvalCount: approval.length,
      approvalValue: approval.reduce((sum, order) => sum + orderTotal(order), 0),
      receivingCount: receiving.length,
      receivingQty: receiving.reduce((sum, order) => sum + outstandingQuantity(order), 0),
      overdueCount: overdue.length,
      grnAccrual: billMatch.reduce((sum, order) => sum + uninvoicedReceivedValue(order), 0),
      billMatchCount: billMatch.length,
    };
  }, [orders, today]);

  const pipeline = useMemo<PipelineRow[]>(() => {
    const approval = orders.filter((order) => ['Pending Review', 'Reviewed'].includes(order.status));
    const printable = orders.filter((order) => order.status === 'Authorised');
    const receiving = orders.filter((order) => order.status === 'Printed' || order.status === 'Part Received');
    const billMatch = orders.filter((order) => order.status === 'Received');
    return [
      {
        label: 'Approve',
        count: approval.length,
        value: approval.reduce((sum, order) => sum + orderTotal(order), 0),
        action: 'Review and authorise',
        path: '/purchases/transactions/po-authorisemyorders',
        color: pipelineColors[0],
      },
      {
        label: 'Print',
        count: printable.length,
        value: printable.reduce((sum, order) => sum + orderTotal(order), 0),
        action: 'Print supplier POs',
        path: '/purchases/transactions/po-selectospurchorder',
        color: pipelineColors[1],
      },
      {
        label: 'Receive',
        count: receiving.length,
        value: receiving.reduce((sum, order) => sum + orderTotal(order), 0),
        action: 'Post GRNs',
        path: '/purchases/transactions/po-selectospurchorder',
        color: pipelineColors[2],
      },
      {
        label: 'Bill match',
        count: billMatch.length,
        value: billMatch.reduce((sum, order) => sum + uninvoicedReceivedValue(order), 0),
        action: 'Match invoices',
        path: '/purchases/inquiries-and-reports/outstanding-grns',
        color: pipelineColors[3],
      },
    ];
  }, [orders]);

  const supplierExposure = useMemo<SupplierExposure[]>(() => {
    const exposure = new Map<string, SupplierExposure>();
    openOrders(orders).forEach((order) => {
      const existing = exposure.get(order.supplierName) ?? { supplier: order.supplierName, value: 0, orders: 0, waitingQty: 0 };
      existing.value += orderTotal(order);
      existing.orders += 1;
      existing.waitingQty += outstandingQuantity(order);
      exposure.set(order.supplierName, existing);
    });
    return [...exposure.values()].sort((a, b) => b.value - a.value).slice(0, 5);
  }, [orders]);

  const riskOrders = useMemo<RiskOrder[]>(() => {
    return openOrders(orders)
      .map((order) => {
        const deliveryDate = new Date(`${order.deliveryDate}T00:00:00`);
        const days = Math.ceil((deliveryDate.getTime() - today.getTime()) / 86400000);
        const risk = days < 0 ? 'Overdue' : days <= 7 ? 'Due soon' : 'Waiting';
        return {
          order,
          days,
          outstandingQty: outstandingQuantity(order),
          value: orderTotal(order),
          risk,
        } satisfies RiskOrder;
      })
      .filter((row) => row.risk !== 'Waiting' || row.order.status === 'Pending Review')
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);
  }, [orders, today]);

  const topPipeline = pipeline.reduce((winner, item) => (item.count > winner.count ? item : winner), pipeline[0]);
  const topSupplier = supplierExposure[0] ?? null;

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Chip icon={ShoppingCart}>Purchases</Chip>
                  <Chip icon={Truck}>{metrics.receivingCount} waiting receipt</Chip>
                  <Chip icon={metrics.overdueCount > 0 ? AlertTriangle : CheckCircle2}>
                    {loading ? 'Updating purchases' : metrics.overdueCount > 0 ? `${metrics.overdueCount} overdue deliveries` : 'Delivery queue clean'}
                  </Chip>
                </div>
                <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                  Purchases Dashboard
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Purchase commitments, approval bottlenecks, delivery risk, and supplier exposure from current purchase orders.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button type="button" aria-label="Refresh purchases" title="Refresh purchases" onClick={() => setRefreshKey((value) => value + 1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <Button type="button" onClick={() => navigate('/purchases/transactions/po-header')}>
                  New PO
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                {error}
              </div>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Open commitment"
                value={formatMoney(metrics.openCommitment, currency)}
                note={`${metrics.openCount} open POs still affecting budget`}
                icon={FileText}
                onClick={() => navigate('/purchases/transactions/po-selectospurchorder')}
              />
              <MetricCard
                label="Approval queue"
                value={String(metrics.approvalCount)}
                note={`${formatMoney(metrics.approvalValue, currency)} waiting decision`}
                icon={ShieldCheck}
                tone={metrics.approvalCount > 0 ? 'amber' : 'default'}
                onClick={() => navigate('/purchases/transactions/po-authorisemyorders')}
              />
              <MetricCard
                label="Receiving queue"
                value={String(metrics.receivingCount)}
                note={`${formatNumber(metrics.receivingQty)} units expected`}
                icon={Truck}
                tone={metrics.overdueCount > 0 ? 'danger' : 'default'}
                onClick={() => navigate('/purchases/transactions/po-selectospurchorder')}
              />
              <MetricCard
                label="GRN accrual"
                value={formatMoney(metrics.grnAccrual, currency)}
                note={`${metrics.billMatchCount} received POs need invoice match`}
                icon={FileCheck2}
                onClick={() => navigate('/purchases/inquiries-and-reports/outstanding-grns')}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-[1fr_1fr_.9fr]">
              <ChartPanel title="Purchase bottleneck" note={topPipeline ? `${topPipeline.action} is the largest queue.` : 'No open purchase queues.'} icon={ClipboardCheck}>
                <PipelineChart rows={pipeline} currency={currency} loading={loading} />
              </ChartPanel>
              <ChartPanel title="Supplier exposure" note={topSupplier ? `${topSupplier.supplier} holds the largest open commitment.` : 'No supplier commitments found.'} icon={Users}>
                <SupplierChart rows={supplierExposure} currency={currency} loading={loading} />
              </ChartPanel>
              <ChartPanel title="Commitment split" note="Value by purchase order workflow stage." icon={ReceiptText}>
                <CommitmentPie rows={pipeline} currency={currency} loading={loading} />
              </ChartPanel>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
              <Panel title="Delivery and approval risk" icon={AlertTriangle}>
                {riskOrders.length === 0 ? (
                  <EmptyState message={loading ? 'Loading purchase risk...' : 'No urgent delivery or approval risk found.'} />
                ) : (
                  <div className="space-y-2">
                    {riskOrders.map((row) => (
                      <button
                        key={row.order.id}
                        type="button"
                        onClick={() => navigate('/purchases/transactions/po-selectospurchorder')}
                        className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-akiva-text">PO #{row.order.orderNumber}</span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${riskClass(row.risk)}`}>{row.risk}</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-akiva-text-muted">{row.order.supplierName} · due {formatDate(row.order.deliveryDate)}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-akiva-text">{formatMoney(row.value, row.order.currency)}</p>
                            <p className="mt-1 text-xs text-akiva-text-muted">{formatNumber(row.outstandingQty)} units open</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Next best actions" icon={CalendarClock}>
                <ActionRow label="Authorise pending orders" value={`${metrics.approvalCount} POs`} icon={ShieldCheck} path="/purchases/transactions/po-authorisemyorders" />
                <ActionRow label="Receive printed orders" value={`${metrics.receivingCount} POs`} icon={Truck} path="/purchases/transactions/po-selectospurchorder" />
                <ActionRow label="Match outstanding GRNs" value={`${metrics.billMatchCount} POs`} icon={FileCheck2} path="/purchases/inquiries-and-reports/outstanding-grns" />
                <ActionRow label="Review suppliers" value={`${supplierExposure.length} active suppliers`} icon={Users} path="/purchases/maintenance/supplier-maintenance" />
              </Panel>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}

function Chip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <Icon className="h-4 w-4 text-akiva-accent-text" />
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'default',
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  tone?: 'default' | 'amber' | 'danger';
  onClick: () => void;
}) {
  const iconTone =
    tone === 'danger'
      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
        : 'bg-akiva-accent-soft text-akiva-accent-text';

  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-3 truncate text-2xl font-semibold text-akiva-text">{value}</p>
          <p className="mt-3 text-sm leading-5 text-akiva-text-muted">{note}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </button>
  );
}

function ChartPanel({ title, note, icon: Icon, children }: { title: string; note: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-akiva-border bg-gradient-to-br from-white via-white to-sky-50/70 p-4 shadow-sm dark:from-slate-950/90 dark:via-slate-950/80 dark:to-slate-900/80">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{note}</p>
        </div>
      </div>
      <div className="mt-4 h-[260px] min-w-0">{children}</div>
    </section>
  );
}

function PipelineChart({ rows, currency, loading }: { rows: PipelineRow[]; currency: string; loading: boolean }) {
  if (rows.every((row) => row.count === 0)) {
    return <ChartEmptyState loading={loading} message="No open workflow queues found." />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 30, left: 12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148, 163, 184, 0.25)" />
        <XAxis type="number" tick={{ fill: '#8b6f7d', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={82} tick={{ fill: '#3f2b36', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(37, 99, 235, 0.08)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const row = payload[0].payload as PipelineRow;
          return chartTooltip({
            children: (
              <>
                <p className="font-semibold">{row.action}</p>
                <p className="mt-1 text-akiva-text-muted">{row.count} orders</p>
                <p className="mt-1 text-akiva-text-muted">{formatMoney(row.value, currency)}</p>
              </>
            ),
          });
        }} />
        <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={22} background={{ fill: 'rgba(148, 163, 184, 0.14)', radius: 8 }}>
          {rows.map((row) => <Cell key={row.label} fill={row.color} />)}
          <LabelList dataKey="count" position="right" className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-200" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SupplierChart({ rows, currency, loading }: { rows: SupplierExposure[]; currency: string; loading: boolean }) {
  if (rows.length === 0) {
    return <ChartEmptyState loading={loading} message="No supplier exposure found." />;
  }
  const data = rows.map((row) => ({ ...row, supplierLabel: row.supplier.length > 18 ? `${row.supplier.slice(0, 18)}...` : row.supplier }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 14, right: 14, left: -20, bottom: 18 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.25)" />
        <XAxis dataKey="supplierLabel" tick={{ fill: '#8b6f7d', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={48} />
        <YAxis tickFormatter={(value) => formatMoney(Number(value), currency)} tick={{ fill: '#8b6f7d', fontSize: 10 }} axisLine={false} tickLine={false} width={72} />
        <Tooltip cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const row = payload[0].payload as SupplierExposure;
          return chartTooltip({
            children: (
              <>
                <p className="font-semibold">{row.supplier}</p>
                <p className="mt-1 text-akiva-text-muted">{formatMoney(row.value, currency)}</p>
                <p className="mt-1 text-akiva-text-muted">{row.orders} orders · {formatNumber(row.waitingQty)} units open</p>
              </>
            ),
          });
        }} />
        <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={26} background={{ fill: 'rgba(148, 163, 184, 0.12)', radius: 8 }}>
          {data.map((row, index) => <Cell key={row.supplier} fill={chartColor(supplierColors, index)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CommitmentPie({ rows, currency, loading }: { rows: PipelineRow[]; currency: string; loading: boolean }) {
  const data = rows.filter((row) => row.value > 0);
  if (data.length === 0) {
    return <ChartEmptyState loading={loading} message="No commitment value found." />;
  }

  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-2">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius="50%" outerRadius="78%" paddingAngle={4} stroke="#ffffff" strokeWidth={3}>
            {data.map((row) => <Cell key={row.label} fill={row.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload as PipelineRow;
            return chartTooltip({
              children: (
                <>
                  <p className="font-semibold">{row.label}</p>
                  <p className="mt-1 text-akiva-text-muted">{formatMoney(row.value, currency)}</p>
                </>
              ),
            });
          }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {data.map((row) => (
          <div key={row.label} className="flex min-w-0 items-center gap-2 rounded-full bg-white/70 px-2 py-1 dark:bg-slate-900/60">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
            <span className="truncate font-medium text-akiva-text">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartEmptyState({ loading, message }: { loading: boolean; message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 text-center text-sm text-akiva-text-muted">
      {loading ? 'Loading chart...' : message}
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-akiva-accent-text" />
        <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ActionRow({ label, value, icon: Icon, path }: { label: string; value: string; icon: LucideIcon; path: string }) {
  return (
    <button type="button" onClick={() => navigate(path)} className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition last:mb-0 hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-akiva-text">{label}</span>
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">{value}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-akiva-text-muted" />
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
      {message}
    </div>
  );
}

function riskClass(risk: RiskOrder['risk']): string {
  if (risk === 'Overdue') return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200';
  if (risk === 'Due soon') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}
