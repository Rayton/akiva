import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  PackageCheck,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  cancelSalesContract,
  createSalesOrderOnline,
  createSalesContract,
  fetchOnlineSalesOrders,
  fetchSalesContractDetail,
  fetchSalesContractLookups,
  fetchSalesContracts,
  fetchOutstandingSalesOrders,
  fetchPickingListCandidates,
  fetchRecurringTemplates,
  fetchSalesCustomerTrend,
  fetchSalesDashboard,
  fetchSalesCustomers,
  fetchSalesDailyInquiry,
  fetchSalesItems,
  fetchSalesLowGrossReport,
  fetchSalesOrderStatus,
  fetchSalesPriceList,
  fetchSalesReportSummary,
  fetchSalesSettings,
  fetchSalesTopItems,
  fetchSalesTransactions,
  processRecurringOrders,
  quoteSalesContract,
  updateSalesContract,
} from '../data/salesApi';
import {
  createSalesOrderDraft,
  listSalesOrders,
  upsertOrdersFromWebErp,
} from '../lib/offline/salesRepository';
import { startSalesSync } from '../lib/offline/salesSync';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { DatePicker } from '../components/common/DatePicker';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { formatDateWithSystemFormat, useSystemDateFormat } from '../lib/dateFormat';
import {
  SalesCustomer,
  SalesCustomerTrendPayload,
  SalesContractDetail,
  SalesContractLookups,
  SalesContractPayload,
  SalesContractSummary,
  SalesDashboardAction,
  SalesDashboardPayload,
  SalesDashboardTone,
  SalesDailySalesRow,
  SalesLowGrossRow,
  SalesOrderLineInput,
  SalesOrderListItem,
  SalesOrderStatusRow,
  SalesOutstandingOrder,
  SalesPickingCandidate,
  SalesPriceListItem,
  SalesRecurringTemplate,
  SalesReportSummary,
  SalesSettings,
  SalesStockItem,
  SalesTopItem,
  SalesTransaction,
} from '../types/sales';

const COUCHDB_SALES_URL = import.meta.env.VITE_COUCHDB_SALES_URL;
const COUCHDB_USERNAME = import.meta.env.VITE_COUCHDB_USERNAME;
const COUCHDB_PASSWORD = import.meta.env.VITE_COUCHDB_PASSWORD;

type SyncVisualState = 'idle' | 'active' | 'paused' | 'error';
export type SalesModuleMode = 'transactions' | 'reports' | 'settings';

type SalesDrawerKey =
  | 'enter-order'
  | 'counter-sales'
  | 'print-picking-lists'
  | 'outstanding-sales-orders'
  | 'special-order'
  | 'recurring-order-template'
  | 'process-recurring-orders'
  | 'order-inquiry'
  | 'print-price-lists'
  | 'order-status-report'
  | 'orders-invoiced-reports'
  | 'daily-sales-inquiry'
  | 'order-delivery-differences-report'
  | 'difot-report'
  | 'sales-order-detail-summary'
  | 'top-sales-items-report'
  | 'sales-with-low-gross-profit-report'
  | 'select-contract'
  | 'create-contract';

interface SalesOrdersProps {
  mode?: SalesModuleMode;
  sourceSlug?: string;
}

interface DraftFormState {
  debtorNo: string;
  customerName: string;
  customerRef: string;
  grossTotal: string;
}

interface CreateOrderFormState {
  customerKey: string;
  customerRef: string;
  buyerName: string;
  orderType: string;
  stockId: string;
  quantity: string;
  unitPrice: string;
}

interface ContractFormState {
  contractRef: string;
  contractDescription: string;
  debtorNo: string;
  branchCode: string;
  categoryId: string;
  locationCode: string;
  requiredDate: string;
  margin: string;
  customerRef: string;
  exchangeRate: string;
  defaultWorkCentre: string;
}

interface ContractBomDraftLine {
  stockId: string;
  workCentreCode: string;
  quantity: string;
}

interface ContractRequirementDraftLine {
  requirement: string;
  quantity: string;
  costPerUnit: string;
}

function formatCurrency(value: number, currency = 'TZS'): string {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'TZS';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'TZS',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  }
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}

function formatPercent(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatNumber(value, 1)}%`;
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractIsoDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : localIsoDate(date);
}

function formatDateTime(value: string | undefined, dateFormat: string): string {
  const raw = value || new Date().toISOString();
  const formattedDate = formatDateWithSystemFormat(extractIsoDate(raw), dateFormat);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return formattedDate || raw;
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${formattedDate} ${time}`.trim();
}

function formatDate(value: string | null | undefined, dateFormat: string): string {
  return formatDateWithSystemFormat(extractIsoDate(value), dateFormat);
}

const salesChartTooltipContentStyle = {
  backgroundColor: 'var(--akiva-chart-tooltip-bg)',
  border: '1px solid var(--akiva-chart-tooltip-border)',
  borderRadius: '8px',
  color: 'var(--akiva-chart-tooltip-text)',
  boxShadow: '0 18px 38px rgba(0, 0, 0, 0.22)',
};

const salesChartTooltipTextStyle = {
  color: 'var(--akiva-chart-tooltip-text)',
  fontWeight: 600,
};

const salesTrendColors = [
  'var(--akiva-chart-ink)',
  'var(--akiva-chart-success)',
  'var(--akiva-chart-warning)',
  'var(--akiva-chart-danger)',
  'var(--akiva-chart-brand)',
];

function formatCompactCurrency(value: number, currency = 'TZS'): string {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'TZS';
  return `${safeCurrency} ${new Intl.NumberFormat('en-US', {
    notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(Number.isFinite(value) ? value : 0)}`;
}

function statusLabel(order: SalesOrderListItem): string {
  if (order.syncState === 'pending') return 'Pending Sync';
  if (order.source === 'local-draft') return 'Draft';
  return 'Synced';
}

function defaultRequiredDate(): string {
  const today = new Date();
  today.setDate(today.getDate() + 30);
  return today.toISOString().slice(0, 10);
}

function newContractFormState(): ContractFormState {
  return {
    contractRef: '',
    contractDescription: '',
    debtorNo: '',
    branchCode: '',
    categoryId: '',
    locationCode: '',
    requiredDate: defaultRequiredDate(),
    margin: '50',
    customerRef: '',
    exchangeRate: '1',
    defaultWorkCentre: '',
  };
}

function normalizeSalesSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveSalesDrawerKey(slug: string): SalesDrawerKey | null {
  const key = normalizeSalesSlug(slug);
  if (!key) return null;

  if (key.includes('selectorderitems')) return 'enter-order';
  if (key.includes('countersales')) return 'counter-sales';
  if (key.includes('pdfpickinglist')) return 'print-picking-lists';
  if (key.includes('selectsalesorder')) return 'outstanding-sales-orders';
  if (key.includes('specialorder')) return 'special-order';
  if (key.includes('selectrecurringsalesorder')) return 'recurring-order-template';
  if (key.includes('recurringsalesordersprocess')) return 'process-recurring-orders';

  if (key.includes('selectcompletedorder')) return 'order-inquiry';
  if (key.includes('pdfpricelist')) return 'print-price-lists';
  if (key.includes('pdforderstatus')) return 'order-status-report';
  if (key.includes('pdfordersinvoiced')) return 'orders-invoiced-reports';
  if (key.includes('dailysalesinquiry')) return 'daily-sales-inquiry';
  if (key.includes('pdfdeliverydifferences')) return 'order-delivery-differences-report';
  if (key.includes('pdfdifot')) return 'difot-report';
  if (key.includes('salesinquiry')) return 'sales-order-detail-summary';
  if (key.includes('topitems')) return 'top-sales-items-report';
  if (key.includes('pdflowgp')) return 'sales-with-low-gross-profit-report';

  if (key.includes('selectcontract')) return 'select-contract';
  if (key.includes('contracts')) return 'create-contract';

  return null;
}

function drawerMeta(drawerKey: SalesDrawerKey): { title: string; subtitle: string } {
  switch (drawerKey) {
    case 'enter-order':
      return { title: 'Enter Order or Quotation', subtitle: 'Create and submit sales orders in one compact flow.' };
    case 'counter-sales':
      return { title: 'Counter Sales', subtitle: 'Fast point-of-sale style entry for immediate customer sales.' };
    case 'print-picking-lists':
      return { title: 'Print Picking Lists', subtitle: 'Orders with open quantities ready for picking.' };
    case 'outstanding-sales-orders':
      return { title: 'Outstanding Sales Orders/Quotations', subtitle: 'Track open lines and outstanding quantity.' };
    case 'special-order':
      return { title: 'Special Order', subtitle: 'Create non-standard or exception sales orders.' };
    case 'recurring-order-template':
      return { title: 'Recurring Order Template', subtitle: 'Review recurring sales templates and schedules.' };
    case 'process-recurring-orders':
      return { title: 'Process Recurring Orders', subtitle: 'Generate due sales orders from templates.' };
    case 'order-inquiry':
      return { title: 'Order Inquiry', subtitle: 'Inquiry view for currently open sales orders.' };
    case 'print-price-lists':
      return { title: 'Print Price Lists', subtitle: 'Current active price list by stock item and sales type.' };
    case 'order-status-report':
      return { title: 'Order Status Report', subtitle: 'Order completion progress and value summary.' };
    case 'orders-invoiced-reports':
      return { title: 'Orders Invoiced Reports', subtitle: 'Customer transaction history with invoice totals.' };
    case 'daily-sales-inquiry':
      return { title: 'Daily Sales Inquiry', subtitle: 'Daily invoiced totals over the recent period.' };
    case 'order-delivery-differences-report':
      return { title: 'Order Delivery Differences Report', subtitle: 'Late or pending deliveries requiring attention.' };
    case 'difot-report':
      return { title: 'DIFOT Report', subtitle: 'Delivery-In-Full-On-Time operational snapshot.' };
    case 'sales-order-detail-summary':
      return { title: 'Sales Order Detail/Summary Inquiry', subtitle: 'Line completion and gross totals by order.' };
    case 'top-sales-items-report':
      return { title: 'Top Sales Items Report', subtitle: 'Highest performing items by sales value.' };
    case 'sales-with-low-gross-profit-report':
      return { title: 'Sales With Low Gross Profit Report', subtitle: 'Potential low-margin issues requiring follow-up.' };
    case 'select-contract':
      return { title: 'Select Contract', subtitle: 'Contract maintenance entry point.' };
    case 'create-contract':
      return { title: 'Create Contract', subtitle: 'Contract creation workflow.' };
  }
}

function drawerSupportsSearch(drawerKey: SalesDrawerKey): boolean {
  return ![
    'daily-sales-inquiry',
    'top-sales-items-report',
    'sales-with-low-gross-profit-report',
    'process-recurring-orders',
    'create-contract',
  ].includes(drawerKey);
}

