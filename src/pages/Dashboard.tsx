import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  FileBarChart2,
  Filter,
  Landmark,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';

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
  borderRadius: '12px',
  color: 'var(--akiva-chart-tooltip-text)',
  boxShadow: '0 18px 38px rgba(0, 0, 0, 0.22)',
};

const chartTooltipTextStyle = {
  color: 'var(--akiva-chart-tooltip-text)',
  fontWeight: 600,
};

const summaryMetrics = [
  {
    label: 'Net sales',
    value: '$528,976',
    detail: '276 posted invoices',
    change: '+7.9%',
    trend: 'up',
    icon: ReceiptText,
  },
  {
    label: 'Cash position',
    value: '$214,870',
    detail: '4 bank accounts',
    change: '+3.4%',
    trend: 'up',
    icon: Landmark,
  },
  {
    label: 'Receivables',
    value: '$156,841',
    detail: '$38.2k overdue',
    change: '-4.1%',
    trend: 'down',
    icon: WalletCards,
  },
  {
    label: 'Inventory value',
    value: '$342,118',
    detail: '18 low-stock items',
    change: '+2.6%',
    trend: 'up',
    icon: Boxes,
  },
];

const kpiTiles = [
  { label: 'Open sales orders', value: '128', subvalue: '+12 today', tone: 'dark' },
  { label: 'Purchase orders', value: '42', subvalue: '9 awaiting GRN', tone: 'light' },
  { label: 'Payables due', value: '$84k', subvalue: 'next 14 days', tone: 'rose' },
  { label: 'Fulfilment', value: '91%', subvalue: '+4.8%', tone: 'light' },
];

const revenueTrend = [
  { month: 'Jan', revenue: 318000, expenses: 242000, cash: 96000 },
  { month: 'Feb', revenue: 351000, expenses: 260000, cash: 106000 },
  { month: 'Mar', revenue: 336000, expenses: 248000, cash: 99000 },
  { month: 'Apr', revenue: 389000, expenses: 284000, cash: 119000 },
  { month: 'May', revenue: 411000, expenses: 302000, cash: 132000 },
  { month: 'Jun', revenue: 452000, expenses: 319000, cash: 151000 },
  { month: 'Jul', revenue: 438000, expenses: 312000, cash: 146000 },
  { month: 'Aug', revenue: 501000, expenses: 356000, cash: 176000 },
  { month: 'Sep', revenue: 528976, expenses: 369000, cash: 214870 },
];

const stockFlow = [
  { item: 'Raw', onHand: 72, committed: 38 },
  { item: 'WIP', onHand: 46, committed: 28 },
  { item: 'FG', onHand: 89, committed: 51 },
  { item: 'Spare', onHand: 34, committed: 18 },
  { item: 'Transit', onHand: 57, committed: 42 },
];

const moduleHealth = [
  {
    module: 'Sales orders',
    owner: 'Amina K.',
    value: '$209,633',
    status: 'On track',
    first: 41,
    second: 118,
    score: '0.84',
    rate: '31%',
    badge: 12,
    closing: 29,
    tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  {
    module: 'Receivables',
    owner: 'Finance',
    value: '$156,841',
    status: 'Watch',
    first: 54,
    second: 103,
    score: '0.89',
    rate: '39%',
    badge: 21,
    closing: 33,
    tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  },
  {
    module: 'Inventory',
    owner: 'Stores',
    value: '$117,115',
    status: 'Stable',
    first: 22,
    second: 84,
    score: '0.79',
    rate: '32%',
    badge: 7,
    closing: 15,
    tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  },
];

const operatingAreas = [
  { label: 'Customer invoices', value: '$227,459', percentage: '43%', icon: ReceiptText },
  { label: 'Supplier bills', value: '$142,823', percentage: '27%', icon: CreditCard },
  { label: 'Stock movements', value: '$89,935', percentage: '17%', icon: PackageCheck },
  { label: 'Bank transfers', value: '$37,028', percentage: '7%', icon: Banknote },
];

const workQueue = [
  { label: 'Invoices pending approval', count: 18, icon: ReceiptText },
  { label: 'Purchase orders awaiting GRN', count: 9, icon: ShoppingCart },
  { label: 'Stock items below reorder', count: 18, icon: Boxes },
  { label: 'Users requiring access review', count: 4, icon: ShieldCheck },
];

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  change: string;
  trend: string;
  icon: LucideIcon;
}

