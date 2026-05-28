import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck2,
  FileSearch,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  WalletCards,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { buildApiUrl } from '../lib/network/apiBase';
import { apiFetch } from '../lib/network/apiClient';

type RiskTone = 'danger' | 'warning' | 'pending' | 'success' | 'info' | 'neutral';
type DashboardCardKey = 'cashAtRisk' | 'overdueReceivables' | 'approvalBacklog' | 'stockExposure';
type DashboardCardValueType = 'money' | 'number';
type WorkflowBottleneckKey = 'poApproval' | 'grnPosting' | 'invoiceMatch' | 'paymentRun';
type ModulePulsePostedType = 'money' | 'percent' | 'number';
type AiInsightIconKey = 'cash' | 'receivables' | 'approval' | 'supplier' | 'stock' | 'close' | 'clear';

interface DashboardCardPayload {
  value: number;
  count: number;
  detail: string;
  status: string;
  tone: RiskTone;
  meta?: Record<string, number | string | null>;
}

interface DashboardPayload {
  companyName?: string;
  currency: string;
  asOf: string;
  cards: Partial<Record<DashboardCardKey, DashboardCardPayload>>;
  cashFlowForecast?: CashFlowForecastPayload;
  workflowBottlenecks?: WorkflowBottleneckPayload[];
  supplierExposure?: SupplierExposurePayload;
  modulePulse?: ModulePulsePayload[];
  aiInsights?: AiInsightPayload[];
}

interface DashboardApiResponse {
  success?: boolean;
  message?: string;
  data?: DashboardPayload;
}

interface CashFlowForecastRow {
  month: string;
  label: string;
  cash: number | null;
  receivables: number;
  payables: number;
  forecastCash: number | null;
  isForecast: boolean;
}

interface CashFlowForecastPayload {
  currency: string;
  generatedAt: string;
  forecastStartMonth: string;
  minimumReserve: number;
  rows: CashFlowForecastRow[];
  summary: {
    openingCash: number;
    closingForecast: number;
    projectedReceivables: number;
    projectedPayables: number;
    netProjectedFlow: number;
    lowestProjectedCash: number;
  };
}

interface WorkflowBottleneckPayload {
  id: WorkflowBottleneckKey;
  label: string;
  count: number;
  value: number;
  target: number;
  tone: RiskTone;
}

interface SupplierExposureRow {
  supplier: string;
  value: number;
  orders: number;
  overdueOrders: number;
  approvalAging: number;
  share: number;
  shareLabel: string;
  sla: string;
  color: string;
}

interface SupplierExposurePayload {
  totalExposure: number;
  exposureLimit: number;
  rows: SupplierExposureRow[];
}

interface ModulePulsePayload {
  id: string;
  module: string;
  owner: string;
  postedType: ModulePulsePostedType;
  postedValue: number;
  open: number;
  risk: number;
  tone: RiskTone;
}

interface AiInsightPayload {
  id: string;
  priority: number;
  title: string;
  area: string;
  summary: string;
  tone: RiskTone;
  icon: AiInsightIconKey;
  confidence: number;
  impactScore: number;
  riskScore: number;
  financialImpact: number;
  affectedRecords: string;
  expectedOutcome: string;
  recommendedAction: string;
  approval: string;
  sequence: string;
  reasoning: string;
  evidence: string[];
}

const createCurrencyFormatter = (currencyCode: string, options: Intl.NumberFormatOptions = {}) => {
  const safeCurrency = /^[A-Z]{3}$/.test((currencyCode || '').toUpperCase()) ? currencyCode.toUpperCase() : 'TZS';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 0,
      ...options,
    });
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'TZS',
      maximumFractionDigits: 0,
      ...options,
    });
  }
};

const chartTooltipContentStyle = {
  backgroundColor: 'var(--akiva-chart-tooltip-bg)',
  border: '1px solid var(--akiva-chart-tooltip-border)',
  borderRadius: '8px',
  color: 'var(--akiva-chart-tooltip-text)',
  boxShadow: '0 18px 38px rgba(0, 0, 0, 0.22)',
};

const chartTooltipTextStyle = {
  color: 'var(--akiva-chart-tooltip-text)',
  fontWeight: 600,
};

const formatDashboardNumber = (value: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(Number.isFinite(value) ? value : 0);

const formatDashboardMoney = (value: number, currencyCode: string) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatter = new Intl.NumberFormat('en-US', {
    notation: Math.abs(safeValue) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(safeValue) >= 1_000_000 ? 1 : 0,
  });

  return `${(currencyCode || 'TZS').toUpperCase()} ${formatter.format(safeValue)}`;
};