function isInquiriesOrReportsKey(drawerKey: SalesDrawerKey | null): boolean {
  if (!drawerKey) return false;
  return [
    'order-inquiry',
    'print-price-lists',
    'order-status-report',
    'orders-invoiced-reports',
    'daily-sales-inquiry',
    'order-delivery-differences-report',
    'difot-report',
    'sales-order-detail-summary',
    'top-sales-items-report',
    'sales-with-low-gross-profit-report',
  ].includes(drawerKey);
}

const salesDashboardActionIcons: Record<string, LucideIcon> = {
  'late-orders': Clock3,
  'ready-to-pick': PackageCheck,
  'receivables-follow-up': Banknote,
  'low-margin-review': AlertTriangle,
  'month-sales-down': TrendingUp,
  'sales-clear': CheckCircle2,
};

const salesDrawerKeys: SalesDrawerKey[] = [
  'enter-order',
  'counter-sales',
  'print-picking-lists',
  'outstanding-sales-orders',
  'special-order',
  'recurring-order-template',
  'process-recurring-orders',
  'order-inquiry',
  'print-price-lists',
  'order-status-report',
  'orders-invoiced-reports',
  'daily-sales-inquiry',
  'order-delivery-differences-report',
  'difot-report',
  'sales-order-detail-summary',
  'top-sales-items-report',
  'sales-with-low-gross-profit-report',
  'select-contract',
  'create-contract',
];

function toSalesDrawerKey(value: string): SalesDrawerKey | null {
  return salesDrawerKeys.includes(value as SalesDrawerKey) ? (value as SalesDrawerKey) : null;
}

function salesToneClasses(tone: SalesDashboardTone): string {
  if (tone === 'danger') return 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100';
  if (tone === 'warning') return 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100';
  if (tone === 'pending') return 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100';
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (tone === 'info') return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text';
}

function salesToneDot(tone: SalesDashboardTone): string {
  if (tone === 'danger') return 'bg-red-600 dark:bg-red-300';
  if (tone === 'warning') return 'bg-orange-600 dark:bg-orange-300';
  if (tone === 'pending') return 'bg-purple-600 dark:bg-purple-300';
  if (tone === 'success') return 'bg-emerald-600 dark:bg-emerald-300';
  if (tone === 'info') return 'bg-blue-600 dark:bg-blue-300';
  return 'bg-slate-500 dark:bg-slate-300';
}

function salesToneTextClass(tone: SalesDashboardTone): string {
  if (tone === 'danger') return 'text-red-700 dark:text-red-200';
  if (tone === 'warning') return 'text-orange-700 dark:text-orange-200';
  if (tone === 'pending') return 'text-purple-700 dark:text-purple-200';
  if (tone === 'success') return 'text-emerald-700 dark:text-emerald-200';
  if (tone === 'info') return 'text-blue-700 dark:text-blue-200';
  return 'text-akiva-text-muted';
}

function salesSubtleToneClass(tone: SalesDashboardTone): string {
  if (tone === 'danger') return 'border-red-300/80 bg-red-50/75 text-red-800 dark:border-red-800/80 dark:bg-red-950/30 dark:text-red-100';
  if (tone === 'warning') return 'border-orange-300/80 bg-orange-50/75 text-orange-800 dark:border-orange-800/80 dark:bg-orange-950/30 dark:text-orange-100';
  if (tone === 'pending') return 'border-purple-300/80 bg-purple-50/75 text-purple-800 dark:border-purple-800/80 dark:bg-purple-950/30 dark:text-purple-100';
  if (tone === 'success') return 'border-emerald-300/80 bg-emerald-50/75 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/30 dark:text-emerald-100';
  if (tone === 'info') return 'border-blue-300/80 bg-blue-50/75 text-blue-800 dark:border-blue-800/80 dark:bg-blue-950/30 dark:text-blue-100';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text';
}

function SalesStatusPill({ tone, children }: { tone: SalesDashboardTone; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <span className={`akiva-status-dot ${salesToneDot(tone)}`} />
      {children}
    </span>
  );
}

