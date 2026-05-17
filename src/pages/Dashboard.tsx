import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
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
  type LucideIcon,
} from 'lucide-react';

type RiskTone = 'danger' | 'warning' | 'pending' | 'success' | 'info' | 'neutral';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const compactCurrency = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 1,
});

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

const executiveMetrics = [
  {
    label: 'Cash at risk',
    value: '$84,200',
    detail: 'Supplier payments due in 14 days',
    status: 'High',
    tone: 'danger' as const,
    icon: Banknote,
  },
  {
    label: 'Overdue receivables',
    value: '$38,240',
    detail: '21 invoices beyond credit terms',
    status: 'Collect',
    tone: 'warning' as const,
    icon: WalletCards,
  },
  {
    label: 'Approval backlog',
    value: '27',
    detail: 'POs and supplier bills awaiting decision',
    status: 'Aging',
    tone: 'pending' as const,
    icon: ShieldCheck,
  },
  {
    label: 'Stock exposure',
    value: '18',
    detail: 'Low or negative balances affecting sales',
    status: 'Review',
    tone: 'info' as const,
    icon: Boxes,
  },
];

const operationalRisk = {
  score: 82,
  label: 'Elevated',
  financialExposure: '$186.9k',
  blockedDocuments: 48,
  criticalCount: 6,
  pendingApprovals: 27,
};

const riskControls = [
  { label: 'Cash floor', value: '$120k', current: '$214.9k', tone: 'success' as const },
  { label: 'Overdue AR limit', value: '$30k', current: '$38.2k', tone: 'warning' as const },
  { label: 'Approval SLA', value: '8 hrs', current: '11.4 hrs', tone: 'pending' as const },
  { label: 'Stockout tolerance', value: '5 items', current: '18 items', tone: 'danger' as const },
];

const operatingFlow = [
  { label: 'PO approval', count: 18, value: 126000, target: 12, icon: ShoppingCart, tone: 'pending' as const },
  { label: 'GRN posting', count: 9, value: 48300, target: 8, icon: Truck, tone: 'info' as const },
  { label: 'Invoice match', count: 14, value: 62700, target: 10, icon: FileCheck2, tone: 'pending' as const },
  { label: 'Payment run', count: 7, value: 84200, target: 6, icon: CreditCard, tone: 'danger' as const },
];

const cashTrend = [
  { month: 'Jan', cash: 96000, receivables: 128000, payables: 82000 },
  { month: 'Feb', cash: 106000, receivables: 135000, payables: 89000 },
  { month: 'Mar', cash: 99000, receivables: 149000, payables: 93000 },
  { month: 'Apr', cash: 119000, receivables: 141000, payables: 102000 },
  { month: 'May', cash: 132000, receivables: 153000, payables: 110000 },
  { month: 'Jun', cash: 151000, receivables: 160000, payables: 116000 },
  { month: 'Jul', cash: 146000, receivables: 158000, payables: 106000 },
  { month: 'Aug', cash: 176000, receivables: 166000, payables: 122000 },
  { month: 'Sep', cash: 214870, receivables: 156841, payables: 84200 },
];

const supplierExposure = [
  { supplier: 'MSD Medical Store', value: 98200, orders: 8, color: 'var(--akiva-chart-danger)' },
  { supplier: 'Primecare Equipment', value: 74300, orders: 6, color: 'var(--akiva-chart-warning)' },
  { supplier: 'Afri Dental Products', value: 51100, orders: 9, color: 'var(--akiva-chart-pending)' },
  { supplier: 'Anudha Ltd', value: 38600, orders: 4, color: 'var(--akiva-chart-ink)' },
  { supplier: 'Action Medeor', value: 24200, orders: 3, color: 'var(--akiva-chart-success)' },
];