const formatDashboardDate = (value?: string) => {
  if (!value) return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

const executiveMetricDefinitions: Array<{
  key: DashboardCardKey;
  label: string;
  valueType: DashboardCardValueType;
  icon: LucideIcon;
  loadingDetail: string;
}> = [
  {
    key: 'cashAtRisk',
    label: 'Cash at risk',
    valueType: 'money',
    icon: Banknote,
    loadingDetail: 'Loading supplier payment exposure...',
  },
  {
    key: 'overdueReceivables',
    label: 'Overdue receivables',
    valueType: 'money',
    icon: WalletCards,
    loadingDetail: 'Loading overdue customer invoices...',
  },
  {
    key: 'approvalBacklog',
    label: 'Approval backlog',
    valueType: 'number',
    icon: ShieldCheck,
    loadingDetail: 'Loading purchasing approvals...',
  },
  {
    key: 'stockExposure',
    label: 'Stock exposure',
    valueType: 'number',
    icon: Boxes,
    loadingDetail: 'Loading stock balances...',
  },
];

function buildExecutiveMetrics(payload: DashboardPayload | null, loading: boolean, error: string) {
  const dashboardCurrency = payload?.currency || 'TZS';

  return executiveMetricDefinitions.map((definition) => {
    const card = payload?.cards?.[definition.key];
    const unavailable = error !== '' && !card;
    const value = card
      ? definition.valueType === 'money'
        ? formatDashboardMoney(card.value, dashboardCurrency)
        : formatDashboardNumber(card.value)
      : loading
        ? '...'
        : definition.valueType === 'money'
          ? formatDashboardMoney(0, dashboardCurrency)
          : '0';

    return {
      label: definition.label,
      value,
      detail: card?.detail ?? (unavailable ? 'Live data unavailable' : definition.loadingDetail),
      status: card?.status ?? (unavailable ? 'Unavailable' : 'Loading'),
      tone: card?.tone ?? (unavailable ? 'warning' as const : 'neutral' as const),
      icon: definition.icon,
    };
  });
}

const workflowBottleneckDefaults: WorkflowBottleneckPayload[] = [
  { id: 'poApproval', label: 'PO approval', count: 0, value: 0, target: 12, tone: 'pending' },
  { id: 'grnPosting', label: 'GRN posting', count: 0, value: 0, target: 8, tone: 'info' },
  { id: 'invoiceMatch', label: 'Invoice match', count: 0, value: 0, target: 10, tone: 'pending' },
  { id: 'paymentRun', label: 'Payment run', count: 0, value: 0, target: 6, tone: 'danger' },
];

const workflowBottleneckIcons: Record<WorkflowBottleneckKey, LucideIcon> = {
  poApproval: ShoppingCart,
  grnPosting: Truck,
  invoiceMatch: FileCheck2,
  paymentRun: CreditCard,
};

const aiInsightIcons: Record<AiInsightIconKey, LucideIcon> = {
  cash: Banknote,
  receivables: WalletCards,
  approval: ShieldCheck,
  supplier: ShoppingCart,
  stock: PackageCheck,
  close: FileCheck2,
  clear: CheckCircle2,
};

function buildWorkflowBottlenecks(payload: DashboardPayload | null): WorkflowBottleneckPayload[] {
  const rows = Array.isArray(payload?.workflowBottlenecks) ? payload.workflowBottlenecks : [];

  return workflowBottleneckDefaults.map((fallback) => {
    const row = rows.find((entry) => entry.id === fallback.id);
    if (!row) return fallback;

    return {
      ...fallback,
      ...row,
      count: Number.isFinite(row.count) ? row.count : fallback.count,
      value: Number.isFinite(row.value) ? row.value : fallback.value,
      target: Number.isFinite(row.target) && row.target > 0 ? row.target : fallback.target,
    };
  });
}

function formatModulePulsePosted(row: ModulePulsePayload, currencyFormatter: Intl.NumberFormat): string {
  const value = Number.isFinite(row.postedValue) ? row.postedValue : 0;

  if (row.postedType === 'percent') {
    return `${formatDashboardNumber(value)}%`;
  }

  if (row.postedType === 'number') {
    return formatDashboardNumber(value);
  }

  return currencyFormatter.format(value);
}

function toneClasses(tone: RiskTone): string {
  if (tone === 'danger') return 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100';
  if (tone === 'warning') return 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100';
  if (tone === 'pending') return 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100';
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (tone === 'info') return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text';
}

function dotClass(tone: RiskTone): string {
  if (tone === 'danger') return 'bg-red-600 dark:bg-red-300';
  if (tone === 'warning') return 'bg-orange-600 dark:bg-orange-300';
  if (tone === 'pending') return 'bg-purple-600 dark:bg-purple-300';
  if (tone === 'success') return 'bg-emerald-600 dark:bg-emerald-300';
  if (tone === 'info') return 'bg-blue-600 dark:bg-blue-300';
  return 'bg-slate-500 dark:bg-slate-300';
}

function toneTextClass(tone: RiskTone): string {
  if (tone === 'danger') return 'text-red-700 dark:text-red-200';
  if (tone === 'warning') return 'text-orange-700 dark:text-orange-200';
  if (tone === 'pending') return 'text-purple-700 dark:text-purple-200';
  if (tone === 'success') return 'text-emerald-700 dark:text-emerald-200';
  if (tone === 'info') return 'text-blue-700 dark:text-blue-200';
  return 'text-akiva-text-muted';
}

function IconButton({ icon: Icon, label, onClick, disabled = false }: { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function subtleToneClass(tone: RiskTone): string {
  if (tone === 'danger') return 'border-red-300/80 bg-red-50/75 text-red-800 dark:border-red-800/80 dark:bg-red-950/30 dark:text-red-100';
  if (tone === 'warning') return 'border-orange-300/80 bg-orange-50/75 text-orange-800 dark:border-orange-800/80 dark:bg-orange-950/30 dark:text-orange-100';
  if (tone === 'pending') return 'border-purple-300/80 bg-purple-50/75 text-purple-800 dark:border-purple-800/80 dark:bg-purple-950/30 dark:text-purple-100';
  if (tone === 'success') return 'border-emerald-300/80 bg-emerald-50/75 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/30 dark:text-emerald-100';
  if (tone === 'info') return 'border-blue-300/80 bg-blue-50/75 text-blue-800 dark:border-blue-800/80 dark:bg-blue-950/30 dark:text-blue-100';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text';
}

function MetricStatusPill({ tone, children }: { tone: RiskTone; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <span className={`akiva-status-dot ${dotClass(tone)}`} />
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  status,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  status: string;
  tone: RiskTone;
  icon: LucideIcon;
}) {
  return (
    <article className="akiva-panel relative overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${dotClass(tone)}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">{label}</p>
          <p className="akiva-financial-value mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-muted ${toneTextClass(tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm leading-5 text-akiva-text-muted">{detail}</p>
        <MetricStatusPill tone={tone}>{status}</MetricStatusPill>
      </div>
    </article>
  );
}

function AttentionSummaryStrip({ payload, loading, error }: { payload: DashboardPayload | null; loading: boolean; error: string }) {
  const cards = payload?.cards ?? {};
  const cashAtRisk = cards.cashAtRisk;
  const overdueReceivables = cards.overdueReceivables;
  const approvalBacklog = cards.approvalBacklog;
  const stockExposure = cards.stockExposure;
  const currencyCode = payload?.currency || 'TZS';
  const totalItems = [cashAtRisk, overdueReceivables, approvalBacklog, stockExposure].reduce((sum, card) => sum + (card?.count ?? 0), 0);
  const receivableCover = (overdueReceivables?.value ?? 0) - (cashAtRisk?.value ?? 0);
  const financeDocuments = (cashAtRisk?.count ?? 0) + (overdueReceivables?.count ?? 0);
  const operationsItems = (approvalBacklog?.count ?? 0) + (stockExposure?.count ?? 0);
  const dominantQueue = [
    { label: 'cash', count: cashAtRisk?.count ?? 0 },
    { label: 'receivables', count: overdueReceivables?.count ?? 0 },
    { label: 'approvals', count: approvalBacklog?.count ?? 0 },
    { label: 'stock', count: stockExposure?.count ?? 0 },
  ].reduce((highest, item) => (item.count > highest.count ? item : highest), { label: 'none', count: 0 });
  const dominantShare = totalItems > 0 ? Math.round((dominantQueue.count / totalItems) * 100) : 0;
  const summaryTone: RiskTone = error ? 'warning' : loading ? 'neutral' : totalItems > 0 ? 'warning' : 'success';
  const summaryLabel = error ? 'Live data unavailable' : loading ? 'Loading' : totalItems > 0 ? 'Open work' : 'Clear';
  const summaryValue = loading ? '...' : formatDashboardNumber(totalItems);
  const summaryNote = loading ? 'Reading live dashboard data' : 'Combined open work across finance, approvals, and stock';
  const actionTiles = [
    {
      label: receivableCover >= 0 ? 'AR cover' : 'Cash gap',
      value: loading ? '...' : formatDashboardMoney(Math.abs(receivableCover), currencyCode),
      note: receivableCover >= 0
        ? 'Overdue receivables exceed supplier bills due soon'
        : 'Supplier bills due soon exceed overdue receivables',
      tone: receivableCover >= 0 ? ('warning' as RiskTone) : ('danger' as RiskTone),
    },
    {
      label: 'Finance documents',
      value: loading ? '...' : formatDashboardNumber(financeDocuments),
      note: 'Supplier bills due soon plus overdue invoices',
      tone: financeDocuments > 0 ? ('warning' as RiskTone) : ('success' as RiskTone),
    },
    {
      label: 'Ops workload',
      value: loading ? '...' : formatDashboardNumber(operationsItems),
      note: 'Approval items and stock balance issues',
      tone: operationsItems > 0 ? ('pending' as RiskTone) : ('success' as RiskTone),
    },
    {
      label: 'Largest driver',
      value: loading ? '...' : `${dominantShare}%`,
      note: dominantQueue.count > 0 ? `${dominantQueue.label} is the biggest share of open work` : 'No open driver today',
      tone: dominantQueue.count > 0 ? ('info' as RiskTone) : ('success' as RiskTone),
    },
  ];

  return (
    <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
      <div className="grid gap-4 xl:grid-cols-[220px_1fr] xl:items-center">
        <div className={`rounded-xl border p-4 ${subtleToneClass(summaryTone)}`}>
          <p className="text-xs font-semibold uppercase tracking-wide">Daily workload</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="akiva-financial-value text-4xl font-semibold">{summaryValue}</span>
          </div>
          <p className="mt-2 text-sm font-semibold">{summaryLabel}</p>
          <p className="mt-1 text-xs leading-5 opacity-80">{summaryNote}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actionTiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{tile.label}</p>
              <p className="akiva-financial-value mt-2 text-lg font-semibold text-akiva-text">{tile.value}</p>
              <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{tile.note}</p>
              <span className={`mt-2 inline-flex h-2 w-2 rounded-full ${dotClass(tile.tone)}`} aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Panel({ title, detail, icon: Icon, children }: { title: string; detail?: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-muted text-akiva-accent-text">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-akiva-text">{title}</h2>
          {detail ? <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{detail}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function WorkflowStage({ item, currencyFormatter }: { item: WorkflowBottleneckPayload; currencyFormatter: Intl.NumberFormat }) {
  const Icon = workflowBottleneckIcons[item.id];
  const ratio = Math.min(100, Math.round((item.count / Math.max(item.target, 1)) * 100));

  return (
    <button type="button" className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClasses(item.tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold leading-tight text-akiva-text">{item.label}</span>
          <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{currencyFormatter.format(item.value)} value waiting</span>
        </span>
        <span className="akiva-financial-value text-lg font-semibold text-akiva-text">{item.count}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-akiva-surface-muted">
        <div className={`h-2 rounded-full ${dotClass(item.tone)}`} style={{ width: `${ratio}%` }} />
      </div>
    </button>
  );
}

function insightImpactLabel(insight: AiInsightPayload, currencyFormatter: Intl.NumberFormat): string {
  return insight.financialImpact > 0 ? currencyFormatter.format(insight.financialImpact) : insight.affectedRecords || 'Operational';
}

function AiInsightMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-md border border-akiva-border bg-akiva-surface-raised px-2 py-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</span>
      <span className="akiva-financial-value text-xs font-semibold text-akiva-text">{value}</span>
    </span>
  );
}

function AiInsightCard({
  insight,
  currencyFormatter,
  featured = false,
}: {
  insight: AiInsightPayload;
  currencyFormatter: Intl.NumberFormat;
  featured?: boolean;
}) {
  const Icon = aiInsightIcons[insight.icon] ?? AlertTriangle;
  const impactLabel = insightImpactLabel(insight, currencyFormatter);
  const evidence = Array.isArray(insight.evidence) ? insight.evidence.filter(Boolean).slice(0, featured ? 3 : 2) : [];

  return (
    <button
      type="button"
      className={`relative w-full overflow-hidden rounded-lg border px-3 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted ${featured ? `py-4 ${subtleToneClass(insight.tone)}` : 'bg-akiva-surface py-3 border-akiva-border'}`}
    >
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${dotClass(insight.tone)}`} aria-hidden="true" />
      <div className="flex gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClasses(insight.tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClasses(insight.tone)}`}>P{insight.priority}</span>
            <span className="text-xs font-semibold text-akiva-text-muted">{insight.area}</span>
          </span>
          <span className="mt-2 block text-sm font-semibold leading-5 text-akiva-text">{insight.title}</span>
          <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{insight.summary}</span>

          <span className="mt-2 grid gap-1.5 sm:grid-cols-3">
            <AiInsightMetric label="Confidence" value={`${formatDashboardNumber(insight.confidence)}%`} />
            <AiInsightMetric label="Impact" value={`${insight.impactScore.toFixed(1)}/10`} />
            <AiInsightMetric label="Risk" value={formatDashboardNumber(insight.riskScore)} />
          </span>

          <span className="mt-2 block rounded-md border border-akiva-border bg-akiva-surface-raised px-2 py-1.5 text-[11px] leading-5 text-akiva-text-muted">
            <span className="font-semibold text-akiva-text">{impactLabel}</span>
            <span className="mx-1 text-akiva-border-strong">|</span>
            {insight.expectedOutcome}
            {insight.sequence ? (
              <>
                <span className="mx-1 text-akiva-border-strong">|</span>
                {insight.sequence}
              </>
            ) : null}
          </span>

          {featured && insight.reasoning ? (
            <span className="mt-2 block text-[11px] leading-5 text-akiva-text-muted">
              <span className="font-semibold text-akiva-text">Reason:</span> {insight.reasoning}
            </span>
          ) : null}

          {evidence.length > 0 ? (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {evidence.map((item) => (
                <span key={item} className="rounded-full border border-akiva-border bg-akiva-surface-raised px-2 py-0.5 text-[11px] font-semibold text-akiva-text-muted">
                  {item}
                </span>
              ))}
            </span>
          ) : null}

          <span className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-akiva-accent-text">{insight.recommendedAction}</span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-akiva-text-muted">
              {insight.approval}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </span>
        </span>
      </div>
    </button>
  );
}

function AiInsightsPanel({
  insights,
  loading,
  error,
  currencyFormatter,
}: {
  insights: AiInsightPayload[];
  loading: boolean;
  error: string;
  currencyFormatter: Intl.NumberFormat;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 py-8 text-center text-sm font-semibold text-akiva-text-muted">
        Loading AI insights...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border p-4 text-sm font-semibold ${subtleToneClass('warning')}`}>
        AI insights unavailable while dashboard data cannot be loaded.
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className={`rounded-lg border p-4 text-sm font-semibold ${subtleToneClass('success')}`}>
        No critical AI actions queued.
      </div>
    );
  }

  const [leadInsight, ...supportingInsights] = insights;

  return (
    <div className="space-y-2">
      <AiInsightCard insight={leadInsight} currencyFormatter={currencyFormatter} featured />
      {supportingInsights.map((insight) => (
        <AiInsightCard key={insight.id} insight={insight} currencyFormatter={currencyFormatter} />
      ))}
    </div>
  );
}

function CloseReadinessList({
  rows,
  loading,
  error,
  currencyFormatter,
}: {
  rows: ModulePulsePayload[];
  loading: boolean;
  error: string;
  currencyFormatter: Intl.NumberFormat;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 py-8 text-center text-sm font-semibold text-akiva-text-muted">
        {loading ? 'Loading close readiness...' : error || 'No close readiness data returned.'}
      </div>
    );
  }

  const orderedRows = [...rows].sort((left, right) => (right.risk - left.risk) || (right.open - left.open));

  return (
    <div className="space-y-3">
      {orderedRows.map((row) => (
        <div key={row.id || row.module} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2 text-sm font-semibold text-akiva-text">
              <span className={`akiva-status-dot mt-1.5 ${dotClass(row.tone)}`} />
              <span className="min-w-0">
                <span className="block break-words">{row.module}</span>
                <span className="mt-0.5 block text-xs font-medium text-akiva-text-muted">{row.owner}</span>
              </span>
            </span>
            <span className="akiva-financial-value shrink-0 text-sm font-semibold text-akiva-text">{formatModulePulsePosted(row, currencyFormatter)}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-semibold text-akiva-text-muted">
            <span className="rounded-md border border-akiva-border bg-akiva-surface-raised px-2 py-1">Open {formatDashboardNumber(row.open)}</span>
            <span className="rounded-md border border-akiva-border bg-akiva-surface-raised px-2 py-1">Risk {formatDashboardNumber(row.risk)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const [dashboardPayload, setDashboardPayload] = useState<DashboardPayload | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError('');

    try {
      const response = await apiFetch(buildApiUrl('/api/dashboard'));
      const json = (await response.json().catch(() => null)) as DashboardApiResponse | null;

      if (!response.ok || !json?.success || !json.data) {
        throw new Error(json?.message || 'Dashboard data could not be loaded.');
      }

      setDashboardPayload(json.data);
    } catch (caught) {
      setDashboardError(caught instanceof Error ? caught.message : 'Dashboard data could not be loaded.');
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const executiveMetrics = useMemo(
    () => buildExecutiveMetrics(dashboardPayload, dashboardLoading, dashboardError),
    [dashboardPayload, dashboardLoading, dashboardError],
  );
  const cashFlowForecast = dashboardPayload?.cashFlowForecast ?? null;
  const cashFlowRows = Array.isArray(cashFlowForecast?.rows) ? cashFlowForecast.rows : [];
  const chartCurrencyCode = cashFlowForecast?.currency || dashboardPayload?.currency || 'TZS';
  const chartCurrency = useMemo(() => createCurrencyFormatter(chartCurrencyCode), [chartCurrencyCode]);
  const compactChartCurrency = useMemo(
    () => createCurrencyFormatter(chartCurrencyCode, { notation: 'compact', maximumFractionDigits: 1 }),
    [chartCurrencyCode],
  );
  const workflowBottlenecks = useMemo(
    () => buildWorkflowBottlenecks(dashboardPayload),
    [dashboardPayload],
  );
  const supplierExposurePayload = dashboardPayload?.supplierExposure ?? null;
  const supplierExposureRows = Array.isArray(supplierExposurePayload?.rows) ? supplierExposurePayload.rows : [];
  const supplierExposureLimit = Number.isFinite(supplierExposurePayload?.exposureLimit ?? NaN)
    ? Number(supplierExposurePayload?.exposureLimit)
    : 0;
  const hasSupplierExposureRows = supplierExposureRows.length > 0;
  const modulePulseRows = Array.isArray(dashboardPayload?.modulePulse) ? dashboardPayload.modulePulse : [];
  const hasModulePulseRows = modulePulseRows.length > 0;
  const aiInsights = Array.isArray(dashboardPayload?.aiInsights) ? dashboardPayload.aiInsights : [];
  const formatCashFlowTooltipValue = useCallback(
    (value: unknown) => {
      if (typeof value === 'number') return chartCurrency.format(value);
      return String(value ?? '');
    },
    [chartCurrency],
  );
  const forecastStartPoint = cashFlowRows.find((row) => row.month === cashFlowForecast?.forecastStartMonth);
  const latestActualCashPoint = [...cashFlowRows].reverse().find((row) => typeof row.cash === 'number');
  const finalForecastPoint = [...cashFlowRows].reverse().find((row) => typeof row.forecastCash === 'number');
  const hasCashFlowRows = cashFlowRows.length > 0;
  const minimumReserve = cashFlowForecast?.minimumReserve ?? 0;
  const projectedReceivables = cashFlowForecast?.summary.projectedReceivables ?? 0;
  const projectedPayables = cashFlowForecast?.summary.projectedPayables ?? 0;
  const netProjectedFlow = cashFlowForecast?.summary.netProjectedFlow ?? 0;
  const closingForecast = cashFlowForecast?.summary.closingForecast ?? 0;
  const lowestProjectedCash = cashFlowForecast?.summary.lowestProjectedCash ?? 0;
  const finalForecastLabel = finalForecastPoint?.label ?? 'forecast end';
  const companyName = dashboardPayload?.companyName || 'Akiva ERP';
  const dashboardDate = formatDashboardDate(dashboardPayload?.asOf);

  return (
    <div className="akiva-page-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <Building2 className="h-4 w-4 text-akiva-accent-text" />
                    {companyName}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <CalendarDays className="h-4 w-4 text-akiva-accent-text" />
                    {dashboardDate}
                  </span>
                </div>
                <h1 className="mt-4 akiva-page-title">
                  Dashboard
                </h1>
                <p className="akiva-page-subtitle">
                  Finance risk, purchase throughput, inventory exposure, and close readiness prioritized for daily operational decisions.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <IconButton icon={RefreshCw} label="Refresh dashboard" onClick={() => void loadDashboard()} disabled={dashboardLoading} />
                <IconButton icon={FileSearch} label="Open audit trail" />
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-akiva-accent px-4 text-sm font-semibold text-white shadow-sm shadow-violet-950/10 transition hover:bg-akiva-accent-strong"
                >
                  <Sparkles className="h-4 w-4" />
                  Open Worklist
                </button>
              </div>
            </div>
          </header>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
            <main className="space-y-4 lg:col-span-8">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {executiveMetrics.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
              </section>

              <AttentionSummaryStrip payload={dashboardPayload} loading={dashboardLoading} error={dashboardError} />

              <Panel title="Cash Flow Forecast" detail="Cash balance, receivables, payables, and payment pressure by month." icon={ReceiptText}>
                <div className="h-72">
                  {hasCashFlowRows ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cashFlowRows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--akiva-chart-muted)' }} />
                        <YAxis tickFormatter={(value: number) => compactChartCurrency.format(value)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }} width={58} />
                        <Tooltip
                          formatter={formatCashFlowTooltipValue}
                          contentStyle={chartTooltipContentStyle}
                          labelStyle={chartTooltipTextStyle}
                          itemStyle={chartTooltipTextStyle}
                        />
                        <Area type="monotone" dataKey="receivables" name="Receivables due" stroke="var(--akiva-chart-warning)" strokeWidth={2} fill="rgba(217, 119, 6, 0.12)" />
                        <Area type="monotone" dataKey="payables" name="Payables due" stroke="var(--akiva-chart-danger)" strokeWidth={2} fill="rgba(220, 38, 38, 0.1)" />
                        <Line type="monotone" dataKey="cash" name="Cash balance" stroke="var(--akiva-chart-ink)" strokeWidth={3} dot={false} connectNulls />
                        <Line type="monotone" dataKey="forecastCash" name="Forecast cash balance" stroke="var(--akiva-chart-pending)" strokeWidth={2.5} strokeDasharray="6 6" dot={false} connectNulls />
                        {minimumReserve > 0 ? (
                          <ReferenceLine y={minimumReserve} stroke="var(--akiva-chart-danger)" strokeDasharray="5 5" label={{ value: '30-day reserve', fill: 'var(--akiva-chart-danger)', fontSize: 11 }} />
                        ) : null}
                        {forecastStartPoint ? (
                          <ReferenceLine x={forecastStartPoint.label} stroke="var(--akiva-chart-pending)" strokeDasharray="3 5" label={{ value: 'Forecast start', fill: 'var(--akiva-chart-pending)', fontSize: 11, position: 'insideTop' }} />
                        ) : null}
                        {latestActualCashPoint?.cash !== null && latestActualCashPoint?.cash !== undefined ? (
                          <ReferenceDot x={latestActualCashPoint.label} y={latestActualCashPoint.cash} r={5} fill="var(--akiva-chart-ink)" stroke="var(--akiva-chart-tooltip-bg)" strokeWidth={2} label={{ value: 'Latest cash', fill: 'var(--akiva-chart-ink)', fontSize: 11, position: 'top' }} />
                        ) : null}
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 text-center text-sm font-semibold text-akiva-text-muted">
                      {dashboardLoading ? 'Loading cash flow forecast...' : dashboardError || 'No cash flow forecast data returned.'}
                    </div>
                  )}
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
                    30-day supplier reserve: {chartCurrency.format(minimumReserve)}
                  </div>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 font-semibold text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100">
                    Forecast AR/AP: {chartCurrency.format(projectedReceivables)} / {chartCurrency.format(projectedPayables)}
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                    Closing cash by {finalForecastLabel}: {chartCurrency.format(closingForecast)}
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 font-semibold text-purple-800 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-100">
                    Net projected flow: {chartCurrency.format(netProjectedFlow)}; low point {chartCurrency.format(lowestProjectedCash)}
                  </div>
                </div>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
                <Panel title="Workflow Bottlenecks" detail="Queues that slow purchasing, receiving, bill matching, and payments." icon={Clock3}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {workflowBottlenecks.map((item) => (
                      <WorkflowStage key={item.id} item={item} currencyFormatter={chartCurrency} />
                    ))}
                  </div>
                </Panel>

                <Panel title="Supplier Exposure" detail="Open commitment concentration by supplier." icon={ShoppingCart}>
                  <div className="h-64">
                    {hasSupplierExposureRows ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={supplierExposureRows} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
                          <CartesianGrid horizontal={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
                          <XAxis type="number" tickFormatter={(value: number) => compactChartCurrency.format(value)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }} />
                          <YAxis type="category" dataKey="supplier" width={138} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }} />
                          <Tooltip
                            formatter={formatCashFlowTooltipValue}
                            contentStyle={chartTooltipContentStyle}
                            labelStyle={chartTooltipTextStyle}
                            itemStyle={chartTooltipTextStyle}
                          />
                          {supplierExposureLimit > 0 ? (
                            <ReferenceLine x={supplierExposureLimit} stroke="var(--akiva-chart-warning)" strokeDasharray="5 5" label={{ value: 'Exposure limit', fill: 'var(--akiva-chart-warning)', fontSize: 11, position: 'insideTopRight' }} />
                          ) : null}
                          <Bar dataKey="value" name="Open PO commitment" radius={[0, 8, 8, 0]} barSize={22}>
                            {supplierExposureRows.map((row) => (
                              <Cell key={row.supplier} fill={row.color || 'var(--akiva-chart-ink)'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 text-center text-sm font-semibold text-akiva-text-muted">
                        {dashboardLoading ? 'Loading supplier exposure...' : dashboardError || 'No open supplier commitments returned.'}
                      </div>
                    )}
                  </div>
                  {hasSupplierExposureRows ? (
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                      {supplierExposureRows.slice(0, 2).map((row, index) => (
                        <div key={row.supplier} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex min-w-0 items-start gap-2 font-semibold text-akiva-text">
                              <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-akiva-accent-text" />
                              <span className="min-w-0 break-words">P{index + 1} {row.supplier}</span>
                            </span>
                            <span className="akiva-financial-value shrink-0 font-semibold text-akiva-text">{row.shareLabel}</span>
                          </div>
                          <p className="mt-1 break-words text-akiva-text-muted">{row.orders} open orders · {row.sla}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </Panel>
              </div>

              <Panel title="Module Pulse" detail="Posted value, open work, and exception pressure by operating area." icon={CheckCircle2}>
                <div className="overflow-x-auto rounded-lg border border-akiva-border">
                  <table className="w-full min-w-[680px] border-separate border-spacing-0 text-sm" aria-label="Module pulse">
                    <thead className="bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-table-header-text">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Module</th>
                        <th className="px-3 py-2 text-left font-semibold">Owner</th>
                        <th className="px-3 py-2 text-right font-semibold">Posted</th>
                        <th className="px-3 py-2 text-right font-semibold">Open</th>
                        <th className="px-3 py-2 text-right font-semibold">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-akiva-border bg-akiva-surface-raised">
                      {hasModulePulseRows ? modulePulseRows.map((row) => (
                        <tr key={row.id || row.module} className="hover:bg-akiva-table-row-hover">
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2 font-semibold text-akiva-text">
                              <span className={`akiva-status-dot ${dotClass(row.tone)}`} />
                              <span className="break-words">{row.module}</span>
                            </span>
                          </td>
                          <td className="px-3 py-3 text-akiva-text-muted">{row.owner}</td>
                          <td className="akiva-financial-value px-3 py-3 text-right font-semibold text-akiva-text">{formatModulePulsePosted(row, chartCurrency)}</td>
                          <td className="akiva-financial-value px-3 py-3 text-right text-akiva-text">{formatDashboardNumber(row.open)}</td>
                          <td className="akiva-financial-value px-3 py-3 text-right font-semibold text-akiva-text">{formatDashboardNumber(row.risk)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-sm font-semibold text-akiva-text-muted">
                            {dashboardLoading ? 'Loading module pulse...' : dashboardError || 'No module pulse data returned.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </main>

            <aside className="space-y-4 lg:col-span-4">
              <Panel title="AI Insights" detail="Recommended actions ranked by impact, risk, and confidence." icon={Sparkles}>
                <AiInsightsPanel
                  insights={aiInsights}
                  loading={dashboardLoading}
                  error={dashboardError}
                  currencyFormatter={chartCurrency}
                />
              </Panel>

              <Panel title="Close Readiness" detail="Period close controls that need attention before management review." icon={FileCheck2}>
                <CloseReadinessList
                  rows={modulePulseRows}
                  loading={dashboardLoading}
                  error={dashboardError}
                  currencyFormatter={chartCurrency}
                />
              </Panel>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