function SalesPanel({
  title,
  detail,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  detail?: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-muted text-akiva-accent-text">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
            {detail ? <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{detail}</p> : null}
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function SalesMetricCard({
  label,
  value,
  note,
  status,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  status: string;
  icon: LucideIcon;
  tone: SalesDashboardTone;
}) {
  return (
    <article className="akiva-panel relative overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${salesToneDot(tone)}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">{label}</p>
          <p className="akiva-financial-value mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-muted ${salesToneTextClass(tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm leading-5 text-akiva-text-muted">{note}</p>
        <SalesStatusPill tone={tone}>{status}</SalesStatusPill>
      </div>
    </article>
  );
}

function SalesWorkloadStrip({
  dashboard,
  onOpenAction,
}: {
  dashboard: SalesDashboardPayload;
  onOpenAction: (drawerKey: SalesDrawerKey) => void;
}) {
  const { summary, currency } = dashboard;
  const workloadTotal = summary.lateOrders + summary.readyToPickOrders + summary.openReceivableInvoices + summary.lowMarginLines;
  const stripTone: SalesDashboardTone = workloadTotal > 0 ? 'warning' : 'success';
  const actionTiles: Array<{
    label: string;
    value: string;
    note: string;
    tone: SalesDashboardTone;
    drawerKey: SalesDrawerKey;
  }> = [
    {
      label: 'Late deliveries',
      value: formatNumber(summary.lateOrders),
      note: 'Open orders past delivery date',
      tone: summary.lateOrders > 0 ? 'danger' : 'success',
      drawerKey: 'order-delivery-differences-report',
    },
    {
      label: 'Pick queue',
      value: formatNumber(summary.readyToPickOrders),
      note: `${formatNumber(summary.readyToPickQuantity, 2)} units due now`,
      tone: summary.readyToPickOrders > 0 ? 'pending' : 'success',
      drawerKey: 'print-picking-lists',
    },
    {
      label: 'Collections',
      value: formatNumber(summary.openReceivableInvoices),
      note: formatCurrency(summary.openReceivableValue, currency),
      tone: summary.openReceivableInvoices > 0 ? 'warning' : 'success',
      drawerKey: 'orders-invoiced-reports',
    },
    {
      label: 'Margin review',
      value: formatNumber(summary.lowMarginLines),
      note: formatCurrency(summary.lowMarginValue, currency),
      tone: summary.lowMarginLines > 0 ? 'danger' : 'success',
      drawerKey: 'sales-with-low-gross-profit-report',
    },
  ];

  return (
    <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
      <div className="grid gap-4 xl:grid-cols-[220px_1fr] xl:items-center">
        <div className={`rounded-xl border p-4 ${salesSubtleToneClass(stripTone)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">Sales workload</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="akiva-financial-value text-4xl font-semibold">{formatNumber(workloadTotal)}</span>
          </div>
          <p className="mt-2 text-sm font-semibold">{workloadTotal > 0 ? 'Open work' : 'Clear'}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">Combined delivery, picking, receivables, and margin exceptions.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actionTiles.map((tile) => (
            <button
              key={tile.label}
              type="button"
              onClick={() => onOpenAction(tile.drawerKey)}
              className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{tile.label}</p>
              <p className="akiva-financial-value mt-2 text-lg font-semibold text-akiva-text">{tile.value}</p>
              <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{tile.note}</p>
              <span className={`mt-2 inline-flex h-2 w-2 rounded-full ${salesToneDot(tile.tone)}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SalesActionRow({
  action,
  onOpenAction,
}: {
  action: SalesDashboardAction;
  onOpenAction: (drawerKey: SalesDrawerKey) => void;
}) {
  const Icon = salesDashboardActionIcons[action.id] ?? AlertTriangle;
  const drawerKey = toSalesDrawerKey(action.drawerKey);

  return (
    <button
      type="button"
      onClick={() => {
        if (drawerKey) onOpenAction(drawerKey);
      }}
      disabled={!drawerKey}
      className="relative w-full overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
    >
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${salesToneDot(action.tone)}`} aria-hidden="true" />
      <div className="flex gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${salesToneClasses(action.tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${salesToneClasses(action.tone)}`}>P{action.priority}</span>
            <span className="akiva-financial-value text-xs font-semibold text-akiva-text">{action.valueLabel}</span>
          </span>
          <span className="mt-2 block text-sm font-semibold leading-5 text-akiva-text">{action.title}</span>
          <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{action.detail}</span>
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-akiva-accent-text">
            {action.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </span>
      </div>
    </button>
  );
}

type SalesCustomerTrendChartRow = {
  month: string;
  label: string;
  [key: string]: string | number;
};

function SalesCustomerTrendChart({
  trend,
  loading,
  dateFormat,
}: {
  trend: SalesCustomerTrendPayload | null;
  loading: boolean;
  dateFormat: string;
}) {
  const currency = trend?.currency ?? 'TZS';
  const customers = trend?.customers ?? [];

  const chartRows = useMemo<SalesCustomerTrendChartRow[]>(() => {
    if (!trend) return [];

    return trend.months.map((month) => {
      const row: SalesCustomerTrendChartRow = {
        month: month.month,
        label: formatDate(`${month.month}-01`, dateFormat) || month.label || month.month,
      };

      trend.customers.forEach((customer, index) => {
        const point = customer.points.find((item) => item.month === month.month);
        row[`customer_${index}`] = point?.grossTotal ?? 0;
      });

      return row;
    });
  }, [dateFormat, trend]);

  const hasSales = customers.some((customer) => customer.grossTotal > 0);

  if ((loading && !trend) || chartRows.length === 0 || !hasSales) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 text-center text-sm font-semibold text-akiva-text-muted">
        {loading && !trend ? 'Loading customer trend...' : 'No invoices in selected range.'}
      </div>
    );
  }

  return (
    <div>
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(value: number) => formatCompactCurrency(value, currency)}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }}
              width={76}
            />
            <Tooltip
              formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value), currency), String(name)]}
              contentStyle={salesChartTooltipContentStyle}
              labelStyle={salesChartTooltipTextStyle}
              itemStyle={salesChartTooltipTextStyle}
            />
            {customers.map((customer, index) => (
              <Line
                key={customer.debtorNo}
                type="monotone"
                dataKey={`customer_${index}`}
                name={customer.customerName}
                stroke={salesTrendColors[index % salesTrendColors.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
        {customers.map((customer, index) => (
          <div key={customer.debtorNo} className="min-w-0 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: salesTrendColors[index % salesTrendColors.length] }}
              />
              <span className="truncate font-semibold text-akiva-text">{customer.customerName}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-akiva-text-muted">
              <span>{formatNumber(customer.invoiceCount)} invoices</span>
              <span className="akiva-financial-value font-semibold text-akiva-text">{formatCurrency(customer.grossTotal, currency)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesDashboardPanel({
  dashboard,
  loading,
  dateFormat,
  customerTrend,
  customerTrendLoading,
  customerTrendRange,
  onCustomerTrendRangeChange,
  onOpenAction,
}: {
  dashboard: SalesDashboardPayload | null;
  loading: boolean;
  dateFormat: string;
  customerTrend: SalesCustomerTrendPayload | null;
  customerTrendLoading: boolean;
  customerTrendRange: DateRangeValue;
  onCustomerTrendRangeChange: (range: DateRangeValue) => void;
  onOpenAction: (drawerKey: SalesDrawerKey) => void;
}) {
  if (loading && !dashboard) {
    return (
      <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-semibold text-akiva-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading live sales dashboard...
        </div>
      </section>
    );
  }

  if (!dashboard) {
    return (
      <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-5 text-sm font-semibold text-akiva-text-muted shadow-sm">
        Sales dashboard data is unavailable.
      </section>
    );
  }

  const { summary, currency } = dashboard;
  const trendMax = Math.max(...dashboard.dailyTrend.map((row) => row.grossTotal), 1);
  const topItemTotal = Math.max(...dashboard.topItems.map((row) => row.grossTotal), 1);
  const metricCards = [
    {
      label: 'Today invoiced',
      value: formatCurrency(summary.todaySales, currency),
      note: `${formatNumber(summary.todayInvoices)} invoices posted today`,
      status: summary.todayInvoices > 0 ? 'Posted' : 'No invoices',
      icon: ReceiptText,
      tone: summary.todaySales > 0 ? 'success' as const : 'neutral' as const,
    },
    {
      label: 'Month sales',
      value: formatCurrency(summary.monthSales, currency),
      note: `${formatPercent(summary.monthGrowthPct)} vs previous month`,
      status: summary.monthGrowthPct >= 0 ? 'Growing' : 'Down',
      icon: BarChart3,
      tone: summary.monthGrowthPct >= 0 ? 'success' as const : 'warning' as const,
    },
    {
      label: 'Open orders',
      value: formatCurrency(summary.openOrderValue, currency),
      note: `${formatNumber(summary.openOrders)} orders, ${formatNumber(summary.openOrderLines)} open lines`,
      status: summary.lateOrders > 0 ? `${formatNumber(summary.lateOrders)} late` : 'On track',
      icon: Truck,
      tone: summary.lateOrders > 0 ? 'danger' as const : 'info' as const,
    },
    {
      label: 'Receivables open',
      value: formatCurrency(summary.openReceivableValue, currency),
      note: `${formatNumber(summary.openReceivableInvoices)} unpaid sales invoices`,
      status: summary.openReceivableInvoices > 0 ? 'Collect' : 'Clear',
      icon: Banknote,
      tone: summary.openReceivableInvoices > 0 ? 'warning' as const : 'success' as const,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((card) => (
          <SalesMetricCard key={card.label} {...card} />
        ))}
      </div>

      <SalesWorkloadStrip dashboard={dashboard} onOpenAction={onOpenAction} />

      <div className="grid gap-4 lg:grid-cols-12">
        <main className="space-y-4 lg:col-span-8">
          <SalesPanel
            title="Daily Sales Trend"
            detail={`${formatCurrency(summary.averageInvoiceValue, currency)} average invoice; last ${dashboard.dailyTrend.length} days.`}
            icon={BarChart3}
          >
            <div className="space-y-2">
                {dashboard.dailyTrend.slice(-8).map((row) => (
                  <div key={row.day} className="grid grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <span className="truncate font-semibold text-akiva-text-muted">{formatDate(row.day, dateFormat)}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-akiva-surface-muted">
                      <span
                        className="block h-full rounded-full bg-akiva-accent"
                        style={{ width: `${Math.max(4, Math.round((row.grossTotal / trendMax) * 100))}%` }}
                      />
                    </span>
                    <span className="akiva-financial-value font-semibold text-akiva-text">{formatCurrency(row.grossTotal, currency)}</span>
                  </div>
                ))}
              </div>
          </SalesPanel>

          <SalesPanel
            title="Top Customer Trend"
            detail="Monthly invoiced value by customer for the selected period."
            icon={ShoppingCart}
            actions={
              <DateRangePicker
                value={customerTrendRange}
                onChange={onCustomerTrendRangeChange}
                label="Range"
                className="w-full sm:w-auto"
                triggerClassName="min-h-9 rounded-lg px-3 sm:min-w-[260px]"
                panelClassName="right-0"
              />
            }
          >
            <SalesCustomerTrendChart
              trend={customerTrend}
              loading={customerTrendLoading}
              dateFormat={dateFormat}
            />
          </SalesPanel>
        </main>

        <aside className="space-y-4 lg:col-span-4">
          <SalesPanel title="AI Sales Insights" detail="Recommended actions ranked by urgency and commercial impact." icon={Sparkles}>
            <div className="mt-3 space-y-2">
              {dashboard.actionQueue.map((action) => (
                <SalesActionRow key={action.id} action={action} onOpenAction={onOpenAction} />
              ))}
            </div>
          </SalesPanel>

          <SalesPanel title="Top Items This Month" detail="Best performing stock lines by order value." icon={PackageCheck}>
            <div className="space-y-2">
              {dashboard.topItems.length > 0 ? dashboard.topItems.map((row) => (
                <div key={row.stockId} className="text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-akiva-text">{row.description}</span>
                      <span className="block text-akiva-text-muted">{row.stockId} · {formatNumber(row.quantity, 2)} units</span>
                    </span>
                    <span className="akiva-financial-value shrink-0 font-semibold text-akiva-text">{formatCurrency(row.grossTotal, currency)}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-akiva-surface-muted">
                    <div className="h-full rounded-full bg-akiva-accent" style={{ width: `${Math.max(4, Math.round((row.grossTotal / topItemTotal) * 100))}%` }} />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-akiva-text-muted">No item sales for this month yet.</p>
              )}
            </div>
          </SalesPanel>
        </aside>
      </div>
    </div>
  );
}

export function SalesOrders({ mode = 'transactions', sourceSlug = '' }: SalesOrdersProps) {
  const [orders, setOrders] = useState<SalesOrderListItem[]>([]);
  const [transactions, setTransactions] = useState<SalesTransaction[]>([]);
  const [reportSummary, setReportSummary] = useState<SalesReportSummary | null>(null);
  const [salesDashboard, setSalesDashboard] = useState<SalesDashboardPayload | null>(null);
  const [customerTrendRange, setCustomerTrendRange] = useState<DateRangeValue>(() => getDefaultDateRange());
  const [customerTrend, setCustomerTrend] = useState<SalesCustomerTrendPayload | null>(null);
  const [customerTrendLoading, setCustomerTrendLoading] = useState(false);
  const [settings, setSettings] = useState<SalesSettings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [syncState, setSyncState] = useState<SyncVisualState>('idle');
  const [pendingSync, setPendingSync] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [form, setForm] = useState<DraftFormState>({
    debtorNo: '',
    customerName: '',
    customerRef: '',
    grossTotal: '',
  });

  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerError, setDrawerError] = useState('');
  const [drawerMessage, setDrawerMessage] = useState('');
  const [dashboardDrawerKey, setDashboardDrawerKey] = useState<SalesDrawerKey | null>(null);

  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [stockItems, setStockItems] = useState<SalesStockItem[]>([]);
  const [pendingOrderLines, setPendingOrderLines] = useState<SalesOrderLineInput[]>([]);
  const [createOrderForm, setCreateOrderForm] = useState<CreateOrderFormState>({
    customerKey: '',
    customerRef: '',
    buyerName: '',
    orderType: 'RE',
    stockId: '',
    quantity: '1',
    unitPrice: '',
  });

  const [outstandingOrders, setOutstandingOrders] = useState<SalesOutstandingOrder[]>([]);
  const [pickingCandidates, setPickingCandidates] = useState<SalesPickingCandidate[]>([]);
  const [recurringTemplates, setRecurringTemplates] = useState<SalesRecurringTemplate[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);

  const [priceListItems, setPriceListItems] = useState<SalesPriceListItem[]>([]);
  const [orderStatusRows, setOrderStatusRows] = useState<SalesOrderStatusRow[]>([]);
  const [dailySalesRows, setDailySalesRows] = useState<SalesDailySalesRow[]>([]);
  const [topItems, setTopItems] = useState<SalesTopItem[]>([]);
  const [lowGrossRows, setLowGrossRows] = useState<SalesLowGrossRow[]>([]);
  const [invoicedTransactions, setInvoicedTransactions] = useState<SalesTransaction[]>([]);
  const [contractLookups, setContractLookups] = useState<SalesContractLookups | null>(null);
  const [contractRows, setContractRows] = useState<SalesContractSummary[]>([]);
  const [contractStatusFilter, setContractStatusFilter] = useState('4');
  const [selectedContractRef, setSelectedContractRef] = useState('');
  const [contractForm, setContractForm] = useState<ContractFormState>(() => newContractFormState());
  const [contractBomLines, setContractBomLines] = useState<ContractBomDraftLine[]>([]);
  const [contractRequirementLines, setContractRequirementLines] = useState<ContractRequirementDraftLine[]>([]);
  const { confirm, confirmationDialog } = useConfirmDialog();
  const dateFormat = useSystemDateFormat();
  const displayDate = useCallback((value: string | null | undefined) => formatDate(value, dateFormat), [dateFormat]);

  const routeDrawerKey = useMemo(() => resolveSalesDrawerKey(sourceSlug), [sourceSlug]);
  const drawerKey = routeDrawerKey ?? dashboardDrawerKey;
  const drawerDetails = drawerKey ? drawerMeta(drawerKey) : null;
  const reportTemplateRoute = isInquiriesOrReportsKey(drawerKey);
  const routeTemplateRoute = Boolean(
    drawerKey && drawerDetails && (mode !== 'reports' || reportTemplateRoute || dashboardDrawerKey)
  );

  const selectedCustomer = useMemo(() => {
    if (!createOrderForm.customerKey) return null;
    return (
      customers.find(
        (customer) => `${customer.debtorNo}::${customer.branchCode}` === createOrderForm.customerKey
      ) ?? null
    );
  }, [createOrderForm.customerKey, customers]);

  const selectedItem = useMemo(() => {
    if (!createOrderForm.stockId) return null;
    return stockItems.find((item) => item.stockId === createOrderForm.stockId) ?? null;
  }, [createOrderForm.stockId, stockItems]);

  const selectedContractCustomer = useMemo(() => {
    if (!contractLookups) return null;
    return (
      contractLookups.customers.find(
        (row) => row.debtorNo === contractForm.debtorNo && row.branchCode === contractForm.branchCode
      ) ?? null
    );
  }, [contractForm.branchCode, contractForm.debtorNo, contractLookups]);

  const workCentresForLocation = useMemo(() => {
    if (!contractLookups || !contractForm.locationCode) return [];
    return contractLookups.workCentres.filter((row) => row.locationCode === contractForm.locationCode);
  }, [contractForm.locationCode, contractLookups]);

  const reloadOrders = useCallback(async (term = '') => {
    const rows = await listSalesOrders(term);
    setOrders(rows);
  }, []);

  const reloadTransactions = useCallback(async (term = '') => {
    const rows = await fetchSalesTransactions(250, term);
    setTransactions(rows);
  }, []);

  const reloadSalesDashboard = useCallback(async () => {
    const dashboard = await fetchSalesDashboard(14);
    setSalesDashboard(dashboard);
  }, []);

  const reloadCustomerTrend = useCallback(async (range: DateRangeValue) => {
    setCustomerTrendLoading(true);
    try {
      const trend = await fetchSalesCustomerTrend(range.from, range.to, 5);
      setCustomerTrend(trend);
    } finally {
      setCustomerTrendLoading(false);
    }
  }, []);

  const bootstrapFromWebErp = useCallback(async () => {
    if (!navigator.onLine) return;
    const onlineRows = await fetchOnlineSalesOrders();
    if (onlineRows.length === 0) return;
    await upsertOrdersFromWebErp(onlineRows);
    await reloadOrders('');
  }, [reloadOrders]);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        if (mode === 'transactions') {
          await Promise.all([reloadOrders(''), reloadTransactions(''), reloadSalesDashboard()]);
          await bootstrapFromWebErp();
        } else if (mode === 'reports') {
          const [summary] = await Promise.all([fetchSalesReportSummary(), reloadSalesDashboard()]);
          if (mounted) setReportSummary(summary);
        } else {
          const settingsData = await fetchSalesSettings();
          if (mounted) setSettings(settingsData);
        }
      } catch (error) {
        if (mounted) setErrorMessage(String(error));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    const goOnline = () => {
      setIsOnline(true);
      if (mode === 'transactions') {
        bootstrapFromWebErp().catch((error) => setErrorMessage(String(error)));
      }
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      mounted = false;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [bootstrapFromWebErp, mode, reloadOrders, reloadSalesDashboard, reloadTransactions]);

  useEffect(() => {
    if (mode !== 'transactions' && mode !== 'reports') return;
    reloadCustomerTrend(customerTrendRange).catch((error) => setErrorMessage(String(error)));
  }, [customerTrendRange, mode, reloadCustomerTrend]);

  useEffect(() => {
    if (mode !== 'transactions') return;
    reloadOrders(searchTerm).catch((error) => setErrorMessage(String(error)));
    reloadTransactions(searchTerm).catch((error) => setErrorMessage(String(error)));
  }, [mode, reloadOrders, reloadTransactions, searchTerm]);

  useEffect(() => {
    if (mode !== 'transactions' || !COUCHDB_SALES_URL) return;

    const controller = startSalesSync(
      {
        remoteUrl: COUCHDB_SALES_URL,
        username: COUCHDB_USERNAME,
        password: COUCHDB_PASSWORD,
      },
      {
        onActive: () => setSyncState('active'),
        onPaused: () => setSyncState('paused'),
        onChange: (pending) => {
          setPendingSync(pending);
          reloadOrders(searchTerm).catch((error) => setErrorMessage(String(error)));
        },
        onError: (message) => {
          setSyncState('error');
          setErrorMessage(message);
        },
      }
    );

    return () => controller.stop();
  }, [mode, reloadOrders, searchTerm]);

  useEffect(() => {
    setDrawerSearch('');
    setDrawerError('');
    setDrawerMessage('');
  }, [drawerKey]);

  useEffect(() => {
    setDashboardDrawerKey(null);
  }, [mode, sourceSlug]);

  const openSalesDashboardAction = useCallback((nextKey: SalesDrawerKey) => {
    setDashboardDrawerKey(nextKey);
    setDrawerSearch('');
    setDrawerError('');
    setDrawerMessage('');
  }, []);

  const resetContractEditor = useCallback(() => {
    setSelectedContractRef('');
    setContractForm(newContractFormState());
    setContractBomLines([]);
    setContractRequirementLines([]);
  }, []);

  const applyContractLookupsDefaults = useCallback((lookups: SalesContractLookups) => {
    setContractForm((previous) => {
      if (selectedContractRef) return previous;
      const firstCustomer = lookups.customers[0];
      const firstCategory = lookups.categories[0];
      const firstLocation = lookups.locations[0];
      return {
        ...previous,
        debtorNo: previous.debtorNo || firstCustomer?.debtorNo || '',
        branchCode: previous.branchCode || firstCustomer?.branchCode || '',
        categoryId: previous.categoryId || firstCategory?.categoryId || '',
        locationCode:
          previous.locationCode || firstCustomer?.defaultLocation || firstLocation?.locationCode || '',
        exchangeRate: previous.exchangeRate || '1',
      };
    });
  }, [selectedContractRef]);

  const hydrateContractEditor = useCallback((detail: SalesContractDetail) => {
    setSelectedContractRef(detail.contractRef);
    setContractForm({
      contractRef: detail.contractRef,
      contractDescription: detail.contractDescription,
      debtorNo: detail.debtorNo,
      branchCode: detail.branchCode,
      categoryId: detail.categoryId,
      locationCode: detail.locationCode,
      requiredDate: detail.requiredDate,
      margin: String(detail.margin),
      customerRef: detail.customerRef,
      exchangeRate: String(detail.exchangeRate || 1),
      defaultWorkCentre: detail.bomLines[0]?.workCentreCode ?? '',
    });
    setContractBomLines(
      detail.bomLines.map((line) => ({
        stockId: line.stockId,
        workCentreCode: line.workCentreCode || '',
        quantity: String(line.quantity),
      }))
    );
    setContractRequirementLines(
      detail.requirementLines.map((line) => ({
        requirement: line.requirement,
        quantity: String(line.quantity),
        costPerUnit: String(line.costPerUnit),
      }))
    );
  }, []);

  const openContractForEdit = useCallback(async (contractRef: string) => {
    setDrawerLoading(true);
    setDrawerError('');
    setDrawerMessage('');

    try {
      const detail = await fetchSalesContractDetail(contractRef);
      if (!detail) {
        setDrawerError('Failed to load contract details.');
        return;
      }
      hydrateContractEditor(detail);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [hydrateContractEditor]);

  const reloadDrawerData = useCallback(async () => {
    if (!drawerKey) return;

    setDrawerLoading(true);
    setDrawerError('');

    try {
      switch (drawerKey) {
        case 'enter-order':
        case 'counter-sales':
        case 'special-order': {
          const [customerRows, itemRows] = await Promise.all([
            fetchSalesCustomers(drawerSearch),
            fetchSalesItems(drawerSearch),
          ]);
          setCustomers(customerRows);
          setStockItems(itemRows);
          break;
        }

        case 'outstanding-sales-orders':
        case 'order-inquiry':
        case 'order-delivery-differences-report': {
          const rows = await fetchOutstandingSalesOrders(drawerSearch);
          setOutstandingOrders(rows);
          break;
        }

        case 'print-picking-lists': {
          const rows = await fetchPickingListCandidates(drawerSearch);
          setPickingCandidates(rows);
          break;
        }

        case 'recurring-order-template':
        case 'process-recurring-orders': {
          const rows = await fetchRecurringTemplates(drawerSearch);
          setRecurringTemplates(rows);
          break;
        }

        case 'print-price-lists': {
          const rows = await fetchSalesPriceList(300);
          setPriceListItems(rows);
          break;
        }

        case 'order-status-report':
        case 'sales-order-detail-summary':
        case 'difot-report': {
          const rows = await fetchSalesOrderStatus(drawerSearch);
          setOrderStatusRows(rows);
          break;
        }

        case 'orders-invoiced-reports': {
          const rows = await fetchSalesTransactions(180, drawerSearch);
          setInvoicedTransactions(rows.filter((row) => row.transType === 10));
          break;
        }

        case 'daily-sales-inquiry': {
          const rows = await fetchSalesDailyInquiry(45);
          setDailySalesRows(rows);
          break;
        }

        case 'top-sales-items-report': {
          const rows = await fetchSalesTopItems(30);
          setTopItems(rows);
          break;
        }

        case 'sales-with-low-gross-profit-report': {
          const rows = await fetchSalesLowGrossReport(30);
          setLowGrossRows(rows);
          break;
        }

        case 'select-contract':
        case 'create-contract': {
          const lookups = await fetchSalesContractLookups();
          if (!lookups) {
            setDrawerError('Failed to load contract lookups.');
            break;
          }
          setContractLookups(lookups);
          applyContractLookupsDefaults(lookups);

          if (drawerKey === 'select-contract') {
            const rows = await fetchSalesContracts({
              q: drawerSearch,
              status: Number(contractStatusFilter),
              limit: 220,
            });
            setContractRows(rows);
          }
          break;
        }
      }
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [applyContractLookupsDefaults, contractStatusFilter, drawerKey, drawerSearch]);

  useEffect(() => {
    if (!drawerKey) return;
    reloadDrawerData().catch((error) => setDrawerError(String(error)));
  }, [drawerKey, reloadDrawerData]);

  useEffect(() => {
    if (drawerKey !== 'create-contract') return;
    resetContractEditor();
  }, [drawerKey, resetContractEditor]);

  useEffect(() => {
    if (!selectedContractCustomer || selectedContractRef) return;
    setContractForm((previous) => ({
      ...previous,
      locationCode: previous.locationCode || selectedContractCustomer.defaultLocation || '',
      exchangeRate: previous.exchangeRate || '1',
    }));
  }, [selectedContractCustomer, selectedContractRef]);

  useEffect(() => {
    if (workCentresForLocation.length === 0) return;
    setContractForm((previous) => {
      if (previous.defaultWorkCentre) return previous;
      return {
        ...previous,
        defaultWorkCentre: workCentresForLocation[0].workCentreCode,
      };
    });
  }, [workCentresForLocation]);

  useEffect(() => {
    if (!selectedItem) return;
    if (createOrderForm.unitPrice.trim() !== '') return;
    setCreateOrderForm((previous) => ({
      ...previous,
      unitPrice: selectedItem.price > 0 ? String(selectedItem.price) : '',
    }));
  }, [createOrderForm.unitPrice, selectedItem]);

  const submitDraft = async () => {
    const gross = Number(form.grossTotal);
    if (!form.customerName.trim() || Number.isNaN(gross) || gross <= 0) {
      setErrorMessage('Customer name and amount are required.');
      return;
    }

    await createSalesOrderDraft({
      debtorNo: form.debtorNo,
      customerName: form.customerName,
      customerRef: form.customerRef,
      grossTotal: gross,
    });

    setForm({ debtorNo: '', customerName: '', customerRef: '', grossTotal: '' });
    await reloadOrders(searchTerm);
  };

  const addOrderLine = useCallback(() => {
    if (!selectedItem) {
      setDrawerError('Select a stock item first.');
      return;
    }

    const quantity = Number(createOrderForm.quantity);
    const unitPrice = Number(createOrderForm.unitPrice || selectedItem.price);

    if (Number.isNaN(quantity) || quantity <= 0) {
      setDrawerError('Quantity must be greater than zero.');
      return;
    }

    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      setDrawerError('Unit price is invalid.');
      return;
    }

    const line: SalesOrderLineInput = {
      stockId: selectedItem.stockId,
      quantity,
      unitPrice,
      discountPercent: 0,
      narrative: '',
    };

    setPendingOrderLines((previous) => [...previous, line]);
    setDrawerError('');
    setCreateOrderForm((previous) => ({
      ...previous,
      stockId: '',
      quantity: '1',
      unitPrice: '',
    }));
  }, [createOrderForm.quantity, createOrderForm.unitPrice, selectedItem]);

  const submitOnlineOrder = useCallback(async () => {
    if (!selectedCustomer) {
      setDrawerError('Select a customer branch first.');
      return;
    }

    if (pendingOrderLines.length === 0) {
      setDrawerError('Add at least one order line.');
      return;
    }

    setDrawerLoading(true);
    setDrawerError('');

    try {
      const result = await createSalesOrderOnline({
        debtorNo: selectedCustomer.debtorNo,
        branchCode: selectedCustomer.branchCode,
        customerRef: createOrderForm.customerRef,
        buyerName: createOrderForm.buyerName,
        orderType: createOrderForm.orderType || selectedCustomer.salesType || 'RE',
        shipVia: selectedCustomer.defaultShipperId || undefined,
        fromStockLoc: selectedCustomer.defaultLocation || undefined,
        lines: pendingOrderLines,
      });

      if (!result) {
        setDrawerError('Failed to create sales order.');
        return;
      }

      setDrawerMessage(`Sales order ${result.orderNo} created successfully.`);
      setPendingOrderLines([]);
      await Promise.all([
        reloadOrders(searchTerm),
        reloadTransactions(searchTerm),
        reloadSalesDashboard(),
        reloadCustomerTrend(customerTrendRange),
        reloadDrawerData(),
      ]);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [
    createOrderForm.buyerName,
    createOrderForm.customerRef,
    createOrderForm.orderType,
    customerTrendRange,
    pendingOrderLines,
    reloadDrawerData,
    reloadCustomerTrend,
    reloadOrders,
    reloadSalesDashboard,
    reloadTransactions,
    searchTerm,
    selectedCustomer,
  ]);

  const toggleTemplate = useCallback((templateId: number) => {
    setSelectedTemplateIds((previous) =>
      previous.includes(templateId)
        ? previous.filter((id) => id !== templateId)
        : [...previous, templateId]
    );
  }, []);

  const runRecurring = useCallback(async () => {
    setDrawerLoading(true);
    setDrawerError('');

    try {
      const result = await processRecurringOrders(selectedTemplateIds);
      if (!result) {
        setDrawerError('Recurring order processing failed.');
        return;
      }

      const createdCount = result.createdOrders.length;
      const skippedCount = result.skippedTemplates.length;
      setDrawerMessage(`Processed templates. Created: ${createdCount}, skipped: ${skippedCount}.`);
      setSelectedTemplateIds([]);
      await Promise.all([
        reloadOrders(searchTerm),
        reloadTransactions(searchTerm),
        reloadSalesDashboard(),
        reloadCustomerTrend(customerTrendRange),
        reloadDrawerData(),
      ]);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [
    customerTrendRange,
    reloadCustomerTrend,
    reloadDrawerData,
    reloadOrders,
    reloadSalesDashboard,
    reloadTransactions,
    searchTerm,
    selectedTemplateIds,
  ]);

  const addContractBomLine = useCallback(() => {
    setContractBomLines((previous) => [...previous, { stockId: '', workCentreCode: '', quantity: '1' }]);
  }, []);

  const removeContractBomLine = useCallback((index: number) => {
    setContractBomLines((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const addContractRequirementLine = useCallback(() => {
    setContractRequirementLines((previous) => [
      ...previous,
      { requirement: '', quantity: '1', costPerUnit: '0' },
    ]);
  }, []);

  const removeContractRequirementLine = useCallback((index: number) => {
    setContractRequirementLines((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const saveContract = useCallback(async () => {
    if (!contractForm.contractRef.trim() && !selectedContractRef) {
      setDrawerError('Contract reference is required.');
      return;
    }

    if (!contractForm.contractDescription.trim()) {
      setDrawerError('Contract description is required.');
      return;
    }

    if (!contractForm.debtorNo || !contractForm.branchCode) {
      setDrawerError('Customer and branch are required.');
      return;
    }

    setDrawerLoading(true);
    setDrawerError('');

    const payload: SalesContractPayload = {
      contractRef: selectedContractRef || contractForm.contractRef.trim(),
      contractDescription: contractForm.contractDescription.trim(),
      debtorNo: contractForm.debtorNo,
      branchCode: contractForm.branchCode,
      categoryId: contractForm.categoryId,
      locationCode: contractForm.locationCode,
      requiredDate: contractForm.requiredDate,
      margin: Number(contractForm.margin || '0'),
      customerRef: contractForm.customerRef,
      exchangeRate: Number(contractForm.exchangeRate || '1'),
      defaultWorkCentre: contractForm.defaultWorkCentre,
      bomLines: contractBomLines
        .filter((line) => line.stockId.trim() !== '')
        .map((line) => ({
          stockId: line.stockId.trim(),
          workCentreCode: line.workCentreCode.trim(),
          quantity: Number(line.quantity || '0'),
        })),
      requirementLines: contractRequirementLines
        .filter((line) => line.requirement.trim() !== '')
        .map((line) => ({
          requirement: line.requirement.trim(),
          quantity: Number(line.quantity || '0'),
          costPerUnit: Number(line.costPerUnit || '0'),
        })),
    };

    try {
      let result: SalesContractDetail | null = null;
      if (selectedContractRef) {
        const updatePayload: Omit<SalesContractPayload, 'contractRef'> = {
          contractDescription: payload.contractDescription,
          debtorNo: payload.debtorNo,
          branchCode: payload.branchCode,
          categoryId: payload.categoryId,
          locationCode: payload.locationCode,
          requiredDate: payload.requiredDate,
          margin: payload.margin,
          customerRef: payload.customerRef,
          exchangeRate: payload.exchangeRate,
          defaultWorkCentre: payload.defaultWorkCentre,
          bomLines: payload.bomLines,
          requirementLines: payload.requirementLines,
        };
        result = await updateSalesContract(selectedContractRef, updatePayload);
      } else {
        result = await createSalesContract(payload);
      }

      if (!result) {
        setDrawerError('Failed to save contract.');
        return;
      }

      hydrateContractEditor(result);
      setDrawerMessage(
        selectedContractRef
          ? `Contract ${result.contractRef} updated successfully.`
          : `Contract ${result.contractRef} created successfully.`
      );
      await reloadDrawerData();
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [
    contractBomLines,
    contractForm,
    contractRequirementLines,
    hydrateContractEditor,
    reloadDrawerData,
    selectedContractRef,
  ]);

  const quoteContractByRef = useCallback(async (contractRef: string) => {
    setDrawerLoading(true);
    setDrawerError('');
    try {
      const result = await quoteSalesContract(contractRef);
      if (!result) {
        setDrawerError('Failed to create contract quotation.');
        return;
      }

      setDrawerMessage(
        result.alreadyQuoted
          ? `Contract already quoted as order ${result.orderNo}.`
          : `Quotation created successfully. Order No: ${result.orderNo}.`
      );
      await Promise.all([
        reloadDrawerData(),
        openContractForEdit(contractRef),
        reloadSalesDashboard(),
        reloadCustomerTrend(customerTrendRange),
      ]);
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [customerTrendRange, openContractForEdit, reloadCustomerTrend, reloadDrawerData, reloadSalesDashboard]);

  const createContractQuotationNow = useCallback(async () => {
    if (!selectedContractRef) {
      setDrawerError('Save a contract first, then create quotation.');
      return;
    }
    await quoteContractByRef(selectedContractRef);
  }, [quoteContractByRef, selectedContractRef]);

  const cancelCurrentContract = useCallback(async () => {
    if (!selectedContractRef) {
      setDrawerError('Select a contract first.');
      return;
    }

    const confirmed = await confirm({
      title: 'Cancel Contract',
      description: 'This will cancel the selected sales contract.',
      detail: selectedContractRef,
      confirmLabel: 'Cancel Contract',
      tone: 'warning',
    });
    if (!confirmed) return;

    setDrawerLoading(true);
    setDrawerError('');
    try {
      const ok = await cancelSalesContract(selectedContractRef);
      if (!ok) {
        setDrawerError('Failed to cancel contract.');
        return;
      }
      setDrawerMessage(`Contract ${selectedContractRef} cancelled.`);
      resetContractEditor();
      await reloadDrawerData();
    } catch (error) {
      setDrawerError(String(error));
    } finally {
      setDrawerLoading(false);
    }
  }, [confirm, reloadDrawerData, resetContractEditor, selectedContractRef]);

  const modeTitle =
    mode === 'transactions' ? 'Sales Dashboard' : mode === 'reports' ? 'Sales Reports' : 'Sales Settings';
  const modeSubtitle =
    mode === 'transactions'
      ? 'Live sales, fulfilment, receivables, and margin exceptions prioritized for daily action.'
      : mode === 'reports'
        ? 'Sales reporting and inquiry views with the same live action summary up front.'
        : 'Sales configuration and operational defaults.';
  const dashboardUpdatedLabel = formatDateTime(salesDashboard?.asOf, dateFormat);

  const difotSnapshot = useMemo(() => {
    const total = orderStatusRows.length;
    if (total === 0) {
      return { total: 0, fullOnTime: 0, fullOnTimePct: 0 };
    }

    const fullOnTime = orderStatusRows.filter((row) => row.completedLines >= row.lineCount).length;
    return {
      total,
      fullOnTime,
      fullOnTimePct: Number(((fullOnTime / total) * 100).toFixed(2)),
    };
  }, [orderStatusRows]);

  const renderAdvancedTable = <T,>(
    tableId: string,
    columns: AdvancedTableColumn<T>[],
    rows: T[],
    emptyMessage: string,
    loadingState = false,
    loadingText = 'Loading...'
  ) => (
    <AdvancedTable<T>
      tableId={tableId}
      columns={columns}
      rows={rows}
      emptyMessage={emptyMessage}
      loading={loadingState}
      loadingMessage={loadingText}
      initialPageSize={25}
    />
  );

  const renderDrawerContent = () => {
    if (!drawerKey) return null;

    if (drawerLoading) {
      return (
        <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm text-brand-700 dark:border-brand-900/60 dark:bg-brand-900/20 dark:text-brand-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading module data...
        </div>
      );
    }

    switch (drawerKey) {
      case 'enter-order':
      case 'counter-sales':
      case 'special-order': {
        return (
          <div className="space-y-4">
            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Create Sales Order</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <SearchableSelect
                  value={createOrderForm.customerKey}
                  onChange={(value) =>
                    setCreateOrderForm((previous) => ({ ...previous, customerKey: value }))
                  }
                  placeholder="Select customer/branch"
                  options={customers.map((customer) => {
                    const key = `${customer.debtorNo}::${customer.branchCode}`;
                    return {
                      value: key,
                      label: `${customer.customerName} (${customer.debtorNo}/${customer.branchCode})`,
                      searchText: `${customer.customerName} ${customer.debtorNo} ${customer.branchCode}`,
                    };
                  })}
                />
                <input
                  value={createOrderForm.customerRef}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, customerRef: event.target.value }))
                  }
                  placeholder="Customer reference"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={createOrderForm.buyerName}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, buyerName: event.target.value }))
                  }
                  placeholder="Buyer name"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={createOrderForm.orderType}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, orderType: event.target.value.toUpperCase() }))
                  }
                  placeholder="Order type"
                  maxLength={2}
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm uppercase text-gray-900 dark:text-white"
                />
              </div>
            </section>

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add Line</h3>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                <SearchableSelect
                  value={createOrderForm.stockId}
                  onChange={(value) =>
                    setCreateOrderForm((previous) => ({ ...previous, stockId: value }))
                  }
                  placeholder="Select stock item"
                  options={stockItems.map((item) => ({
                    value: item.stockId,
                    label: `${item.stockId} - ${item.description}`,
                    searchText: `${item.stockId} ${item.description}`,
                  }))}
                  className="md:col-span-2"
                />
                <input
                  value={createOrderForm.quantity}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, quantity: event.target.value }))
                  }
                  placeholder="Qty"
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={createOrderForm.unitPrice}
                  onChange={(event) =>
                    setCreateOrderForm((previous) => ({ ...previous, unitPrice: event.target.value }))
                  }
                  placeholder={selectedItem ? `Unit (${selectedItem.price})` : 'Unit price'}
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={addOrderLine}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Line
                </button>
                <button
                  type="button"
                  onClick={() => submitOnlineOrder().catch((error) => setDrawerError(String(error)))}
                  className="inline-flex items-center rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
                >
                  Submit Order
                </button>
              </div>

              <div className="mt-3">
                {renderAdvancedTable<SalesOrderLineInput>(
                  'sales-pending-order-lines',
                  [
                    { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
                    { id: 'quantity', header: 'Qty', accessor: (row) => row.quantity },
                    {
                      id: 'unitPrice',
                      header: 'Unit',
                      accessor: (row) => row.unitPrice,
                      exportValue: (row) => row.unitPrice,
                      cell: (row) => formatCurrency(row.unitPrice),
                    },
                    {
                      id: 'lineTotal',
                      header: 'Line Total',
                      accessor: (row) => row.unitPrice * row.quantity,
                      exportValue: (row) => row.unitPrice * row.quantity,
                      cell: (row) => (
                        <span className="font-medium text-gray-900 dark:text-white">
                          {formatCurrency(row.unitPrice * row.quantity)}
                        </span>
                      ),
                    },
                  ],
                  pendingOrderLines,
                  'No lines added yet.'
                )}
              </div>
            </section>
          </div>
        );
      }

      case 'outstanding-sales-orders':
      case 'order-inquiry': {
        const columns: AdvancedTableColumn<SalesOutstandingOrder>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'orderDate', header: 'Order Date', accessor: (row) => displayDate(row.orderDate) },
          { id: 'deliveryDate', header: 'Delivery', accessor: (row) => displayDate(row.deliveryDate) },
          {
            id: 'outstanding',
            header: 'Outstanding',
            accessor: (row) => `${row.outstandingLines} lines / ${row.outstandingQty}`,
          },
          {
            id: 'grossTotal',
            header: 'Amount',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-outstanding-orders', columns, outstandingOrders, 'No outstanding orders found.')
        );
      }

      case 'print-picking-lists': {
        const columns: AdvancedTableColumn<SalesPickingCandidate>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'locationCode', header: 'Location', accessor: (row) => row.locationCode },
          { id: 'dueDate', header: 'Due Date', accessor: (row) => displayDate(row.dueDate) },
          { id: 'openQty', header: 'Open Qty', accessor: (row) => row.openQty },
        ];

        return (
          renderAdvancedTable('sales-picking-lists', columns, pickingCandidates, 'No picking list candidates found.')
        );
      }

      case 'recurring-order-template': {
        const columns: AdvancedTableColumn<SalesRecurringTemplate>[] = [
          { id: 'recurringOrderNo', header: 'Template', accessor: (row) => row.recurringOrderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'frequencyDays', header: 'Frequency', accessor: (row) => `${row.frequencyDays} days` },
          { id: 'lastRecurrence', header: 'Last Recurrence', accessor: (row) => displayDate(row.lastRecurrence) },
          { id: 'stopDate', header: 'Stop Date', accessor: (row) => displayDate(row.stopDate) },
          { id: 'lineCount', header: 'Lines', accessor: (row) => row.lineCount },
        ];

        return (
          renderAdvancedTable('sales-recurring-templates', columns, recurringTemplates, 'No recurring templates found.')
        );
      }

      case 'process-recurring-orders': {
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Select templates to process. Leave all unselected to process all due templates.
              </p>
              <button
                type="button"
                onClick={() => runRecurring().catch((error) => setDrawerError(String(error)))}
                className="inline-flex items-center rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600"
              >
                Process
              </button>
            </div>

            {renderAdvancedTable<SalesRecurringTemplate>(
              'sales-recurring-process',
              [
                {
                  id: 'pick',
                  header: 'Pick',
                  accessor: (row) => selectedTemplateIds.includes(row.recurringOrderNo),
                  filterable: false,
                  cell: (row) => (
                    <input
                      type="checkbox"
                      checked={selectedTemplateIds.includes(row.recurringOrderNo)}
                      onChange={() => toggleTemplate(row.recurringOrderNo)}
                      className="h-4 w-4 rounded border-brand-300 text-brand-600 focus:ring-brand-500"
                    />
                  ),
                },
                { id: 'recurringOrderNo', header: 'Template', accessor: (row) => row.recurringOrderNo },
                { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                { id: 'frequencyDays', header: 'Frequency', accessor: (row) => `${row.frequencyDays} days` },
                { id: 'lastRecurrence', header: 'Last Recurrence', accessor: (row) => displayDate(row.lastRecurrence) },
              ],
              recurringTemplates,
              'No due recurring templates found.'
            )}
          </div>
        );
      }

      case 'print-price-lists': {
        const columns: AdvancedTableColumn<SalesPriceListItem>[] = [
          { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
          { id: 'description', header: 'Description', accessor: (row) => row.description },
          { id: 'salesType', header: 'Type', accessor: (row) => row.salesType },
          {
            id: 'unitPrice',
            header: 'Price',
            accessor: (row) => `${row.currency} ${row.unitPrice.toFixed(2)}`,
            exportValue: (row) => row.unitPrice,
          },
          { id: 'units', header: 'Units', accessor: (row) => row.units },
        ];

        return (
          renderAdvancedTable('sales-price-lists', columns, priceListItems, 'No price list rows found.')
        );
      }

      case 'order-status-report':
      case 'sales-order-detail-summary': {
        const columns: AdvancedTableColumn<SalesOrderStatusRow>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'orderDate', header: 'Ordered', accessor: (row) => displayDate(row.orderDate) },
          { id: 'deliveryDate', header: 'Delivery', accessor: (row) => displayDate(row.deliveryDate) },
          { id: 'completed', header: 'Completed', accessor: (row) => `${row.completedLines}/${row.lineCount}` },
          {
            id: 'grossTotal',
            header: 'Amount',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-order-status', columns, orderStatusRows, 'No order status rows found.')
        );
      }

      case 'orders-invoiced-reports': {
        const columns: AdvancedTableColumn<SalesTransaction>[] = [
          { id: 'transNo', header: 'Trans No', accessor: (row) => row.transNo },
          { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
          { id: 'reference', header: 'Reference', accessor: (row) => row.reference || '-' },
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo || '-' },
          { id: 'transactionDate', header: 'Date', accessor: (row) => displayDate(row.transactionDate) },
          {
            id: 'grossTotal',
            header: 'Amount',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-orders-invoiced', columns, invoicedTransactions, 'No invoiced transactions found.')
        );
      }

      case 'daily-sales-inquiry': {
        const columns: AdvancedTableColumn<SalesDailySalesRow>[] = [
          { id: 'day', header: 'Day', accessor: (row) => displayDate(row.day) },
          { id: 'invoiceCount', header: 'Invoices', accessor: (row) => row.invoiceCount },
          {
            id: 'grossTotal',
            header: 'Gross Total',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-daily-inquiry', columns, dailySalesRows, 'No daily sales rows found.')
        );
      }

      case 'top-sales-items-report': {
        const columns: AdvancedTableColumn<SalesTopItem>[] = [
          { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
          { id: 'description', header: 'Description', accessor: (row) => row.description },
          { id: 'quantity', header: 'Quantity', accessor: (row) => row.quantity },
          {
            id: 'grossTotal',
            header: 'Gross Total',
            accessor: (row) => row.grossTotal,
            exportValue: (row) => row.grossTotal,
            cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
          },
        ];

        return (
          renderAdvancedTable('sales-top-items', columns, topItems, 'No top items rows found.')
        );
      }

      case 'sales-with-low-gross-profit-report': {
        const columns: AdvancedTableColumn<SalesLowGrossRow>[] = [
          { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
          { id: 'stockId', header: 'Stock', accessor: (row) => row.stockId },
          { id: 'description', header: 'Description', accessor: (row) => row.description },
          { id: 'unitPrice', header: 'Unit', accessor: (row) => row.unitPrice, cell: (row) => formatCurrency(row.unitPrice) },
          { id: 'materialCost', header: 'Cost', accessor: (row) => row.materialCost, cell: (row) => formatCurrency(row.materialCost) },
          { id: 'grossMarginPct', header: 'Margin %', accessor: (row) => `${row.grossMarginPct}%` },
        ];

        return (
          renderAdvancedTable('sales-low-gross', columns, lowGrossRows, 'No low gross rows found.')
        );
      }

      case 'order-delivery-differences-report': {
        const today = new Date();
        const lateOrders = outstandingOrders.filter((row) => {
          const delivery = new Date(row.deliveryDate);
          return !Number.isNaN(delivery.getTime()) && delivery < today;
        });

        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Orders past delivery date</p>
              <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{lateOrders.length}</p>
            </div>
            {renderAdvancedTable<SalesOutstandingOrder>(
              'sales-delivery-differences',
              [
                { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
                { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                { id: 'deliveryDate', header: 'Delivery Date', accessor: (row) => displayDate(row.deliveryDate) },
                { id: 'outstandingQty', header: 'Outstanding Qty', accessor: (row) => row.outstandingQty },
                {
                  id: 'grossTotal',
                  header: 'Amount',
                  accessor: (row) => row.grossTotal,
                  exportValue: (row) => row.grossTotal,
                  cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
                },
              ],
              lateOrders,
              'No delivery differences detected.'
            )}
          </div>
        );
      }

      case 'difot-report': {
        return (
          <div className="space-y-4">
            <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Orders Evaluated</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{difotSnapshot.total}</p>
              </div>
              <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">In Full & On Time</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{difotSnapshot.fullOnTime}</p>
              </div>
              <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">DIFOT %</p>
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{difotSnapshot.fullOnTimePct}%</p>
              </div>
            </section>

            {renderAdvancedTable<SalesOrderStatusRow>(
              'sales-difot-orders',
              [
                { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
                { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                { id: 'completedLines', header: 'Completed Lines', accessor: (row) => row.completedLines },
                { id: 'lineCount', header: 'Total Lines', accessor: (row) => row.lineCount },
                { id: 'deliveryDate', header: 'Delivery', accessor: (row) => displayDate(row.deliveryDate) },
              ],
              orderStatusRows,
              'No DIFOT orders found.'
            )}
          </div>
        );
      }

      case 'select-contract':
      case 'create-contract': {
        const customerKey = `${contractForm.debtorNo}::${contractForm.branchCode}`;

        return (
          <div className="space-y-4">
            {drawerKey === 'select-contract' ? (
              <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Contracts</h3>
                  <div className="flex items-center gap-2">
                    <SearchableSelect
                      value={contractStatusFilter}
                      onChange={(value) => setContractStatusFilter(value)}
                      options={[
                        { value: '4', label: 'All' },
                        { value: '0', label: 'Not Yet Quoted' },
                        { value: '1', label: 'Quoted - No Order' },
                        { value: '2', label: 'Order Placed' },
                        { value: '3', label: 'Completed' },
                      ]}
                      className="w-52"
                      inputClassName="py-2 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        resetContractEditor();
                        setDrawerMessage('');
                      }}
                      className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                    >
                      New Contract
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  {renderAdvancedTable<SalesContractSummary>(
                    'sales-contracts',
                    [
                      {
                        id: 'contractRef',
                        header: 'Contract',
                        accessor: (row) => row.contractRef,
                        cell: (row) => (
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{row.contractRef}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{row.contractDescription}</p>
                          </div>
                        ),
                      },
                      { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                      { id: 'statusLabel', header: 'Status', accessor: (row) => row.statusLabel },
                      { id: 'requiredDate', header: 'Required', accessor: (row) => displayDate(row.requiredDate) },
                      { id: 'orderNo', header: 'Order', accessor: (row) => (row.orderNo > 0 ? row.orderNo : '-') },
                      {
                        id: 'totalCost',
                        header: 'Cost',
                        accessor: (row) => row.totalCost,
                        exportValue: (row) => row.totalCost,
                        cell: (row) => (
                          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.totalCost)}</span>
                        ),
                      },
                      {
                        id: 'actions',
                        header: 'Actions',
                        accessor: () => '',
                        filterable: false,
                        cell: (row) => (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openContractForEdit(row.contractRef).catch((error) => setDrawerError(String(error)))}
                              className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                            >
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                quoteContractByRef(row.contractRef).catch((error) => setDrawerError(String(error)));
                              }}
                              className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                            >
                              Quote
                            </button>
                          </div>
                        ),
                      },
                    ],
                    contractRows,
                    'No contracts found.'
                  )}
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedContractRef ? `Edit Contract: ${selectedContractRef}` : 'Create Contract'}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveContract().catch((error) => setDrawerError(String(error)))}
                    className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    {selectedContractRef ? 'Update Contract' : 'Save Contract'}
                  </button>
                  <button
                    type="button"
                    onClick={() => createContractQuotationNow().catch((error) => setDrawerError(String(error)))}
                    disabled={!selectedContractRef}
                    className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-medium text-white enabled:hover:bg-brand-600 disabled:opacity-50"
                  >
                    Create Quotation
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelCurrentContract().catch((error) => setDrawerError(String(error)))}
                    disabled={!selectedContractRef}
                    className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700 enabled:hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/40 dark:text-rose-300 dark:enabled:hover:bg-rose-950/30"
                  >
                    Cancel Contract
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  value={contractForm.contractRef}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, contractRef: event.target.value }))}
                  placeholder="Contract Ref"
                  disabled={Boolean(selectedContractRef)}
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white disabled:bg-gray-100 dark:bg-slate-950 dark:disabled:bg-slate-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={contractForm.customerRef}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, customerRef: event.target.value }))}
                  placeholder="Customer reference"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <textarea
                  value={contractForm.contractDescription}
                  onChange={(event) =>
                    setContractForm((previous) => ({ ...previous, contractDescription: event.target.value }))
                  }
                  placeholder="Contract description"
                  rows={3}
                  className="md:col-span-2 rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <SearchableSelect
                  value={customerKey}
                  onChange={(value) => {
                    const [debtorNo, branchCode] = value.split('::');
                    const selected = contractLookups?.customers.find(
                      (row) => row.debtorNo === debtorNo && row.branchCode === branchCode
                    );
                    setContractForm((previous) => ({
                      ...previous,
                      debtorNo: debtorNo ?? '',
                      branchCode: branchCode ?? '',
                      locationCode: selected?.defaultLocation || previous.locationCode,
                    }));
                  }}
                  placeholder="Select customer/branch"
                  options={(contractLookups?.customers ?? []).map((row) => ({
                    value: `${row.debtorNo}::${row.branchCode}`,
                    label: `${row.customerName} (${row.debtorNo}/${row.branchCode})`,
                    searchText: `${row.customerName} ${row.debtorNo} ${row.branchCode}`,
                  }))}
                />
                <SearchableSelect
                  value={contractForm.categoryId}
                  onChange={(value) => setContractForm((previous) => ({ ...previous, categoryId: value }))}
                  placeholder="Select category"
                  options={(contractLookups?.categories ?? []).map((row) => ({
                    value: row.categoryId,
                    label: `${row.categoryId} - ${row.categoryDescription}`,
                    searchText: `${row.categoryId} ${row.categoryDescription}`,
                  }))}
                />
                <SearchableSelect
                  value={contractForm.locationCode}
                  onChange={(value) => setContractForm((previous) => ({ ...previous, locationCode: value }))}
                  placeholder="Select location"
                  options={(contractLookups?.locations ?? []).map((row) => ({
                    value: row.locationCode,
                    label: `${row.locationCode} - ${row.locationName}`,
                    searchText: `${row.locationCode} ${row.locationName}`,
                  }))}
                />
                <SearchableSelect
                  value={contractForm.defaultWorkCentre}
                  onChange={(value) =>
                    setContractForm((previous) => ({ ...previous, defaultWorkCentre: value }))
                  }
                  placeholder="Default work centre"
                  options={workCentresForLocation.map((row) => ({
                    value: row.workCentreCode,
                    label: `${row.workCentreCode} - ${row.description}`,
                    searchText: `${row.workCentreCode} ${row.description}`,
                  }))}
                />
                <DatePicker
                  value={contractForm.requiredDate}
                  onChange={(value) => setContractForm((previous) => ({ ...previous, requiredDate: value }))}
                  inputClassName="border-brand-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-brand-800 dark:bg-slate-950 dark:text-white"
                />
                <input
                  value={contractForm.margin}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, margin: event.target.value }))}
                  placeholder="Margin %"
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={contractForm.exchangeRate}
                  onChange={(event) => setContractForm((previous) => ({ ...previous, exchangeRate: event.target.value }))}
                  placeholder="Exchange rate"
                  inputMode="decimal"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
            </section>

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Contract BOM</h4>
                <button
                  type="button"
                  onClick={addContractBomLine}
                  className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                >
                  Add BOM Line
                </button>
              </div>

              <div className="mt-3">
                {renderAdvancedTable<ContractBomDraftLine>(
                  'sales-contract-bom-lines',
                  [
                    {
                      id: 'stockId',
                      header: 'Stock ID',
                      accessor: (row) => row.stockId,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <input
                            value={row.stockId}
                            onChange={(event) =>
                              setContractBomLines((previous) =>
                                previous.map((line, i) => (i === index ? { ...line, stockId: event.target.value } : line))
                              )
                            }
                            placeholder="Stock ID"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'workCentreCode',
                      header: 'Work Centre',
                      accessor: (row) => row.workCentreCode,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <SearchableSelect
                            value={row.workCentreCode}
                            onChange={(value) =>
                              setContractBomLines((previous) =>
                                previous.map((line, i) =>
                                  i === index ? { ...line, workCentreCode: value } : line
                                )
                              )
                            }
                            placeholder="Default"
                            options={[
                              { value: '', label: 'Default' },
                              ...workCentresForLocation.map((workCentre) => ({
                                value: workCentre.workCentreCode,
                                label: `${workCentre.workCentreCode} - ${workCentre.description}`,
                                searchText: `${workCentre.workCentreCode} ${workCentre.description}`,
                              })),
                            ]}
                            inputClassName="px-2 py-1.5 text-sm"
                          />
                        );
                      },
                    },
                    {
                      id: 'quantity',
                      header: 'Quantity',
                      accessor: (row) => row.quantity,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <input
                            value={row.quantity}
                            onChange={(event) =>
                              setContractBomLines((previous) =>
                                previous.map((line, i) => (i === index ? { ...line, quantity: event.target.value } : line))
                              )
                            }
                            inputMode="decimal"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'actions',
                      header: 'Action',
                      accessor: () => '',
                      filterable: false,
                      cell: (row) => {
                        const index = contractBomLines.indexOf(row);
                        return (
                          <button
                            type="button"
                            onClick={() => removeContractBomLine(index)}
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          >
                            Remove
                          </button>
                        );
                      },
                    },
                  ],
                  contractBomLines,
                  'No BOM lines yet.'
                )}
              </div>
            </section>

            <section className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Other Requirements</h4>
                <button
                  type="button"
                  onClick={addContractRequirementLine}
                  className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                >
                  Add Requirement
                </button>
              </div>

              <div className="mt-3">
                {renderAdvancedTable<ContractRequirementDraftLine>(
                  'sales-contract-requirement-lines',
                  [
                    {
                      id: 'requirement',
                      header: 'Requirement',
                      accessor: (row) => row.requirement,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <input
                            value={row.requirement}
                            onChange={(event) =>
                              setContractRequirementLines((previous) =>
                                previous.map((line, i) =>
                                  i === index ? { ...line, requirement: event.target.value } : line
                                )
                              )
                            }
                            placeholder="Requirement details"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'quantity',
                      header: 'Quantity',
                      accessor: (row) => row.quantity,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <input
                            value={row.quantity}
                            onChange={(event) =>
                              setContractRequirementLines((previous) =>
                                previous.map((line, i) => (i === index ? { ...line, quantity: event.target.value } : line))
                              )
                            }
                            inputMode="decimal"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'costPerUnit',
                      header: 'Cost/Unit',
                      accessor: (row) => row.costPerUnit,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <input
                            value={row.costPerUnit}
                            onChange={(event) =>
                              setContractRequirementLines((previous) =>
                                previous.map((line, i) =>
                                  i === index ? { ...line, costPerUnit: event.target.value } : line
                                )
                              )
                            }
                            inputMode="decimal"
                            className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                          />
                        );
                      },
                    },
                    {
                      id: 'actions',
                      header: 'Action',
                      accessor: () => '',
                      filterable: false,
                      cell: (row) => {
                        const index = contractRequirementLines.indexOf(row);
                        return (
                          <button
                            type="button"
                            onClick={() => removeContractRequirementLine(index)}
                            className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                          >
                            Remove
                          </button>
                        );
                      },
                    },
                  ],
                  contractRequirementLines,
                  'No requirement lines yet.'
                )}
              </div>
            </section>
          </div>
        );
      }
    }
  };

  return (
    <>
      <div className="akiva-page-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
        <div className="mx-auto max-w-[1520px]">
          <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
            <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                      <Building2 className="h-4 w-4 text-akiva-accent-text" />
                      Sales
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                      <CalendarDays className="h-4 w-4 text-akiva-accent-text" />
                      Updated {dashboardUpdatedLabel}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                      {isOnline ? <Wifi className="h-4 w-4 text-akiva-accent-text" /> : <WifiOff className="h-4 w-4 text-akiva-text-muted" />}
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                    {mode === 'transactions' ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                        <span className={`akiva-status-dot ${syncState === 'error' ? 'bg-red-600' : syncState === 'active' ? 'bg-emerald-600' : 'bg-slate-500'}`} />
                        Sync {syncState}
                      </span>
                    ) : null}
                  </div>
                  <h1 className="mt-4 akiva-page-title">{modeTitle}</h1>
                  <p className="akiva-page-subtitle">{modeSubtitle}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void Promise.all([
                        reloadSalesDashboard(),
                        reloadCustomerTrend(customerTrendRange),
                      ]).catch((error) => setErrorMessage(String(error)));
                    }}
                    disabled={loading || customerTrendLoading}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Refresh sales dashboard"
                    title="Refresh sales dashboard"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading || customerTrendLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openSalesDashboardAction('enter-order')}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full bg-akiva-accent px-4 text-sm font-semibold text-white shadow-sm shadow-violet-950/10 transition hover:bg-akiva-accent-strong"
                  >
                    <Plus className="h-4 w-4" />
                    New Order
                  </button>
                </div>
              </div>
            </header>

            <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">

        {mode === 'transactions' && !routeTemplateRoute ? (
          <>
            <SalesDashboardPanel
              dashboard={salesDashboard}
              loading={loading}
              dateFormat={dateFormat}
              customerTrend={customerTrend}
              customerTrendLoading={customerTrendLoading}
              customerTrendRange={customerTrendRange}
              onCustomerTrendRangeChange={setCustomerTrendRange}
              onOpenAction={openSalesDashboardAction}
            />

            <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Quick Draft</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  value={form.customerName}
                  onChange={(event) => setForm((prev) => ({ ...prev, customerName: event.target.value }))}
                  placeholder="Customer name"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={form.debtorNo}
                  onChange={(event) => setForm((prev) => ({ ...prev, debtorNo: event.target.value }))}
                  placeholder="Debtor code"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <input
                  value={form.customerRef}
                  onChange={(event) => setForm((prev) => ({ ...prev, customerRef: event.target.value }))}
                  placeholder="Customer ref"
                  className="rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                />
                <div className="flex gap-2">
                  <input
                    value={form.grossTotal}
                    onChange={(event) => setForm((prev) => ({ ...prev, grossTotal: event.target.value }))}
                    placeholder="Amount"
                    inputMode="decimal"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => submitDraft().catch((error) => setErrorMessage(String(error)))}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900">
              <div className="border-b border-brand-100 dark:border-brand-900/50 p-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Transactions</h2>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search order/customer"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="p-4 pt-3">
                {renderAdvancedTable<SalesTransaction>(
                  'sales-transactions',
                  [
                    { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo || '-' },
                    {
                      id: 'customerName',
                      header: 'Customer',
                      accessor: (row) => row.customerName,
                      cell: (row) => (
                        <div>
                          <p>{row.customerName}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{row.debtorNo}</p>
                        </div>
                      ),
                    },
                    { id: 'transactionDate', header: 'Date', accessor: (row) => displayDate(row.transactionDate) },
                    {
                      id: 'grossTotal',
                      header: 'Amount',
                      accessor: (row) => row.grossTotal,
                      exportValue: (row) => row.grossTotal,
                      cell: (row) => <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>,
                    },
                    { id: 'state', header: 'State', accessor: (row) => (row.settled ? 'Settled' : 'Open') },
                  ],
                  transactions,
                  'No transactions found.',
                  loading,
                  'Loading transactions...'
                )}
              </div>
              <div className="border-t border-brand-100 dark:border-brand-900/50 px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                Pending CouchDB changes: {pendingSync}
              </div>
            </section>

            <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900">
              <div className="p-4 border-b border-brand-100 dark:border-brand-900/50">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Offline Draft Orders</h2>
              </div>
              <div className="p-4 pt-3">
                {renderAdvancedTable<SalesOrderListItem>(
                  'sales-offline-orders',
                  [
                    { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo },
                    { id: 'customerName', header: 'Customer', accessor: (row) => row.customerName },
                    { id: 'orderDate', header: 'Date', accessor: (row) => displayDate(row.orderDate) },
                    {
                      id: 'grossTotal',
                      header: 'Amount',
                      accessor: (row) => row.grossTotal,
                      exportValue: (row) => row.grossTotal,
                      cell: (row) => formatCurrency(row.grossTotal),
                    },
                    { id: 'sync', header: 'Sync', accessor: (row) => statusLabel(row) },
                  ],
                  orders,
                  'No offline draft orders found.',
                  loading,
                  'Loading offline drafts...'
                )}
              </div>
            </section>
          </>
        ) : null}

        {mode === 'reports' && !routeTemplateRoute ? (
          <>
            <SalesDashboardPanel
              dashboard={salesDashboard}
              loading={loading}
              dateFormat={dateFormat}
              customerTrend={customerTrend}
              customerTrendLoading={customerTrendLoading}
              customerTrendRange={customerTrendRange}
              onCustomerTrendRangeChange={setCustomerTrendRange}
              onOpenAction={openSalesDashboardAction}
            />

            <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sales Summary Report</h2>
              {loading || !reportSummary ? (
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading reports...</p>
              ) : (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Monthly Sales</h3>
                    <div className="space-y-2">
                      {reportSummary.monthly.map((row) => (
                        <div key={row.month} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300">{row.month}</span>
                          <span className="text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Top Customers</h3>
                    <div className="space-y-2">
                      {reportSummary.topCustomers.map((row) => (
                        <div key={row.debtorNo} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300">{row.customerName}</span>
                          <span className="text-gray-900 dark:text-white">{formatCurrency(row.grossTotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : null}

        {mode === 'settings' && !routeTemplateRoute ? (
          <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Sales Settings</h2>
            {loading || !settings ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading settings...</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Sales Types</h3>
                  {settings.salesTypes.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">{item.code} - {item.name}</p>
                  ))}
                </div>
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Payment Terms</h3>
                  {settings.paymentTerms.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">{item.code} - {item.name}</p>
                  ))}
                </div>
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Hold Reasons</h3>
                  {settings.holdReasons.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">
                      {item.code} - {item.name} ({item.blocksInvoicing ? 'Blocks invoices' : 'Allowed'})
                    </p>
                  ))}
                </div>
                <div className="rounded-lg border border-brand-100 dark:border-brand-900/50 p-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Sales People</h3>
                  {settings.salesPeople.map((item) => (
                    <p key={item.code} className="text-sm text-gray-700 dark:text-gray-300">
                      {item.code} - {item.name} ({item.current ? 'Current' : 'Inactive'})
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : null}

        {routeTemplateRoute && drawerKey && drawerDetails ? (
          <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-900 p-4 space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{drawerDetails.title}</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{drawerDetails.subtitle}</p>
              </div>
              {dashboardDrawerKey && !routeDrawerKey ? (
                <button
                  type="button"
                  onClick={() => setDashboardDrawerKey(null)}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-900/20"
                >
                  <X className="h-3.5 w-3.5" />
                  Close
                </button>
              ) : null}
            </div>

            {drawerSupportsSearch(drawerKey) ? (
              <div className="relative w-full max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  value={drawerSearch}
                  onChange={(event) => setDrawerSearch(event.target.value)}
                  placeholder="Search in this module"
                  className="w-full rounded-lg border border-brand-200 dark:border-brand-800 bg-white dark:bg-slate-950 pl-8 pr-3 py-2 text-sm text-gray-900 dark:text-white"
                />
              </div>
            ) : null}

            {drawerMessage ? (
              <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700 dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-300">
                {drawerMessage}
              </div>
            ) : null}

            {drawerError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                {drawerError}
              </div>
            ) : null}

            {renderDrawerContent()}
          </section>
        ) : null}

        {errorMessage ? (
          <p className="text-xs font-semibold text-akiva-accent-text">{errorMessage}</p>
        ) : null}
            </div>
          </section>
        </div>
      </div>
      {confirmationDialog}
    </>
  );
}