function MetricCard({ label, value, detail, change, trend, icon: Icon }: MetricCardProps) {
  const positive = trend === 'up';
  return (
    <article className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/70 dark:shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">{detail}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
            positive
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
          }`}
        >
          {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {change}
        </span>
      </div>
    </article>
  );
}

function KpiTile({ label, value, subvalue, tone }: { label: string; value: string; subvalue: string; tone: string }) {
  const classes =
    tone === 'dark'
      ? 'bg-slate-950 text-white dark:bg-[#fff7fb] dark:text-[#140a0f]'
      : tone === 'rose'
        ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-[#8f3d5d] dark:bg-[#351320] dark:text-[#ffd8e5]'
        : 'border-slate-200 bg-white/80 text-slate-900 dark:border-slate-700 dark:bg-slate-900/70 dark:text-white';

  return (
    <article className={`rounded-lg border p-4 shadow-sm shadow-slate-200/50 dark:shadow-black/20 ${classes}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-85">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-sm opacity-85">{subvalue}</p>
    </article>
  );
}

function SmallIconButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-700 shadow-sm shadow-slate-200/50 transition hover:bg-white hover:text-slate-950 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800 dark:hover:text-white"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function Dashboard() {
  return (
    <div className="min-h-full bg-[#f2eeee] px-3 py-3 text-slate-950 transition-colors dark:bg-slate-950 dark:text-white sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-slate-200/70 px-4 py-4 dark:border-slate-800 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
                  <Building2 className="h-3.5 w-3.5" />
                  Entice Tech Ltd
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Sep 1 - Nov 30, 2023
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-[1.875rem] lg:text-[2.625rem]">
                ERP overview
              </h1>
            </div>
            <div className="flex items-center gap-2 self-start lg:self-center">
              <SmallIconButton icon={SlidersHorizontal} label="View controls" />
              <SmallIconButton icon={Download} label="Export dashboard" />
              <SmallIconButton icon={Filter} label="Filter dashboard" />
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
            <div className="space-y-4 lg:col-span-8">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {summaryMetrics.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
              </div>

              <section className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/50 sm:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Operating margin</p>
	                    <div className="mt-2 flex flex-wrap items-baseline gap-3">
	                      <span className="text-3xl font-medium tracking-normal text-slate-900 dark:text-slate-100 sm:text-4xl">$159,976</span>
	                      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-sm font-semibold text-rose-700 ring-1 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/60">30.2%</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Revenue {currency.format(528976)} vs expenses {currency.format(369000)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:min-w-[420px]">
                    {kpiTiles.map((tile) => (
                      <KpiTile key={tile.label} {...tile} />
                    ))}
                  </div>
                </div>

                <div className="mt-5 h-72 sm:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrend} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                      <defs>
                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--akiva-chart-brand)" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="var(--akiva-chart-brand)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--akiva-chart-ink)" stopOpacity={0.12} />
                          <stop offset="95%" stopColor="var(--akiva-chart-ink)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--akiva-chart-muted)' }} />
                      <YAxis hide domain={['dataMin - 20000', 'dataMax + 20000']} />
                      <Tooltip
                        formatter={(value: number) => compactCurrency.format(value)}
                        contentStyle={chartTooltipContentStyle}
                        labelStyle={chartTooltipTextStyle}
                        itemStyle={chartTooltipTextStyle}
                      />
                      <Area type="monotone" dataKey="expenses" stroke="var(--akiva-chart-muted)" strokeWidth={2} fill="url(#expenseFill)" />
                      <Area type="monotone" dataKey="revenue" stroke="var(--akiva-chart-brand)" strokeWidth={3} fill="url(#revenueFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-black/20">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Activity by module</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Posted value this period</p>
                    </div>
                    <button className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Revenue
                    </button>
                  </div>
                  <div className="space-y-3">
                    {operatingAreas.map((area) => {
                      const Icon = area.icon;
                      return (
                        <div key={area.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-950/60">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-rose-600 shadow-sm dark:bg-slate-900 dark:text-rose-300">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{area.label}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-slate-950 dark:text-white">{area.value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{area.percentage}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200/80 bg-white/78 p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-black/20">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">Inventory flow</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">On hand vs committed stock</p>
                    </div>
                    <FileBarChart2 className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stockFlow} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
                        <XAxis dataKey="item" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--akiva-chart-muted)' }} />
                        <YAxis hide />
                        <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipTextStyle} itemStyle={chartTooltipTextStyle} />
                        <Bar dataKey="onHand" fill="var(--akiva-chart-ink)" radius={[8, 8, 8, 8]} />
                        <Bar dataKey="committed" fill="var(--akiva-chart-brand)" radius={[8, 8, 8, 8]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </div>
            </div>

            <aside className="space-y-4 lg:col-span-4">
              <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/76 dark:shadow-black/20">
                <div className="grid grid-cols-[1.3fr_1fr_.7fr_.6fr_.7fr] gap-3 px-2 pb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span>Module</span>
                  <span>Value</span>
                  <span>Open</span>
                  <span>KPI</span>
                  <span>W/L</span>
                </div>
                <div className="space-y-2">
                  {moduleHealth.map((row, index) => (
                    <div
                      key={row.module}
                      className={`rounded-xl px-3 py-3 ${
                        index === 1
                          ? 'bg-rose-50/80 ring-1 ring-rose-100 dark:bg-rose-950/30 dark:ring-rose-900/50'
                          : 'bg-slate-50/80 dark:bg-slate-950/50'
                      }`}
                    >
                      <div className="grid grid-cols-[1.3fr_1fr_.7fr_.6fr_.7fr] items-center gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-white">{row.module}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{row.owner}</p>
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-white">{row.value}</span>
                        <span className="flex gap-1">
                          <b className="rounded-full bg-slate-950 px-2 py-1 text-xs text-white dark:bg-white dark:text-slate-950">{row.first}</b>
                          <b className="rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">{row.second}</b>
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{row.score}</span>
                        <span className="flex items-center gap-1">
                          <b className="rounded-full bg-slate-950 px-2 py-1 text-xs text-white dark:bg-white dark:text-slate-950">{row.badge}</b>
                          <span className="text-slate-700 dark:text-slate-300">{row.closing}</span>
                        </span>
                      </div>
                      {index === 1 && (
                        <div className="mt-4">
                          <div className="mb-3 flex flex-wrap gap-2">
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">Overdue review</span>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">Credit control</span>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">Cash follow-up</span>
                          </div>
                          <div className="rounded-xl bg-white p-4 dark:bg-slate-900">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">Aged receivables</p>
                              <span className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white">$38.2k</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                              <div className="rounded-lg bg-rose-50 p-3 dark:bg-rose-950/30">
                                <p className="text-slate-500 dark:text-slate-400">31-60 days</p>
                                <p className="mt-1 font-semibold text-slate-950 dark:text-white">$22,114</p>
                              </div>
                              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
                                <p className="text-slate-500 dark:text-slate-400">60+ days</p>
                                <p className="mt-1 font-semibold text-slate-950 dark:text-white">$16,086</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

	              <section className="rounded-2xl border border-slate-200/80 bg-rose-50/80 p-4 shadow-sm shadow-rose-100/60 dark:border-[#6e344c] dark:bg-[#211018] dark:shadow-black/30">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Cash movement</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Inflow, outflow, and bank balance</p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-rose-600 dark:text-rose-300" />
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueTrend} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
                      <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--akiva-chart-muted)' }} />
                      <YAxis hide />
                      <Tooltip
                        formatter={(value: number) => compactCurrency.format(value)}
                        contentStyle={chartTooltipContentStyle}
                        labelStyle={chartTooltipTextStyle}
                        itemStyle={chartTooltipTextStyle}
                      />
                      <Line type="monotone" dataKey="cash" stroke="var(--akiva-chart-brand)" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="expenses" stroke="var(--akiva-chart-muted)" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/76 dark:shadow-black/20">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Work queue</p>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Today</span>
                </div>
                <div className="space-y-2">
                  {workQueue.map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-950/50">
                        <div className="flex min-w-0 items-center gap-3">
                          <Icon className="h-4 w-4 flex-none text-rose-600 dark:text-rose-300" />
                          <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
                        </div>
                        <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
                          {item.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
                  <CheckCircle2 className="h-4 w-4" />
                  92% period-close checklist complete
                  <Clock3 className="ml-auto h-4 w-4 opacity-70" />
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
