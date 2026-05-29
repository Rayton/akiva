import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  BadgeDollarSign,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gauge,
  Layers3,
  Loader2,
  Mail,
  Phone,
  Play,
  Plus,
  ReceiptText,
  RefreshCw,
  Repeat,
  Search,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Users,
  Workflow,
  XCircle,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

interface SupplierRow {
  id: number | string;
  supplier_code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  currency_code?: string | null;
  payment_term_code?: string | null;
  credit_limit?: number | string | null;
  active?: boolean | number;
  source?: string;
}

interface BillRow {
  id: number | string;
  bill_number?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  subtotal?: number | string | null;
  tax_total?: number | string | null;
  total?: number | string | null;
  amount_paid?: number | string | null;
  amount_due?: number | string | null;
  memo?: string | null;
  matching_status?: string | null;
  matching_blocked?: boolean;
  latest_match_status?: string | null;
  latest_match_type?: string | null;
  variance_amount?: number | string | null;
  variance_qty?: number | string | null;
  supplier?: {
    name?: string | null;
    supplier_code?: string | null;
    currency_code?: string | null;
  } | null;
  source?: string;
}

interface AgingRow {
  bucket: string;
  amount: number;
}

interface ApprovalRow {
  id: number;
  bill_id?: number | null;
  bill_number?: string | null;
  supplier?: SupplierSummary | null;
  policy_name?: string | null;
  current_step?: number;
  status?: string | null;
  submitted_at?: string | null;
  escalated_at?: string | null;
  total?: number | string | null;
  amount_due?: number | string | null;
}

interface PaymentBatchRow {
  id: number;
  batch_number: string;
  status: string;
  scheduled_date?: string | null;
  approved_at?: string | null;
  approved_by_user_id?: string | null;
  executed_at?: string | null;
  total_amount: number;
  line_count: number;
}

interface ExceptionRow {
  id: number;
  bill_id?: number | null;
  bill_number?: string | null;
  supplier?: SupplierSummary | null;
  type: string;
  status: string;
  severity: string;
  message: string;
  assigned_to_user_id?: string | null;
  due_at?: string | null;
  resolved_at?: string | null;
}

interface CreditNoteRow {
  id: number;
  credit_number: string;
  credit_date?: string | null;
  amount_total: number;
  amount_available: number;
  status: string;
  dispute_status?: string | null;
  supplier?: SupplierSummary | null;
}

interface RecurringTemplateRow {
  id: number;
  template_name: string;
  frequency: string;
  interval_value: number;
  next_run_date?: string | null;
  default_amount: number;
  requires_approval: boolean;
  active: boolean;
  supplier?: SupplierSummary | null;
}

interface SupplierStatementRow {
  id: number;
  statement_date?: string | null;
  closing_balance: number;
  status: string;
  supplier?: SupplierSummary | null;
}

interface ForecastRow {
  date?: string | null;
  due_date?: string | null;
  amount?: number | string | null;
  amount_due?: number | string | null;
  supplier?: string | SupplierSummary | null;
  supplier_name?: string | null;
  bill_number?: string | null;
}

interface TrendRow {
  month?: string | null;
  bucket?: string | null;
  overdue_amount?: number | string | null;
  amount?: number | string | null;
  bills?: number | string | null;
  count?: number | string | null;
}

interface SupplierSummary {
  name?: string | null;
  supplier_code?: string | null;
  currency_code?: string | null;
}

interface ApiPayload {
  suppliers: SupplierRow[];
  summary: {
    totalPayables: number;
    activeSuppliers: number;
    overdueBills: number;
    dueThisWeek: number;
  };
  upcoming?: BillRow[];
  nativeBills?: BillRow[];
  matchingQueue?: BillRow[];
  approvalQueue?: ApprovalRow[];
  paymentBatches?: PaymentBatchRow[];
  exceptions?: ExceptionRow[];
  creditNotes?: CreditNoteRow[];
  recurringTemplates?: RecurringTemplateRow[];
  supplierStatements?: SupplierStatementRow[];
  governance?: {
    nativeSupplierCount: number;
    nativeOpenBills: number;
    approvalQueue: number;
    matchingQueue: number;
    paymentBatches: number;
    exceptionQueue: number;
    creditNotes: number;
    recurringTemplates: number;
    supplierStatements: number;
  };
}

interface AccountsPayableProps {
  sourceSlug?: string;
  sourceCaption?: string;
}

type PayablesView =
  | 'overview'
  | 'suppliers'
  | 'bills'
  | 'aging'
  | 'approvals'
  | 'matching'
  | 'payments'
  | 'credits'
  | 'recurring'
  | 'statements'
  | 'exceptions'
  | 'forecasting'
  | 'prior-balances'
  | 'factor-companies';