const exceptionQueue = [
  {
    area: 'Receivables',
    issue: 'Kijani Hospitals credit hold recommended',
    value: '$16,086',
    age: '67 days',
    owner: 'Credit Control',
    tone: 'danger' as const,
    action: 'Open AR',
  },
  {
    area: 'Purchasing',
    issue: 'PO 501 exceeds reviewer limit',
    value: '$44,960',
    age: '5 hours',
    owner: 'Procurement Lead',
    tone: 'pending' as const,
    action: 'Approve',
  },
  {
    area: 'Inventory',
    issue: 'Ceftriaxone below reorder at Central Store',
    value: '320 vials',
    age: 'Today',
    owner: 'Stores',
    tone: 'info' as const,
    action: 'Reorder',
  },
  {
    area: 'Payables',
    issue: 'GRN suspense needs invoice match',
    value: '$28,540',
    age: '2 days',
    owner: 'Accounts Payable',
    tone: 'warning' as const,
    action: 'Match',
  },
];

const aiControlBrief = [
  {
    title: 'Defer non-critical payment batch',
    detail: 'Preserves $31k cash until receivables follow-up clears.',
    confidence: 'High confidence',
    approval: 'CFO review',
    icon: Banknote,
    tone: 'warning' as const,
  },
  {
    title: 'Escalate supplier PO approval',
    detail: 'Medical consumables are blocking replenishment for two locations.',
    confidence: 'High confidence',
    approval: 'Procurement director',
    icon: ShieldCheck,
    tone: 'pending' as const,
  },
  {
    title: 'Create transfer before purchase',
    detail: 'Theatre Store has surplus of two low-stock central-store items.',
    confidence: 'Medium confidence',
    approval: 'Stores manager',
    icon: PackageCheck,
    tone: 'info' as const,
  },
];

const modulePulse = [
  { module: 'Sales', owner: 'Revenue desk', posted: '$528,976', open: 128, risk: 12, tone: 'success' as const },
  { module: 'Inventory', owner: 'Stores', posted: '$342,118', open: 84, risk: 18, tone: 'warning' as const },
  { module: 'Payables', owner: 'Finance AP', posted: '$142,823', open: 43, risk: 7, tone: 'danger' as const },
  { module: 'GL close', owner: 'Controller', posted: '92%', open: 6, risk: 2, tone: 'info' as const },
];

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

function IconButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function StatusBadge({ tone, children }: { tone: RiskTone; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses(tone)}`}>
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
    <article className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="akiva-financial-value mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${toneClasses(tone)}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm leading-5 text-akiva-text-muted">{detail}</p>
        <StatusBadge tone={tone}>{status}</StatusBadge>
      </div>
    </article>
  );
}

function RiskCommandStrip() {
  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
      <div className="grid gap-4 xl:grid-cols-[220px_1fr] xl:items-center">
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/35">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-800 dark:text-red-100">Operational risk index</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="akiva-financial-value text-4xl font-semibold text-red-800 dark:text-red-100">{operationalRisk.score}</span>
            <span className="pb-1 text-sm font-semibold text-red-700 dark:text-red-200">/100</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-red-800 dark:text-red-100">{operationalRisk.label}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Financial exposure</p>
            <p className="akiva-financial-value mt-2 text-lg font-semibold text-akiva-text">{operationalRisk.financialExposure}</p>
          </div>
          <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Blocked documents</p>
            <p className="akiva-financial-value mt-2 text-lg font-semibold text-akiva-text">{operationalRisk.blockedDocuments}</p>
          </div>
          <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Critical exceptions</p>
            <p className="akiva-financial-value mt-2 text-lg font-semibold text-akiva-text">{operationalRisk.criticalCount}</p>
          </div>
          <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Pending approvals</p>
            <p className="akiva-financial-value mt-2 text-lg font-semibold text-akiva-text">{operationalRisk.pendingApprovals}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {riskControls.map((control) => (
          <div key={control.label} className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{control.label}</span>
              <span className="mt-1 block text-xs text-akiva-text-muted">Limit {control.value}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-akiva-text">
              <span className={`akiva-status-dot ${dotClass(control.tone)}`} />
              {control.current}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Panel({ title, detail, icon: Icon, children }: { title: string; detail?: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
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

function WorkflowStage({ item }: { item: (typeof operatingFlow)[number] }) {
  const Icon = item.icon;
  const ratio = Math.min(100, Math.round((item.count / item.target) * 100));

  return (
    <button type="button" className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClasses(item.tone)}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-akiva-text">{item.label}</span>
            <span className="mt-1 block text-xs text-akiva-text-muted">{compactCurrency.format(item.value)} value waiting</span>
          </span>
        </span>
        <span className="akiva-financial-value text-lg font-semibold text-akiva-text">{item.count}</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-akiva-surface-muted">
        <div className={`h-2 rounded-full ${dotClass(item.tone)}`} style={{ width: `${ratio}%` }} />
      </div>
    </button>
  );
}

function ExceptionRow({ row }: { row: (typeof exceptionQueue)[number] }) {
  return (
    <button type="button" className="w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={row.tone}>{row.area}</StatusBadge>
            <span className="text-xs font-semibold text-akiva-text-muted">{row.owner}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-akiva-text">{row.issue}</p>
          <p className="mt-1 text-xs text-akiva-text-muted">Age: {row.age}</p>
        </div>
        <div className="flex items-center justify-between gap-3 md:block md:text-right">
          <p className="akiva-financial-value text-sm font-semibold text-akiva-text">{row.value}</p>
          <span className="mt-0 inline-flex items-center gap-1 text-xs font-semibold text-akiva-accent-text md:mt-2">
            {row.action}
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

export function Dashboard() {
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
                    Entice Tech Ltd
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <CalendarDays className="h-4 w-4 text-akiva-accent-text" />
                    17 May 2026
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-[1.875rem] lg:text-[2.25rem]">
                  ERP Command Center
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Finance risk, purchase throughput, inventory exposure, and close readiness prioritized for daily operational decisions.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <IconButton icon={RefreshCw} label="Refresh dashboard" />
                <IconButton icon={FileSearch} label="Open audit trail" />
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-akiva-accent px-4 text-sm font-semibold text-white shadow-sm shadow-rose-900/20 transition hover:bg-akiva-accent-strong"
                >
                  <Sparkles className="h-4 w-4" />
                  Review Risks
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

              <RiskCommandStrip />

              <Panel title="Cash, Receivables, And Payables" detail="Month-end liquidity view with collectable exposure and upcoming payment pressure." icon={ReceiptText}>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashTrend} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--akiva-chart-muted)' }} />
                      <YAxis tickFormatter={(value: number) => compactCurrency.format(value)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }} width={58} />
                      <Tooltip
                        formatter={(value: number) => currency.format(value)}
                        contentStyle={chartTooltipContentStyle}
                        labelStyle={chartTooltipTextStyle}
                        itemStyle={chartTooltipTextStyle}
                      />
                      <Area type="monotone" dataKey="receivables" name="Receivables" stroke="var(--akiva-chart-warning)" strokeWidth={2} fill="rgba(180, 83, 9, 0.12)" />
                      <Area type="monotone" dataKey="payables" name="Payables" stroke="var(--akiva-chart-danger)" strokeWidth={2} fill="rgba(190, 18, 60, 0.1)" />
                      <Line type="monotone" dataKey="cash" name="Cash" stroke="var(--akiva-chart-ink)" strokeWidth={3} dot={false} />
                      <ReferenceLine y={120000} stroke="var(--akiva-chart-danger)" strokeDasharray="5 5" label={{ value: 'Cash floor', fill: 'var(--akiva-chart-danger)', fontSize: 11 }} />
                      <ReferenceLine y={160000} stroke="var(--akiva-chart-warning)" strokeDasharray="4 6" label={{ value: 'AR review', fill: 'var(--akiva-chart-warning)', fontSize: 11 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
                    Cash floor protected by $94.9k
                  </div>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 font-semibold text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100">
                    Receivables crossed review benchmark
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
                    Drilldown ready for AR and AP ledgers
                  </div>
                </div>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
                <Panel title="Workflow Bottlenecks" detail="Queues that slow purchasing, receiving, bill matching, and payments." icon={Clock3}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {operatingFlow.map((item) => (
                      <WorkflowStage key={item.label} item={item} />
                    ))}
                  </div>
                </Panel>

                <Panel title="Supplier Exposure" detail="Open commitment concentration by supplier." icon={ShoppingCart}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={supplierExposure} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 4 }}>
                        <CartesianGrid horizontal={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
                        <XAxis type="number" tickFormatter={(value: number) => compactCurrency.format(value)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }} />
                        <YAxis type="category" dataKey="supplier" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }} />
                        <Tooltip
                          formatter={(value: number) => currency.format(value)}
                          contentStyle={chartTooltipContentStyle}
                          labelStyle={chartTooltipTextStyle}
                          itemStyle={chartTooltipTextStyle}
                        />
                        <Bar dataKey="value" name="Open commitment" radius={[0, 8, 8, 0]} barSize={22}>
                          {supplierExposure.map((row) => (
                            <Cell key={row.supplier} fill={row.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
                      {modulePulse.map((row) => (
                        <tr key={row.module} className="hover:bg-akiva-table-row-hover">
                          <td className="px-3 py-3">
                            <span className="flex items-center gap-2 font-semibold text-akiva-text">
                              <span className={`akiva-status-dot ${dotClass(row.tone)}`} />
                              {row.module}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-akiva-text-muted">{row.owner}</td>
                          <td className="akiva-financial-value px-3 py-3 text-right font-semibold text-akiva-text">{row.posted}</td>
                          <td className="akiva-financial-value px-3 py-3 text-right text-akiva-text">{row.open}</td>
                          <td className="akiva-financial-value px-3 py-3 text-right font-semibold text-akiva-text">{row.risk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </main>

            <aside className="space-y-4 lg:col-span-4">
              <Panel title="Exception Queue" detail="Highest operational risks to clear first." icon={AlertTriangle}>
                <div className="space-y-2">
                  {exceptionQueue.map((row) => (
                    <ExceptionRow key={row.issue} row={row} />
                  ))}
                </div>
              </Panel>

              <Panel title="AI Control Brief" detail="Recommended actions ranked by financial and workflow impact." icon={Sparkles}>
                <div className="space-y-2">
                  {aiControlBrief.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.title} type="button" className="w-full rounded-lg border border-akiva-border bg-akiva-surface p-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
                        <div className="flex gap-3">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${toneClasses(item.tone)}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-akiva-text">{item.title}</span>
                            <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{item.detail}</span>
                            <span className="mt-2 flex flex-wrap gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${toneClasses(item.tone)}`}>{item.confidence}</span>
                              <span className="rounded-full border border-akiva-border bg-akiva-surface-raised px-2 py-0.5 text-[11px] font-semibold text-akiva-text-muted">{item.approval}</span>
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Close Readiness" detail="Period close controls that need attention before management review." icon={FileCheck2}>
                <div className="space-y-3">
                  {[
                    { label: 'Bank reconciliation', value: '4/4', tone: 'success' as const },
                    { label: 'Inventory valuation review', value: '2 open', tone: 'warning' as const },
                    { label: 'GL suspense clearing', value: '$7.8k', tone: 'danger' as const },
                    { label: 'Access review', value: '4 users', tone: 'info' as const },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-akiva-text">
                        <span className={`akiva-status-dot ${dotClass(item.tone)}`} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="akiva-financial-value text-sm font-semibold text-akiva-text">{item.value}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