const inputClassName =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm transition placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const currencyOptions = [
  { value: 'USD', label: 'USD' },
  { value: 'TZS', label: 'TZS' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
  { value: 'KES', label: 'KES' },
];

const payablesNavigation: Array<{ view: PayablesView; label: string; path: string; icon: typeof ReceiptText }> = [
  { view: 'overview', label: 'Overview', path: '/payables', icon: Gauge },
  { view: 'suppliers', label: 'Suppliers', path: '/payables/suppliers', icon: Users },
  { view: 'bills', label: 'Bills', path: '/payables/bills', icon: ReceiptText },
  { view: 'aging', label: 'Aging', path: '/payables/aging', icon: CalendarClock },
  { view: 'approvals', label: 'Approvals', path: '/payables/approvals', icon: ClipboardCheck },
  { view: 'matching', label: 'Matching', path: '/payables/matching', icon: Workflow },
  { view: 'payments', label: 'Payments', path: '/payables/payments', icon: CreditCard },
  { view: 'credits', label: 'Credits', path: '/payables/credits', icon: BadgeDollarSign },
  { view: 'recurring', label: 'Recurring', path: '/payables/recurring', icon: Repeat },
  { view: 'statements', label: 'Statements', path: '/payables/statements', icon: FileText },
  { view: 'exceptions', label: 'Exceptions', path: '/payables/exceptions', icon: AlertTriangle },
  { view: 'forecasting', label: 'Forecast', path: '/payables/forecasting', icon: Layers3 },
];

const viewCopy: Record<PayablesView, { title: string; description: string; searchPlaceholder: string }> = {
  overview: {
    title: 'Accounts Payable',
    description: 'Supplier ledger controls for bills, approvals, matching, payment runs, credits, and exceptions.',
    searchPlaceholder: 'Search suppliers, bills, or workflow status...',
  },
  suppliers: {
    title: 'Supplier Accounts',
    description: 'Supplier master records and payable readiness for invoice processing.',
    searchPlaceholder: 'Search supplier name, code, email, or terms...',
  },
  bills: {
    title: 'Supplier Bills',
    description: 'Open supplier invoices, legacy payable items, and native AP bill workflow status.',
    searchPlaceholder: 'Search bill, supplier, amount, or status...',
  },
  aging: {
    title: 'Aged Suppliers',
    description: 'Outstanding supplier balances grouped by due-age bucket.',
    searchPlaceholder: 'Search aging buckets...',
  },
  approvals: {
    title: 'Approval Queue',
    description: 'Submitted bills waiting for approval governance, escalation, or completion.',
    searchPlaceholder: 'Search policy, supplier, bill, or status...',
  },
  matching: {
    title: 'Invoice Matching',
    description: 'Two-way and three-way match status, variances, and blocked supplier bills.',
    searchPlaceholder: 'Search bill, supplier, match status, or variance...',
  },
  payments: {
    title: 'Payment Batches',
    description: 'Supplier payment batches from draft selection through approval and execution.',
    searchPlaceholder: 'Search batch number, status, or approver...',
  },
  credits: {
    title: 'Credit Notes',
    description: 'Supplier credit notes, available balances, allocations, and dispute status.',
    searchPlaceholder: 'Search credit number, supplier, or status...',
  },
  recurring: {
    title: 'Recurring Bills',
    description: 'Scheduled supplier bill templates and next-run controls.',
    searchPlaceholder: 'Search template, supplier, frequency, or status...',
  },
  statements: {
    title: 'Supplier Statements',
    description: 'Imported supplier statements and reconciliation status.',
    searchPlaceholder: 'Search supplier, statement date, or status...',
  },
  exceptions: {
    title: 'Exception Queue',
    description: 'Duplicate checks, matching exceptions, credit disputes, and payable workflow blockers.',
    searchPlaceholder: 'Search exception type, bill, supplier, or owner...',
  },
  forecasting: {
    title: 'Cash Forecast',
    description: 'Supplier cash requirements and overdue trend signals for payment planning.',
    searchPlaceholder: 'Search forecast rows...',
  },
  'prior-balances': {
    title: 'Supplier Balances',
    description: 'Supplier balances and credit terms for period-end review.',
    searchPlaceholder: 'Search supplier name or code...',
  },
  'factor-companies': {
    title: 'Factor Companies',
    description: 'Supplier financing references shown from supplier master data.',
    searchPlaceholder: 'Search supplier or factor reference...',
  },
};

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolvePayablesView(sourceSlug = '', sourceCaption = ''): PayablesView {
  const key = normalizedKey(`${sourceSlug} ${sourceCaption}`);

  if (key.includes('approval')) return 'approvals';
  if (key.includes('matching') || key.includes('match')) return 'matching';
  if (key.includes('paymentbatch') || key.includes('payments') || key.includes('supppaymentrun') || key.includes('paymentrun')) return 'payments';
  if (key.includes('creditnote') || key.includes('credits')) return 'credits';
  if (key.includes('recurring')) return 'recurring';
  if (key.includes('statement')) return 'statements';
  if (key.includes('exception') || key.includes('duplicate')) return 'exceptions';
  if (key.includes('forecast') || key.includes('overduetrend')) return 'forecasting';
  if (key.includes('agedsuppliers') || key.includes('agedsupplier') || key.includes('aging')) return 'aging';
  if (key.includes('supplierallocations') || key.includes('pdfremittanceadvice') || key.includes('remittance') || key.includes('outstandinggrn') || key.includes('pdfsupptranslisting') || key.includes('supplierdailytransactions') || key.includes('bills')) return 'bills';
  if (key.includes('supplierbalsatperiodend') || key.includes('priorsupplierbalances') || key.includes('priorbalances')) return 'prior-balances';
  if (key.includes('factorcompanies') || key.includes('factors')) return 'factor-companies';
  if (key.includes('addsupplier') || key.includes('selectsupplier') || key.includes('supplierselect') || key.includes('suppliermaintenance') || key.includes('suppliers')) return 'suppliers';

  return 'overview';
}

function asNumber(value: number | string | null | undefined): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMoney(value: number | string | null | undefined, currency = 'USD'): string {
  return `${currency} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber(value))}`;
}

function formatDate(value?: string | null): string {
  if (!value || value.startsWith('0000')) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatStatus(value?: string | null): string {
  if (!value) return 'Open';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function supplierLabel(supplier?: SupplierSummary | null): string {
  if (!supplier) return '-';
  return [supplier.name, supplier.supplier_code ? `(${supplier.supplier_code})` : ''].filter(Boolean).join(' ');
}

function statusClass(value?: string | null): string {
  const key = normalizedKey(value ?? '');
  if (key.includes('paid') || key.includes('approved') || key.includes('matched') || key.includes('resolved') || key.includes('active') || key.includes('executed')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  }
  if (key.includes('reject') || key.includes('blocked') || key.includes('duplicate') || key.includes('dispute') || key.includes('exception') || key.includes('overdue')) {
    return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200';
  }
  if (key.includes('pending') || key.includes('draft') || key.includes('submitted') || key.includes('selected')) {
    return 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-200';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200';
}

function StatusPill({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(value)}`}>
      {formatStatus(value)}
    </span>
  );
}

type PayablesTone = 'danger' | 'warning' | 'pending' | 'success' | 'info' | 'neutral';

interface PayablesAction {
  id: string;
  priority: number;
  title: string;
  detail: string;
  tone: PayablesTone;
  valueLabel: string;
  actionLabel: string;
  path: string;
  icon: typeof ReceiptText;
}

function payablesToneDot(tone: PayablesTone): string {
  if (tone === 'danger') return 'bg-red-600 dark:bg-red-300';
  if (tone === 'warning') return 'bg-orange-600 dark:bg-orange-300';
  if (tone === 'pending') return 'bg-purple-600 dark:bg-purple-300';
  if (tone === 'success') return 'bg-emerald-600 dark:bg-emerald-300';
  if (tone === 'info') return 'bg-blue-600 dark:bg-blue-300';
  return 'bg-slate-500 dark:bg-slate-300';
}

function payablesToneClasses(tone: PayablesTone): string {
  if (tone === 'danger') return 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100';
  if (tone === 'warning') return 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100';
  if (tone === 'pending') return 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-100';
  if (tone === 'success') return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (tone === 'info') return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text';
}

function payablesToneTextClass(tone: PayablesTone): string {
  if (tone === 'danger') return 'text-red-700 dark:text-red-200';
  if (tone === 'warning') return 'text-orange-700 dark:text-orange-200';
  if (tone === 'pending') return 'text-purple-700 dark:text-purple-200';
  if (tone === 'success') return 'text-emerald-700 dark:text-emerald-200';
  if (tone === 'info') return 'text-blue-700 dark:text-blue-200';
  return 'text-akiva-text-muted';
}

function payablesSubtleToneClass(tone: PayablesTone): string {
  if (tone === 'danger') return 'border-red-300/80 bg-red-50/75 text-red-800 dark:border-red-800/80 dark:bg-red-950/30 dark:text-red-100';
  if (tone === 'warning') return 'border-orange-300/80 bg-orange-50/75 text-orange-800 dark:border-orange-800/80 dark:bg-orange-950/30 dark:text-orange-100';
  if (tone === 'pending') return 'border-purple-300/80 bg-purple-50/75 text-purple-800 dark:border-purple-800/80 dark:bg-purple-950/30 dark:text-purple-100';
  if (tone === 'success') return 'border-emerald-300/80 bg-emerald-50/75 text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/30 dark:text-emerald-100';
  if (tone === 'info') return 'border-blue-300/80 bg-blue-50/75 text-blue-800 dark:border-blue-800/80 dark:bg-blue-950/30 dark:text-blue-100';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text';
}

function PayablesPanel({
  title,
  detail,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  detail?: string;
  icon: typeof ReceiptText;
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

function PayablesMetricCard({
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
  icon: typeof ReceiptText;
  tone: PayablesTone;
}) {
  return (
    <article className="akiva-panel relative overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${payablesToneDot(tone)}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">{label}</p>
          <p className="akiva-financial-value mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-muted ${payablesToneTextClass(tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm leading-5 text-akiva-text-muted">{note}</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
          <span className={`akiva-status-dot ${payablesToneDot(tone)}`} />
          {status}
        </span>
      </div>
    </article>
  );
}

function PayablesActionRow({
  action,
  onOpen,
}: {
  action: PayablesAction;
  onOpen: (path: string) => void;
}) {
  const Icon = action.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(action.path)}
      className="relative w-full overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted"
    >
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${payablesToneDot(action.tone)}`} aria-hidden="true" />
      <div className="flex gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${payablesToneClasses(action.tone)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${payablesToneClasses(action.tone)}`}>P{action.priority}</span>
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

function PayablesAgingSnapshot({ rows }: { rows: AgingRow[] }) {
  const total = Math.max(rows.reduce((sum, row) => sum + row.amount, 0), 1);
  const colors = ['bg-emerald-600', 'bg-amber-500', 'bg-orange-600', 'bg-red-600', 'bg-slate-700'];

  if (rows.length === 0) {
    return <p className="text-sm text-akiva-text-muted">No aging data available.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={row.bucket} className="grid gap-2 text-xs sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center lg:grid-cols-1 xl:grid-cols-[104px_minmax(0,1fr)_auto]">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors[index % colors.length]}`} />
            <span className="font-semibold text-akiva-text-muted">{row.bucket}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-akiva-surface-muted">
            <div className={`h-full rounded-full ${colors[index % colors.length]}`} style={{ width: `${Math.max(3, Math.round((row.amount / total) * 100))}%` }} />
          </div>
          <span className="akiva-financial-value text-right text-sm font-semibold text-akiva-text">{formatMoney(row.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function isNativeRow(row: { id?: number | string; source?: string }): boolean {
  return row.source === 'accounts_payable' && typeof row.id === 'number';
}

async function readApiResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as { success?: boolean; message?: string; data?: T } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.message || fallback);
  }
  return payload.data as T;
}

async function postApi(path: string, body: Record<string, unknown> = {}) {
  const response = await apiFetch(buildApiUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  return readApiResponse<unknown>(response, 'Accounts payable action could not be completed.');
}

export function AccountsPayable({ sourceSlug = 'payables', sourceCaption = '' }: AccountsPayableProps) {
  const view = resolvePayablesView(sourceSlug, sourceCaption);
  const copy = viewCopy[view];
  const [searchTerm, setSearchTerm] = useState('');
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [agingRows, setAgingRows] = useState<AgingRow[]>([]);
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([]);
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    supplier_code: '',
    name: '',
    email: '',
    phone: '',
    currency_code: 'USD',
    payment_term_code: '',
    credit_limit: '0',
  });
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadPayables = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(buildApiUrl(`/api/payables${searchTerm ? `?q=${encodeURIComponent(searchTerm)}` : ''}`));
      const data = await readApiResponse<ApiPayload>(response, 'Accounts payable data could not be loaded.');
      setPayload(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Accounts payable data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    void loadPayables();
  }, [loadPayables]);

  useEffect(() => {
    let cancelled = false;

    const loadReports = async () => {
      if (!['overview', 'aging', 'forecasting'].includes(view)) return;

      try {
        const agingResponse = await apiFetch(buildApiUrl('/api/payables/reports/aging'));
        const agingData = await readApiResponse<Record<string, number>>(agingResponse, 'Aging report could not be loaded.');
        if (!cancelled) {
          setAgingRows([
            { bucket: 'Current', amount: asNumber(agingData.current) },
            { bucket: '1-30 Days', amount: asNumber(agingData.days_1_30) },
            { bucket: '31-60 Days', amount: asNumber(agingData.days_31_60) },
            { bucket: '61-90 Days', amount: asNumber(agingData.days_61_90) },
            { bucket: '91+ Days', amount: asNumber(agingData.days_91_plus) },
          ]);
        }
      } catch {
        if (!cancelled) setAgingRows([]);
      }

      if (view !== 'overview' && view !== 'forecasting') return;

      try {
        const [forecastResponse, trendResponse] = await Promise.all([
          apiFetch(buildApiUrl('/api/payables/reports/forecasting')),
          apiFetch(buildApiUrl('/api/payables/reports/overdue-trend')),
        ]);
        const forecastData = await readApiResponse<ForecastRow[]>(forecastResponse, 'Forecast report could not be loaded.');
        const trendData = await readApiResponse<TrendRow[]>(trendResponse, 'Overdue trend could not be loaded.');
        if (!cancelled) {
          setForecastRows(Array.isArray(forecastData) ? forecastData : []);
          setTrendRows(Array.isArray(trendData) ? trendData : []);
        }
      } catch {
        if (!cancelled) {
          setForecastRows([]);
          setTrendRows([]);
        }
      }
    };

    void loadReports();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const runAction = async (key: string, path: string, successMessage: string, body: Record<string, unknown> = {}) => {
    setActionBusy(key);
    setError('');
    setMessage('');
    try {
      await postApi(path, body);
      setMessage(successMessage);
      await loadPayables();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Accounts payable action could not be completed.');
    } finally {
      setActionBusy('');
    }
  };

  const submitSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionBusy('supplier-save');
    setError('');
    setMessage('');
    try {
      await postApi('/api/payables/suppliers', {
        ...supplierForm,
        credit_limit: asNumber(supplierForm.credit_limit),
      });
      setSupplierDialogOpen(false);
      setSupplierForm({
        supplier_code: '',
        name: '',
        email: '',
        phone: '',
        currency_code: 'USD',
        payment_term_code: '',
        credit_limit: '0',
      });
      setMessage('Supplier created.');
      await loadPayables();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Supplier could not be saved.');
    } finally {
      setActionBusy('');
    }
  };

  const deleteSupplier = async (supplier: SupplierRow) => {
    if (!isNativeRow(supplier)) return;
    const confirmed = await confirm({
      title: 'Delete supplier',
      description: 'This native AP supplier will be removed only if no payable records depend on it.',
      detail: supplier.name,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setActionBusy(`supplier-delete-${supplier.id}`);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(buildApiUrl(`/api/payables/suppliers/${supplier.id}`), {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
      });
      await readApiResponse<unknown>(response, 'Supplier could not be deleted.');
      setMessage('Supplier deleted.');
      await loadPayables();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Supplier could not be deleted.');
    } finally {
      setActionBusy('');
    }
  };

  const createPaymentBatch = async (selectedRows: BillRow[]) => {
    const billIds = selectedRows.filter(isNativeRow).map((bill) => Number(bill.id));
    if (billIds.length === 0) {
      setError('Select native AP bills before creating a payment batch. Legacy payable rows are read-only here.');
      return;
    }
    await runAction('batch-create', '/api/payables/payment-batches', 'Payment batch created.', { bill_ids: billIds });
  };

  const navigateToView = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event('akiva:navigation'));
  };

  const suppliers = payload?.suppliers ?? [];
  const summary = payload?.summary;
  const governance = payload?.governance;
  const billRows = useMemo(() => {
    const rows = [...(payload?.nativeBills ?? []), ...(payload?.upcoming ?? [])];
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = `${row.source ?? 'unknown'}-${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [payload?.nativeBills, payload?.upcoming]);

  const supplierColumns = useMemo<AdvancedTableColumn<SupplierRow>[]>(() => [
    {
      id: 'name',
      header: 'Supplier',
      accessor: (row) => `${row.name} ${row.supplier_code}`,
      cell: (row) => (
        <div>
          <p className="font-semibold text-akiva-text">{row.name}</p>
          <p className="text-xs text-akiva-text-muted">{row.supplier_code}</p>
        </div>
      ),
      width: 260,
      alwaysVisible: true,
    },
    {
      id: 'contact',
      header: 'Contact',
      accessor: (row) => `${row.email ?? ''} ${row.phone ?? ''}`,
      cell: (row) => (
        <div className="space-y-1 text-xs text-akiva-text-muted">
          <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{row.email || '-'}</span>
          <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{row.phone || '-'}</span>
        </div>
      ),
      width: 220,
    },
    { id: 'currency', header: 'Currency', accessor: (row) => row.currency_code ?? '-', width: 110 },
    { id: 'terms', header: 'Terms', accessor: (row) => row.payment_term_code ?? '-', width: 130 },
    {
      id: 'credit',
      header: 'Credit Limit',
      accessor: (row) => row.credit_limit ?? 0,
      cell: (row) => formatMoney(row.credit_limit ?? 0, row.currency_code ?? 'USD'),
      align: 'right',
      width: 150,
    },
    {
      id: 'source',
      header: 'Source',
      accessor: (row) => row.source ?? 'legacy',
      cell: (row) => <StatusPill value={row.source === 'accounts_payable' ? 'Native AP' : 'Legacy'} />,
      width: 130,
    },
    {
      id: 'actions',
      header: 'Action',
      accessor: () => '',
      sortable: false,
      filterable: false,
      sticky: 'right',
      width: 100,
      cell: (row) => (
        <button
          type="button"
          onClick={() => void deleteSupplier(row)}
          disabled={!isNativeRow(row) || actionBusy === `supplier-delete-${row.id}`}
          title={isNativeRow(row) ? 'Delete supplier' : 'Legacy supplier records are read-only here'}
          aria-label="Delete supplier"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actionBusy === `supplier-delete-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      ),
    },
  ], [actionBusy]);

  const billColumns = useMemo<AdvancedTableColumn<BillRow>[]>(() => [
    {
      id: 'supplier',
      header: 'Supplier',
      accessor: (row) => supplierLabel(row.supplier),
      cell: (row) => (
        <div>
          <p className="font-semibold text-akiva-text">{row.supplier?.name ?? '-'}</p>
          <p className="text-xs text-akiva-text-muted">{row.supplier?.supplier_code ?? ''}</p>
        </div>
      ),
      width: 250,
      alwaysVisible: true,
    },
    { id: 'bill', header: 'Bill #', accessor: (row) => row.bill_number ?? '-', width: 170 },
    { id: 'billDate', header: 'Bill Date', accessor: (row) => row.bill_date ?? '', cell: (row) => formatDate(row.bill_date), width: 130 },
    { id: 'dueDate', header: 'Due Date', accessor: (row) => row.due_date ?? '', cell: (row) => formatDate(row.due_date), width: 130 },
    { id: 'total', header: 'Total', accessor: (row) => row.total ?? 0, cell: (row) => formatMoney(row.total ?? 0, row.supplier?.currency_code ?? 'USD'), align: 'right', width: 150 },
    { id: 'amountDue', header: 'Amount Due', accessor: (row) => row.amount_due ?? 0, cell: (row) => formatMoney(row.amount_due ?? 0, row.supplier?.currency_code ?? 'USD'), align: 'right', width: 150 },
    { id: 'status', header: 'Status', accessor: (row) => row.status ?? 'open', cell: (row) => <StatusPill value={row.status} />, width: 140 },
    {
      id: 'matching',
      header: 'Matching',
      accessor: (row) => row.latest_match_status ?? row.matching_status ?? '',
      cell: (row) => <StatusPill value={row.matching_blocked ? 'blocked' : row.latest_match_status ?? row.matching_status ?? 'pending'} />,
      width: 140,
    },
    {
      id: 'source',
      header: 'Source',
      accessor: (row) => row.source ?? 'legacy',
      cell: (row) => <StatusPill value={row.source === 'accounts_payable' ? 'Native AP' : 'Legacy'} />,
      width: 130,
    },
    {
      id: 'actions',
      header: 'Action',
      accessor: () => '',
      sortable: false,
      filterable: false,
      sticky: 'right',
      width: 150,
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void runAction(`approval-${row.id}`, `/api/payables/bills/${row.id}/submit-approval`, 'Bill submitted for approval.')}
            disabled={!isNativeRow(row) || actionBusy === `approval-${row.id}`}
            title={isNativeRow(row) ? 'Submit approval' : 'Legacy bills are read-only here'}
            aria-label="Submit approval"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionBusy === `approval-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void runAction(`match-${row.id}`, `/api/payables/bills/${row.id}/match`, 'Invoice match saved.', { match_type: 'two_way', variance_qty: 0, variance_amount: 0 })}
            disabled={!isNativeRow(row) || actionBusy === `match-${row.id}`}
            title={isNativeRow(row) ? 'Mark matched' : 'Legacy bills are read-only here'}
            aria-label="Mark matched"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionBusy === `match-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ], [actionBusy]);

  const agingColumns = useMemo<AdvancedTableColumn<AgingRow>[]>(() => [
    { id: 'bucket', header: 'Aging Bucket', accessor: (row) => row.bucket, width: 220, alwaysVisible: true },
    { id: 'amount', header: 'Outstanding Amount', accessor: (row) => row.amount, cell: (row) => formatMoney(row.amount), align: 'right', width: 220 },
  ], []);

  const approvalColumns = useMemo<AdvancedTableColumn<ApprovalRow>[]>(() => [
    { id: 'bill', header: 'Bill #', accessor: (row) => row.bill_number ?? '-', width: 150, alwaysVisible: true },
    { id: 'supplier', header: 'Supplier', accessor: (row) => supplierLabel(row.supplier), width: 230 },
    { id: 'policy', header: 'Policy', accessor: (row) => row.policy_name ?? '-', width: 180 },
    { id: 'step', header: 'Step', accessor: (row) => row.current_step ?? 0, align: 'right', width: 90 },
    { id: 'amount', header: 'Amount Due', accessor: (row) => row.amount_due ?? 0, cell: (row) => formatMoney(row.amount_due ?? 0), align: 'right', width: 150 },
    { id: 'status', header: 'Status', accessor: (row) => row.status ?? '', cell: (row) => <StatusPill value={row.status} />, width: 140 },
    { id: 'submitted', header: 'Submitted', accessor: (row) => row.submitted_at ?? '', cell: (row) => formatDate(row.submitted_at), width: 140 },
    {
      id: 'actions',
      header: 'Action',
      accessor: () => '',
      sortable: false,
      filterable: false,
      sticky: 'right',
      width: 130,
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void runAction(`approve-${row.id}`, `/api/payables/approvals/${row.id}/actions`, 'Approval recorded.', { action: 'approve', actor_user_id: 'system' })}
            disabled={row.status !== 'pending' || actionBusy === `approve-${row.id}`}
            title="Approve"
            aria-label="Approve"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionBusy === `approve-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void runAction(`reject-${row.id}`, `/api/payables/approvals/${row.id}/actions`, 'Approval rejected.', { action: 'reject', actor_user_id: 'system' })}
            disabled={row.status !== 'pending' || actionBusy === `reject-${row.id}`}
            title="Reject"
            aria-label="Reject"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionBusy === `reject-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ], [actionBusy]);

  const paymentBatchColumns = useMemo<AdvancedTableColumn<PaymentBatchRow>[]>(() => [
    { id: 'batch', header: 'Batch #', accessor: (row) => row.batch_number, width: 180, alwaysVisible: true },
    { id: 'status', header: 'Status', accessor: (row) => row.status, cell: (row) => <StatusPill value={row.status} />, width: 130 },
    { id: 'scheduled', header: 'Scheduled', accessor: (row) => row.scheduled_date ?? '', cell: (row) => formatDate(row.scheduled_date), width: 130 },
    { id: 'lines', header: 'Bills', accessor: (row) => row.line_count, align: 'right', width: 100 },
    { id: 'amount', header: 'Total Amount', accessor: (row) => row.total_amount, cell: (row) => formatMoney(row.total_amount), align: 'right', width: 160 },
    { id: 'approved', header: 'Approved', accessor: (row) => row.approved_at ?? '', cell: (row) => formatDate(row.approved_at), width: 130 },
    { id: 'executed', header: 'Executed', accessor: (row) => row.executed_at ?? '', cell: (row) => formatDate(row.executed_at), width: 130 },
    {
      id: 'actions',
      header: 'Action',
      accessor: () => '',
      sortable: false,
      filterable: false,
      sticky: 'right',
      width: 130,
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void runAction(`batch-approve-${row.id}`, `/api/payables/payment-batches/${row.id}/approve`, 'Payment batch approved.', { actor_user_id: 'system' })}
            disabled={row.status !== 'draft' || actionBusy === `batch-approve-${row.id}`}
            title="Approve batch"
            aria-label="Approve batch"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionBusy === `batch-approve-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void runAction(`batch-execute-${row.id}`, `/api/payables/payment-batches/${row.id}/execute`, 'Payment batch executed.')}
            disabled={row.status !== 'approved' || actionBusy === `batch-execute-${row.id}`}
            title="Execute batch"
            aria-label="Execute batch"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actionBusy === `batch-execute-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ], [actionBusy]);

  const exceptionColumns = useMemo<AdvancedTableColumn<ExceptionRow>[]>(() => [
    { id: 'type', header: 'Type', accessor: (row) => row.type, width: 170, alwaysVisible: true },
    { id: 'bill', header: 'Bill #', accessor: (row) => row.bill_number ?? '-', width: 150 },
    { id: 'supplier', header: 'Supplier', accessor: (row) => supplierLabel(row.supplier), width: 230 },
    { id: 'severity', header: 'Severity', accessor: (row) => row.severity, cell: (row) => <StatusPill value={row.severity} />, width: 130 },
    { id: 'status', header: 'Status', accessor: (row) => row.status, cell: (row) => <StatusPill value={row.status} />, width: 130 },
    { id: 'owner', header: 'Owner', accessor: (row) => row.assigned_to_user_id ?? '-', width: 150 },
    { id: 'message', header: 'Message', accessor: (row) => row.message, width: 320 },
    {
      id: 'actions',
      header: 'Action',
      accessor: () => '',
      sortable: false,
      filterable: false,
      sticky: 'right',
      width: 100,
      cell: (row) => (
        <button
          type="button"
          onClick={() => void runAction(`exception-resolve-${row.id}`, `/api/payables/exceptions/${row.id}/resolve`, 'Exception resolved.', { resolution_code: 'cleared', actor_user_id: 'system' })}
          disabled={row.status === 'resolved' || actionBusy === `exception-resolve-${row.id}`}
          title="Resolve exception"
          aria-label="Resolve exception"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {actionBusy === `exception-resolve-${row.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        </button>
      ),
    },
  ], [actionBusy]);

  const creditColumns = useMemo<AdvancedTableColumn<CreditNoteRow>[]>(() => [
    { id: 'credit', header: 'Credit #', accessor: (row) => row.credit_number, width: 170, alwaysVisible: true },
    { id: 'supplier', header: 'Supplier', accessor: (row) => supplierLabel(row.supplier), width: 230 },
    { id: 'date', header: 'Date', accessor: (row) => row.credit_date ?? '', cell: (row) => formatDate(row.credit_date), width: 130 },
    { id: 'total', header: 'Total', accessor: (row) => row.amount_total, cell: (row) => formatMoney(row.amount_total), align: 'right', width: 150 },
    { id: 'available', header: 'Available', accessor: (row) => row.amount_available, cell: (row) => formatMoney(row.amount_available), align: 'right', width: 150 },
    { id: 'status', header: 'Status', accessor: (row) => row.status, cell: (row) => <StatusPill value={row.status} />, width: 130 },
    { id: 'dispute', header: 'Dispute', accessor: (row) => row.dispute_status ?? 'none', cell: (row) => <StatusPill value={row.dispute_status ?? 'none'} />, width: 130 },
  ], []);

  const recurringColumns = useMemo<AdvancedTableColumn<RecurringTemplateRow>[]>(() => [
    { id: 'template', header: 'Template', accessor: (row) => row.template_name, width: 230, alwaysVisible: true },
    { id: 'supplier', header: 'Supplier', accessor: (row) => supplierLabel(row.supplier), width: 230 },
    { id: 'frequency', header: 'Frequency', accessor: (row) => row.frequency, width: 130 },
    { id: 'interval', header: 'Interval', accessor: (row) => row.interval_value, align: 'right', width: 110 },
    { id: 'nextRun', header: 'Next Run', accessor: (row) => row.next_run_date ?? '', cell: (row) => formatDate(row.next_run_date), width: 130 },
    { id: 'amount', header: 'Default Amount', accessor: (row) => row.default_amount, cell: (row) => formatMoney(row.default_amount), align: 'right', width: 160 },
    { id: 'status', header: 'Status', accessor: (row) => row.active ? 'active' : 'inactive', cell: (row) => <StatusPill value={row.active ? 'active' : 'inactive'} />, width: 130 },
  ], []);

  const statementColumns = useMemo<AdvancedTableColumn<SupplierStatementRow>[]>(() => [
    { id: 'supplier', header: 'Supplier', accessor: (row) => supplierLabel(row.supplier), width: 240, alwaysVisible: true },
    { id: 'date', header: 'Statement Date', accessor: (row) => row.statement_date ?? '', cell: (row) => formatDate(row.statement_date), width: 160 },
    { id: 'balance', header: 'Closing Balance', accessor: (row) => row.closing_balance, cell: (row) => formatMoney(row.closing_balance), align: 'right', width: 180 },
    { id: 'status', header: 'Status', accessor: (row) => row.status, cell: (row) => <StatusPill value={row.status} />, width: 140 },
  ], []);

  const forecastColumns = useMemo<AdvancedTableColumn<ForecastRow>[]>(() => [
    { id: 'date', header: 'Due Date', accessor: (row) => row.due_date ?? row.date ?? '', cell: (row) => formatDate(row.due_date ?? row.date), width: 140, alwaysVisible: true },
    { id: 'supplier', header: 'Supplier', accessor: (row) => typeof row.supplier === 'string' ? row.supplier : supplierLabel(row.supplier) || row.supplier_name || '-', width: 240 },
    { id: 'bill', header: 'Bill #', accessor: (row) => row.bill_number ?? '-', width: 160 },
    { id: 'amount', header: 'Amount', accessor: (row) => row.amount_due ?? row.amount ?? 0, cell: (row) => formatMoney(row.amount_due ?? row.amount ?? 0), align: 'right', width: 160 },
  ], []);

  const trendColumns = useMemo<AdvancedTableColumn<TrendRow>[]>(() => [
    { id: 'month', header: 'Month', accessor: (row) => row.month ?? row.bucket ?? '-', width: 160, alwaysVisible: true },
    { id: 'amount', header: 'Overdue Amount', accessor: (row) => row.overdue_amount ?? row.amount ?? 0, cell: (row) => formatMoney(row.overdue_amount ?? row.amount ?? 0), align: 'right', width: 180 },
    { id: 'bills', header: 'Bills', accessor: (row) => row.bills ?? row.count ?? 0, align: 'right', width: 120 },
  ], []);

  const tableConfig = useMemo(() => {
    switch (view) {
      case 'aging':
        return { tableId: 'payables-aging', columns: agingColumns, rows: agingRows, emptyMessage: 'No aging buckets found.', selectable: false };
      case 'approvals':
        return { tableId: 'payables-approvals', columns: approvalColumns, rows: payload?.approvalQueue ?? [], emptyMessage: 'No approval queue records found.', selectable: false };
      case 'matching':
        return { tableId: 'payables-matching', columns: billColumns, rows: payload?.matchingQueue ?? [], emptyMessage: 'No bills are waiting for native AP matching.', selectable: false };
      case 'payments':
        return { tableId: 'payables-payment-batches', columns: paymentBatchColumns, rows: payload?.paymentBatches ?? [], emptyMessage: 'No payment batches found.', selectable: false };
      case 'credits':
        return { tableId: 'payables-credit-notes', columns: creditColumns, rows: payload?.creditNotes ?? [], emptyMessage: 'No credit notes found.', selectable: false };
      case 'recurring':
        return { tableId: 'payables-recurring', columns: recurringColumns, rows: payload?.recurringTemplates ?? [], emptyMessage: 'No recurring bill templates found.', selectable: false };
      case 'statements':
        return { tableId: 'payables-statements', columns: statementColumns, rows: payload?.supplierStatements ?? [], emptyMessage: 'No supplier statements found.', selectable: false };
      case 'exceptions':
        return { tableId: 'payables-exceptions', columns: exceptionColumns, rows: payload?.exceptions ?? [], emptyMessage: 'No payable exceptions found.', selectable: false };
      case 'forecasting':
        return { tableId: 'payables-forecast', columns: forecastColumns, rows: forecastRows, emptyMessage: 'No forecast rows found.', selectable: false };
      case 'overview':
        return { tableId: 'payables-overview-bills', columns: billColumns, rows: billRows, emptyMessage: 'No supplier bills found.', selectable: true };
      case 'suppliers':
      case 'prior-balances':
      case 'factor-companies':
        return { tableId: 'payables-suppliers', columns: supplierColumns, rows: suppliers, emptyMessage: 'No suppliers found.', selectable: false };
      case 'bills':
        return { tableId: 'payables-bills', columns: billColumns, rows: billRows, emptyMessage: 'No supplier bills found.', selectable: true };
      default:
        return { tableId: 'payables-suppliers', columns: supplierColumns, rows: suppliers, emptyMessage: 'No suppliers found.', selectable: false };
    }
  }, [
    agingColumns,
    agingRows,
    approvalColumns,
    billColumns,
    billRows,
    creditColumns,
    exceptionColumns,
    forecastColumns,
    forecastRows,
    paymentBatchColumns,
    payload?.approvalQueue,
    payload?.creditNotes,
    payload?.exceptions,
    payload?.matchingQueue,
    payload?.paymentBatches,
    payload?.recurringTemplates,
    payload?.supplierStatements,
    recurringColumns,
    statementColumns,
    supplierColumns,
    suppliers,
    view,
  ]);

  const payablesActions = useMemo<PayablesAction[]>(() => {
    const actions: PayablesAction[] = [];
    const overdueBills = summary?.overdueBills ?? 0;
    const exceptionQueue = governance?.exceptionQueue ?? 0;
    const approvalQueue = governance?.approvalQueue ?? 0;
    const matchingQueue = governance?.matchingQueue ?? 0;
    const dueThisWeek = summary?.dueThisWeek ?? 0;

    if (exceptionQueue > 0) {
      actions.push({
        id: 'exceptions',
        priority: 1,
        title: 'Resolve payable exceptions',
        detail: `${exceptionQueue.toLocaleString()} exception records need owner review.`,
        tone: 'danger',
        valueLabel: exceptionQueue.toLocaleString(),
        actionLabel: 'Open exceptions',
        path: '/payables/exceptions',
        icon: AlertTriangle,
      });
    }

    if (overdueBills > 0) {
      actions.push({
        id: 'overdue-bills',
        priority: 2,
        title: 'Prioritize overdue supplier bills',
        detail: `${overdueBills.toLocaleString()} open bills are past due.`,
        tone: 'warning',
        valueLabel: overdueBills.toLocaleString(),
        actionLabel: 'Open bills',
        path: '/payables/bills',
        icon: CalendarClock,
      });
    }

    if (approvalQueue > 0) {
      actions.push({
        id: 'approvals',
        priority: 3,
        title: 'Clear approval queue',
        detail: `${approvalQueue.toLocaleString()} submitted bills are waiting for approval.`,
        tone: 'pending',
        valueLabel: approvalQueue.toLocaleString(),
        actionLabel: 'Open approvals',
        path: '/payables/approvals',
        icon: ClipboardCheck,
      });
    }

    if (matchingQueue > 0) {
      actions.push({
        id: 'matching',
        priority: 4,
        title: 'Complete invoice matching',
        detail: `${matchingQueue.toLocaleString()} bills are in the matching workbench.`,
        tone: 'info',
        valueLabel: matchingQueue.toLocaleString(),
        actionLabel: 'Open matching',
        path: '/payables/matching',
        icon: Workflow,
      });
    }

    if (dueThisWeek > 0) {
      actions.push({
        id: 'due-this-week',
        priority: 5,
        title: 'Stage payments due this week',
        detail: 'Supplier cash requirements are due in the current week.',
        tone: 'warning',
        valueLabel: formatMoney(dueThisWeek),
        actionLabel: 'Open forecast',
        path: '/payables/forecasting',
        icon: CreditCard,
      });
    }

    if (actions.length === 0) {
      actions.push({
        id: 'payables-clear',
        priority: 1,
        title: 'No urgent payable exceptions',
        detail: 'Approvals, matching, exceptions, and due-week pressure are clear.',
        tone: 'success',
        valueLabel: 'Clear',
        actionLabel: 'Review bills',
        path: '/payables/bills',
        icon: CheckCircle2,
      });
    }

    return actions.sort((first, second) => first.priority - second.priority).slice(0, 5);
  }, [governance?.approvalQueue, governance?.exceptionQueue, governance?.matchingQueue, summary?.dueThisWeek, summary?.overdueBills]);

  const metricCards = [
    {
      label: 'Total payables',
      value: formatMoney(summary?.totalPayables ?? 0),
      note: `${(governance?.nativeOpenBills ?? 0).toLocaleString()} native open bills in AP`,
      status: (summary?.totalPayables ?? 0) > 0 ? 'Plan' : 'Clear',
      icon: ReceiptText,
      tone: (summary?.totalPayables ?? 0) > 0 ? 'info' as const : 'success' as const,
    },
    {
      label: 'Due this week',
      value: formatMoney(summary?.dueThisWeek ?? 0),
      note: 'Supplier cash requirement in the current week',
      status: (summary?.dueThisWeek ?? 0) > 0 ? 'Stage' : 'Clear',
      icon: CreditCard,
      tone: (summary?.dueThisWeek ?? 0) > 0 ? 'warning' as const : 'success' as const,
    },
    {
      label: 'Overdue bills',
      value: String(summary?.overdueBills ?? 0),
      note: 'Bills past due date and still open',
      status: (summary?.overdueBills ?? 0) > 0 ? 'Collect' : 'Clear',
      icon: CalendarClock,
      tone: (summary?.overdueBills ?? 0) > 0 ? 'danger' as const : 'success' as const,
    },
    {
      label: 'Exceptions',
      value: String(governance?.exceptionQueue ?? 0),
      note: 'Open matching, duplicate, credit, or workflow exceptions',
      status: (governance?.exceptionQueue ?? 0) > 0 ? 'Review' : 'Clear',
      icon: AlertCircle,
      tone: (governance?.exceptionQueue ?? 0) > 0 ? 'pending' as const : 'success' as const,
    },
  ];

  const workloadTotal = (summary?.overdueBills ?? 0)
    + (governance?.approvalQueue ?? 0)
    + (governance?.matchingQueue ?? 0)
    + (governance?.exceptionQueue ?? 0);
  const workloadTone: PayablesTone = workloadTotal > 0 ? 'warning' : 'success';
  const workloadTiles = [
    {
      label: 'Approvals',
      value: String(governance?.approvalQueue ?? 0),
      note: 'Submitted bills waiting',
      tone: (governance?.approvalQueue ?? 0) > 0 ? 'pending' as const : 'success' as const,
      path: '/payables/approvals',
    },
    {
      label: 'Matching',
      value: String(governance?.matchingQueue ?? 0),
      note: 'Bills in match review',
      tone: (governance?.matchingQueue ?? 0) > 0 ? 'info' as const : 'success' as const,
      path: '/payables/matching',
    },
    {
      label: 'Payment batches',
      value: String(governance?.paymentBatches ?? 0),
      note: 'Draft, approved, or executed',
      tone: (governance?.paymentBatches ?? 0) > 0 ? 'neutral' as const : 'success' as const,
      path: '/payables/payments',
    },
    {
      label: 'Due this week',
      value: formatMoney(summary?.dueThisWeek ?? 0),
      note: 'Cash requirement',
      tone: (summary?.dueThisWeek ?? 0) > 0 ? 'warning' as const : 'success' as const,
      path: '/payables/forecasting',
    },
  ];

  const renderViewAction = () => {
    if (view === 'suppliers' || view === 'overview') {
      return (
        <Button onClick={() => setSupplierDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Supplier
        </Button>
      );
    }

    if (view === 'aging') {
      return (
        <Button onClick={() => void runAction('snapshot', '/api/payables/reports/snapshots/generate', 'Aging snapshot generated.')} disabled={actionBusy === 'snapshot'}>
          {actionBusy === 'snapshot' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
          Snapshot
        </Button>
      );
    }

    if (view === 'approvals') {
      return (
        <Button onClick={() => void runAction('approval-escalation', '/api/payables/approvals/escalate/run', 'Approval escalation check completed.')} disabled={actionBusy === 'approval-escalation'}>
          {actionBusy === 'approval-escalation' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          Escalate
        </Button>
      );
    }

    if (view === 'recurring') {
      return (
        <Button onClick={() => void runAction('recurring-run', '/api/payables/recurring/run', 'Recurring bill run completed.')} disabled={actionBusy === 'recurring-run'}>
          {actionBusy === 'recurring-run' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Repeat className="mr-2 h-4 w-4" />}
          Run
        </Button>
      );
    }

    return null;
  };

  return (
    <div className="akiva-page-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                    Payables
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <Layers3 className="h-4 w-4 text-akiva-accent-text" />
                    {payablesNavigation.find((item) => item.view === view)?.label ?? 'Overview'}
                  </span>
                </div>
                <h1 className="mt-4 akiva-page-title">{copy.title}</h1>
                <p className="akiva-page-subtitle">{copy.description}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadPayables()}
                  disabled={loading}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Refresh payables dashboard"
                  title="Refresh payables dashboard"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                {renderViewAction()}
              </div>
            </div>
          </header>

          <div className="border-b border-akiva-border px-4 py-3 sm:px-6 lg:px-8">
            <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Accounts payable views">
              {payablesNavigation.map((item) => {
                const Icon = item.icon;
                const active = item.view === view;
                return (
                  <button
                    key={item.view}
                    type="button"
                    onClick={() => navigateToView(item.path)}
                    className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                      active
                        ? 'border-akiva-accent bg-akiva-accent text-white shadow-sm'
                        : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {(message || error) && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  error
                    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                }`}
              >
                {error || message}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metricCards.map((card) => (
                <PayablesMetricCard key={card.label} {...card} />
              ))}
            </div>

            <section className="akiva-panel rounded-2xl border border-akiva-border bg-akiva-surface-raised/90 p-4 shadow-sm">
              <div className="grid gap-4 xl:grid-cols-[220px_1fr] xl:items-center">
                <div className={`rounded-xl border p-4 ${payablesSubtleToneClass(workloadTone)}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide">Payables workload</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="akiva-financial-value text-4xl font-semibold">{workloadTotal.toLocaleString()}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold">{workloadTotal > 0 ? 'Open work' : 'Clear'}</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">Combined overdue bills, approvals, matching, and exception queues.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {workloadTiles.map((tile) => (
                    <button
                      key={tile.label}
                      type="button"
                      onClick={() => navigateToView(tile.path)}
                      className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 text-left transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{tile.label}</p>
                      <p className="akiva-financial-value mt-2 truncate text-lg font-semibold text-akiva-text">{tile.value}</p>
                      <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{tile.note}</p>
                      <span className={`mt-2 inline-flex h-2 w-2 rounded-full ${payablesToneDot(tile.tone)}`} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-12">
              <main className="space-y-4 lg:col-span-8">
                <PayablesPanel
                  title={view === 'overview' ? 'Supplier Bill Workbench' : copy.title}
                  detail={loading ? 'Loading accounts payable records...' : `${tableConfig.rows.length.toLocaleString()} records available for this view.`}
                  icon={view === 'overview' ? ReceiptText : payablesNavigation.find((item) => item.view === view)?.icon ?? FileText}
                  actions={
                    <div className="relative w-full sm:w-80">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                      <input
                        type="text"
                        placeholder={copy.searchPlaceholder}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        className={`${inputClassName} pl-10`}
                      />
                    </div>
                  }
                >
                  <AdvancedTable
                    tableId={tableConfig.tableId}
                    ariaLabel={copy.title}
                    columns={tableConfig.columns as AdvancedTableColumn<object>[]}
                    rows={tableConfig.rows as object[]}
                    rowKey={(row) => String((row as { id?: string | number; bucket?: string }).id ?? (row as { bucket?: string }).bucket ?? JSON.stringify(row))}
                    emptyMessage={tableConfig.emptyMessage}
                    loading={loading}
                    loadingMessage="Loading accounts payable records..."
                    density="compact"
                    maxTableHeight="min(68vh, 720px)"
                    selectableRows={tableConfig.selectable}
                    bulkActions={view === 'bills' || view === 'overview' ? [{ id: 'payment-batch', label: 'Create payment batch', onClick: (rows) => void createPaymentBatch(rows as BillRow[]) }] : []}
                    showSearch={false}
                  />
                </PayablesPanel>

                {view === 'forecasting' && (
                  <PayablesPanel
                    title="Overdue Trend"
                    detail="Recent supplier overdue movement from the forecasting service."
                    icon={Layers3}
                  >
                    <AdvancedTable
                      tableId="payables-overdue-trend"
                      ariaLabel="Payables overdue trend"
                      columns={trendColumns}
                      rows={trendRows}
                      rowKey={(row, index) => `${row.month ?? row.bucket ?? 'trend'}-${index}`}
                      emptyMessage="No overdue trend rows found."
                      density="compact"
                      maxTableHeight="360px"
                    />
                  </PayablesPanel>
                )}
              </main>

              <aside className="space-y-4 lg:col-span-4">
                <PayablesPanel
                  title="AI Payables Actions"
                  detail="Recommended supplier-payment actions ranked by operational pressure."
                  icon={AlertTriangle}
                >
                  <div className="space-y-2">
                    {payablesActions.map((action) => (
                      <PayablesActionRow key={action.id} action={action} onOpen={navigateToView} />
                    ))}
                  </div>
                </PayablesPanel>

                <PayablesPanel
                  title="Aging Snapshot"
                  detail="Current payable exposure by due bucket."
                  icon={CalendarClock}
                >
                  <PayablesAgingSnapshot rows={agingRows} />
                </PayablesPanel>

                <PayablesPanel
                  title="Workflow Coverage"
                  detail="Native AP routes backed by live tables and workflow APIs."
                  icon={Workflow}
                >
                  <div className="space-y-2">
                    {[
                      { label: 'Native suppliers', value: governance?.nativeSupplierCount ?? 0, tone: 'info' as const },
                      { label: 'Approvals', value: governance?.approvalQueue ?? 0, tone: (governance?.approvalQueue ?? 0) > 0 ? 'pending' as const : 'success' as const },
                      { label: 'Matching', value: governance?.matchingQueue ?? 0, tone: (governance?.matchingQueue ?? 0) > 0 ? 'info' as const : 'success' as const },
                      { label: 'Payment batches', value: governance?.paymentBatches ?? 0, tone: 'neutral' as const },
                      { label: 'Credits', value: governance?.creditNotes ?? 0, tone: 'success' as const },
                      { label: 'Recurring bills', value: governance?.recurringTemplates ?? 0, tone: 'success' as const },
                      { label: 'Statements', value: governance?.supplierStatements ?? 0, tone: 'success' as const },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2.5">
                        <span className="text-sm font-semibold text-akiva-text">{item.label}</span>
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-akiva-text-muted">
                          <span className={`h-2 w-2 rounded-full ${payablesToneDot(item.tone)}`} />
                          {item.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </PayablesPanel>
              </aside>
            </div>
          </div>
        </section>
      </div>

      <Modal
        isOpen={supplierDialogOpen}
        onClose={() => setSupplierDialogOpen(false)}
        title="Add Supplier"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSupplierDialogOpen(false)} disabled={actionBusy === 'supplier-save'}>
              Cancel
            </Button>
            <Button type="submit" form="payables-supplier-form" disabled={actionBusy === 'supplier-save'}>
              {actionBusy === 'supplier-save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Save Supplier
            </Button>
          </div>
        }
      >
        <form id="payables-supplier-form" onSubmit={submitSupplier} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-akiva-text">Supplier code *</span>
            <input
              value={supplierForm.supplier_code}
              onChange={(event) => setSupplierForm((current) => ({ ...current, supplier_code: event.target.value.toUpperCase() }))}
              required
              maxLength={30}
              className={inputClassName}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-akiva-text">Name *</span>
            <input
              value={supplierForm.name}
              onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))}
              required
              className={inputClassName}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-akiva-text">Email</span>
            <input
              value={supplierForm.email}
              onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))}
              type="email"
              className={inputClassName}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-akiva-text">Phone</span>
            <input
              value={supplierForm.phone}
              onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))}
              className={inputClassName}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-akiva-text">Currency</span>
            <SearchableSelect
              value={supplierForm.currency_code}
              onChange={(value) => setSupplierForm((current) => ({ ...current, currency_code: String(value) }))}
              options={currencyOptions}
              placeholder="Select currency..."
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-akiva-text">Payment terms</span>
            <input
              value={supplierForm.payment_term_code}
              onChange={(event) => setSupplierForm((current) => ({ ...current, payment_term_code: event.target.value }))}
              maxLength={20}
              className={inputClassName}
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1.5 block font-medium text-akiva-text">Credit limit</span>
            <input
              value={supplierForm.credit_limit}
              onChange={(event) => setSupplierForm((current) => ({ ...current, credit_limit: event.target.value }))}
              type="number"
              min="0"
              step="0.01"
              className={inputClassName}
            />
          </label>
        </form>
      </Modal>

      {confirmationDialog}
    </div>
  );
}
