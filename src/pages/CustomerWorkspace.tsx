import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { jsPDF } from 'jspdf';
import {
  Banknote,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileSearch,
  FileText,
  GitBranch,
  KeyRound,
  MessageSquare,
  PackageOpen,
  PanelLeft,
  PanelRight,
  PenLine,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Tag,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { Modal } from '../components/ui/Modal';
import {
  fetchOutstandingSalesOrders,
  fetchSalesCustomers,
  fetchSalesOrderStatus,
  fetchSalesTransactionDocument,
  fetchSalesTransactions,
} from '../data/salesApi';
import { formatDateWithSystemFormat, useSystemDateFormat } from '../lib/dateFormat';
import { CUSTOMER_WORKSPACE_MODAL_EVENT } from '../lib/customerWorkspaceModal';
import { NAVIGATION_EVENT, navigateToPath } from '../lib/navigation';
import type {
  SalesCustomer,
  SalesOrderStatusRow,
  SalesOutstandingOrder,
  SalesTransaction,
  SalesTransactionDocument,
} from '../types/sales';

type CustomerActionId =
  | 'workspace'
  | 'transaction-inquiries'
  | 'account-statement'
  | 'customer-details'
  | 'print-statement'
  | 'email-statement'
  | 'order-inquiries'
  | 'customer-purchases'
  | 'outstanding-sales-orders'
  | 'allocate-receipts'
  | 'counter-sale'
  | 'add-customer'
  | 'modify-customer'
  | 'customer-branches'
  | 'special-prices'
  | 'edi-configuration'
  | 'login-configuration'
  | 'add-contact'
  | 'add-note';

type CustomerMenuSide = 'left' | 'right';

interface CustomerAction {
  id: CustomerActionId;
  label: string;
  detail: string;
  icon: LucideIcon;
}

interface CustomerActionGroup {
  title: string;
  icon: LucideIcon;
  actions: CustomerAction[];
}

interface CustomerWorkspaceData {
  transactions: SalesTransaction[];
  outstandingOrders: SalesOutstandingOrder[];
  orderStatus: SalesOrderStatusRow[];
}

const CUSTOMER_BASE_PATH = '/receivables/customers';

const CUSTOMER_ACTION_GROUPS: CustomerActionGroup[] = [
  {
    title: 'Customer Inquiries',
    icon: FileSearch,
    actions: [
      {
        id: 'transaction-inquiries',
        label: 'Customer Transaction Inquiries',
        detail: 'Invoices, receipts, credit notes, and settlement status.',
        icon: ReceiptText,
      },
      {
        id: 'account-statement',
        label: 'Account Statement On Screen',
        detail: 'Running statement view for the selected customer.',
        icon: FileText,
      },
      {
        id: 'customer-details',
        label: 'View Customer Details',
        detail: 'Master record, branch, contact, and default sales setup.',
        icon: Building2,
      },
      {
        id: 'print-statement',
        label: 'Print Customer Statement',
        detail: 'Prepare a statement print run for the selected account.',
        icon: Printer,
      },
      {
        id: 'email-statement',
        label: 'Email Customer Statement',
        detail: 'Send a customer statement to the current contact address.',
        icon: Send,
      },
      {
        id: 'order-inquiries',
        label: 'Order Inquiries',
        detail: 'Sales order progress and fulfillment status.',
        icon: ClipboardList,
      },
      {
        id: 'customer-purchases',
        label: 'Show Purchases From This Customer',
        detail: 'Recent invoice and order value for the selected customer.',
        icon: ShoppingCart,
      },
    ],
  },
  {
    title: 'Customer Transactions',
    icon: CircleDollarSign,
    actions: [
      {
        id: 'outstanding-sales-orders',
        label: 'Modify Outstanding Sales Orders',
        detail: 'Review open quantities, delivery dates, and order value.',
        icon: PackageOpen,
      },
      {
        id: 'allocate-receipts',
        label: 'Allocate Receipts Or Credit Notes',
        detail: 'Find unsettled receipts and credits for allocation.',
        icon: CreditCard,
      },
      {
        id: 'counter-sale',
        label: 'Create A Counter Sale',
        detail: 'Start a counter sale with the selected customer loaded.',
        icon: Banknote,
      },
    ],
  },
  {
    title: 'Customer Maintenance',
    icon: Wrench,
    actions: [
      {
        id: 'add-customer',
        label: 'Add A New Customer',
        detail: 'Capture a new debtor account and first branch.',
        icon: Plus,
      },
      {
        id: 'modify-customer',
        label: 'Modify Customer Details',
        detail: 'Update customer defaults, contact fields, and terms.',
        icon: PenLine,
      },
      {
        id: 'customer-branches',
        label: 'Add/Edit/Delete Customer Branches',
        detail: 'Maintain branch details and delivery defaults.',
        icon: GitBranch,
      },
      {
        id: 'special-prices',
        label: 'Special Customer Prices',
        detail: 'Manage account-specific pricing rules.',
        icon: Tag,
      },
      {
        id: 'edi-configuration',
        label: 'Customer EDI Configuration',
        detail: 'Maintain document exchange settings.',
        icon: FileText,
      },
      {
        id: 'login-configuration',
        label: 'Customer Login Configuration',
        detail: 'Configure portal login state and access level.',
        icon: KeyRound,
      },
      {
        id: 'add-contact',
        label: 'Add A Customer Contact',
        detail: 'Record a new contact for the selected customer.',
        icon: UserPlus,
      },
      {
        id: 'add-note',
        label: 'Add A Note On This Customer',
        detail: 'Capture follow-up notes against this account.',
        icon: MessageSquare,
      },
    ],
  },
];

const CUSTOMER_ACTIONS = CUSTOMER_ACTION_GROUPS.flatMap((group) => group.actions);
const CUSTOMER_ACTION_LOOKUP = new Map<CustomerActionId, CustomerAction>([
  [
    'workspace',
    {
      id: 'workspace',
      label: 'Customer Workspace',
      detail: 'Customer identity, account position, and sales trend.',
      icon: Users,
    },
  ],
  ...CUSTOMER_ACTIONS.map((action): [CustomerActionId, CustomerAction] => [action.id, action]),
]);

function actionPath(actionId: CustomerActionId): string {
  return actionId === 'workspace' ? CUSTOMER_BASE_PATH : `${CUSTOMER_BASE_PATH}/${actionId}`;
}

function actionFromPath(pathname: string): CustomerActionId {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  const segment = normalized.slice(CUSTOMER_BASE_PATH.length).replace(/^\/+/, '');
  if (!segment) return 'workspace';
  const match = CUSTOMER_ACTIONS.find((action) => action.id === segment);
  return match?.id ?? 'workspace';
}

function customerKey(customer: SalesCustomer): string {
  return `${customer.debtorNo}::${customer.branchCode}`;
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}

function formatMoney(value: number, currency = 'TZS'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${formatNumber(value)}`;
  }
}

function formatCompactMoney(value: number, currency = 'TZS'): string {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'TZS';
  return `${safeCurrency} ${new Intl.NumberFormat('en-US', {
    notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  }).format(Number.isFinite(value) ? value : 0)}`;
}

const customerChartTooltipContentStyle = {
  backgroundColor: 'var(--akiva-chart-tooltip-bg)',
  border: '1px solid var(--akiva-chart-tooltip-border)',
  borderRadius: '8px',
  color: 'var(--akiva-chart-tooltip-text)',
  boxShadow: '0 18px 38px rgba(0, 0, 0, 0.22)',
};

const customerChartTooltipTextStyle = {
  color: 'var(--akiva-chart-tooltip-text)',
  fontWeight: 600,
};

const customerChartAxisTick = {
  fill: 'var(--akiva-chart-muted)',
  fontSize: 11,
  fontWeight: 600,
};

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractIsoDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : localIsoDate(parsed);
}

function formatDisplayDate(value: string | null | undefined, dateFormat: string): string {
  const isoDate = extractIsoDate(value);
  return isoDate ? formatDateWithSystemFormat(isoDate, dateFormat) || isoDate : '-';
}

function monthKeyFromIso(value: string | null | undefined): string {
  const isoDate = extractIsoDate(value);
  return /^\d{4}-\d{2}/.test(isoDate) ? isoDate.slice(0, 7) : '';
}

function monthDate(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, 1);
}

function shiftMonth(monthKey: string, offset: number): string {
  const date = monthDate(monthKey);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string): string {
  const date = monthDate(monthKey);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function recentMonthKeys(transactions: SalesTransaction[], count = 8): string[] {
  const keys = transactions
    .map((row) => monthKeyFromIso(row.transactionDate))
    .filter(Boolean)
    .sort();
  const latest = keys.length > 0 ? keys[keys.length - 1] : monthKeyFromIso(localIsoDate(new Date()));
  return Array.from({ length: count }, (_, index) => shiftMonth(latest, index - count + 1));
}

function transactionTypeLabel(type: number): string {
  if (type === 10) return 'Invoice';
  if (type === 11) return 'Credit Note';
  if (type === 12) return 'Receipt';
  return `Type ${type}`;
}

function currencyDisplayName(currencyCode: string | undefined): string {
  const code = (currencyCode || 'TZS').toUpperCase();
  const names: Record<string, string> = {
    TZS: 'Tanzania Shilling',
    USD: 'US Dollar',
    EUR: 'Euro',
    GBP: 'British Pound',
    KES: 'Kenyan Shilling',
    UGX: 'Ugandan Shilling',
  };
  return names[code] ?? code;
}

function customerCurrency(customer: SalesCustomer | null | undefined): string {
  return (customer?.currencyCode || 'TZS').toUpperCase();
}

function paymentTermLabel(customer: SalesCustomer | null | undefined): string {
  if (!customer) return '-';
  if (customer.paymentTermsName) return customer.paymentTermsName;
  if ((customer.dayInFollowingMonth ?? 0) > 0) return `Due on day ${customer.dayInFollowingMonth} of the following month`;
  if ((customer.daysBeforeDue ?? 0) > 0) return `Due after ${customer.daysBeforeDue} days`;
  return customer.paymentTerms || '-';
}

function formatCustomerPercent(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function customerLanguageLabel(languageId: string | null | undefined): string {
  const normalized = String(languageId || '').replace(/\.utf-?8$/i, '').replace('-', '_');
  const knownLanguages: Record<string, string> = {
    en_US: 'English United States',
    en_GB: 'English United Kingdom',
    sw_TZ: 'Swahili Tanzania',
  };
  if (knownLanguages[normalized]) return knownLanguages[normalized];

  const [language, region] = normalized.split('_');
  if (!language) return '-';

  try {
    const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(language) || language;
    const regionName = region ? new Intl.DisplayNames(['en'], { type: 'region' }).of(region) : '';
    return [languageName, regionName].filter(Boolean).join(' ');
  } catch {
    return normalized || '-';
  }
}

function dueDateForTransaction(transactionDate: string, customer: SalesCustomer | null): Date | null {
  const isoDate = extractIsoDate(transactionDate);
  if (!isoDate) return null;

  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const dayInFollowingMonth = Math.max(0, Number(customer?.dayInFollowingMonth ?? 0));
  if (dayInFollowingMonth > 0) {
    return new Date(date.getFullYear(), date.getMonth() + 1, dayInFollowingMonth);
  }

  const daysBeforeDue = Math.max(
    0,
    Number(customer?.daysBeforeDue ?? 0) || Number(String(customer?.paymentTerms ?? '').match(/\d+/)?.[0] ?? 0) || 30
  );
  const dueDate = new Date(date);
  dueDate.setDate(dueDate.getDate() + daysBeforeDue);
  return dueDate;
}

function daysBetween(first: Date, second: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const firstDate = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
  const secondDate = new Date(second.getFullYear(), second.getMonth(), second.getDate()).getTime();
  return Math.floor((firstDate - secondDate) / msPerDay);
}

function buildAgingBuckets(transactions: SalesTransaction[], customer: SalesCustomer | null) {
  const today = new Date();
  return transactions
    .filter((row) => !row.settled)
    .reduce(
      (buckets, row) => {
        const amount = row.grossTotal;
        const dueDate = dueDateForTransaction(row.transactionDate, customer);
        const daysOverdue = dueDate ? daysBetween(today, dueDate) : 0;

        buckets.total += amount;
        if (daysOverdue <= 0) buckets.current += amount;
        else if (daysOverdue < 30) buckets.nowDue += amount;
        else if (daysOverdue <= 60) buckets.over30 += amount;
        else buckets.over60 += amount;

        return buckets;
      },
      { total: 0, current: 0, nowDue: 0, over30: 0, over60: 0 }
    );
}

function statementFileName(customer: SalesCustomer | null): string {
  const debtorNo = customer?.debtorNo || 'customer';
  return `customer-statement-${debtorNo}-${localIsoDate(new Date())}.pdf`;
}

function CustomerWorkspaceBadge({ children, icon: Icon }: { children: ReactNode; icon: LucideIcon }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <Icon className="h-4 w-4 text-akiva-accent-text" />
      {children}
    </span>
  );
}

function InfoTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">{label}</p>
      <div className="mt-1 truncate text-sm font-semibold text-akiva-text">{value}</div>
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 py-10 text-center">
      <p className="text-sm font-semibold text-akiva-text">{title}</p>
      <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{detail}</p>
    </div>
  );
}

function ActionPanel({
  actionId,
  children,
  headerActions,
}: {
  actionId: CustomerActionId;
  children: ReactNode;
  headerActions?: ReactNode;
}) {
  const action = CUSTOMER_ACTION_LOOKUP.get(actionId) ?? CUSTOMER_ACTION_LOOKUP.get('workspace')!;
  const Icon = action.icon;

  return (
    <section className="rounded-xl border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm">
      <div className="mb-3 flex flex-col gap-3 border-b border-akiva-border pb-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-akiva-border bg-akiva-surface-muted text-akiva-accent-text">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-akiva-text">{action.label}</h2>
            <p className="mt-0.5 text-xs leading-5 text-akiva-text-muted">{action.detail}</p>
          </div>
        </div>
        {headerActions ? <div className="min-w-0 shrink-0">{headerActions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function CustomerSearchStrip({
  customers,
  customerSearch,
  selectedCustomer,
  loadingCustomers,
  onSearchChange,
  onSelectCustomer,
  onRefresh,
}: {
  customers: SalesCustomer[];
  customerSearch: string;
  selectedCustomer: SalesCustomer | null;
  loadingCustomers: boolean;
  onSearchChange: (value: string) => void;
  onSelectCustomer: (customer: SalesCustomer) => void;
  onRefresh: () => void;
}) {
  const [resultsOpen, setResultsOpen] = useState(false);
  const selectCustomers = useMemo(() => {
    if (!selectedCustomer) return customers;
    const selectedKey = customerKey(selectedCustomer);
    if (customers.some((customer) => customerKey(customer) === selectedKey)) return customers;
    return [selectedCustomer, ...customers];
  }, [customers, selectedCustomer]);

  return (
    <section className="border-b border-akiva-border bg-akiva-surface/70 px-4 py-4 sm:px-6 lg:px-8">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)] xl:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">Customer search</label>
            <span className="text-xs font-semibold text-akiva-text-muted">
              {loadingCustomers ? 'Searching...' : `${formatNumber(customers.length)} matches`}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                <input
                  value={customerSearch}
                  onFocus={() => setResultsOpen(true)}
                  onBlur={() => window.setTimeout(() => setResultsOpen(false), 120)}
                  onChange={(event) => {
                    onSearchChange(event.target.value);
                    setResultsOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setResultsOpen(false);
                  }}
                  className="h-11 w-full rounded-xl border border-akiva-border bg-akiva-surface-raised px-3 py-2 pl-9 pr-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                  placeholder="Search name, code, branch, phone, or email"
                  autoComplete="off"
                  aria-label="Search customers"
                />
              </div>
              {resultsOpen ? (
                <div className="absolute left-0 right-0 top-full z-[230] mt-2 max-h-64 overflow-auto rounded-xl border border-akiva-border bg-akiva-surface-raised p-1 shadow-xl shadow-slate-900/10">
                  {selectCustomers.length === 0 ? (
                    <div className="px-3 py-3 text-sm font-medium text-akiva-text-muted">
                      {loadingCustomers ? 'Searching customers...' : 'No customers found'}
                    </div>
                  ) : (
                    selectCustomers.map((customer) => {
                      const key = customerKey(customer);
                      const active = selectedCustomer ? customerKey(selectedCustomer) === key : false;
                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            onSelectCustomer(customer);
                            onSearchChange('');
                            setResultsOpen(false);
                          }}
                          className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                            active
                              ? 'bg-akiva-accent-soft text-akiva-text'
                              : 'text-akiva-text hover:bg-akiva-surface-muted'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{customer.customerName}</span>
                            <span className="mt-0.5 block truncate text-xs text-akiva-text-muted">
                              {customer.debtorNo} / {customer.branchCode || '-'}
                            </span>
                          </span>
                          {active ? <span className="h-2 w-2 shrink-0 rounded-full bg-akiva-accent" /> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-akiva-border bg-akiva-surface-raised px-4 text-sm font-semibold text-akiva-text shadow-sm transition hover:bg-akiva-surface-muted"
            >
              <RefreshCw className={`h-4 w-4 ${loadingCustomers ? 'animate-spin' : ''}`} />
              Search
            </button>
          </div>
          {customerSearch ? (
            <p className="mt-2 text-xs font-semibold text-akiva-text-muted">Query: {customerSearch}</p>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <InfoTile label="Selected customer" value={selectedCustomer?.customerName ?? 'No customer selected'} />
          <InfoTile label="Code / branch" value={selectedCustomer ? `${selectedCustomer.debtorNo} / ${selectedCustomer.branchCode || '-'}` : '-'} />
          <InfoTile label="Phone" value={selectedCustomer?.phone || '-'} />
          <InfoTile label="Email" value={selectedCustomer?.email || '-'} />
        </div>
      </div>
    </section>
  );
}

function ActionNavigation({
  activeAction,
  onOpenAction,
  menuSide,
  onMenuSideChange,
}: {
  activeAction: CustomerActionId;
  onOpenAction: (actionId: CustomerActionId) => void;
  menuSide: CustomerMenuSide;
  onMenuSideChange: (side: CustomerMenuSide) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CUSTOMER_ACTION_GROUPS.map((group) => [group.title, true]))
  );

  const toggleGroup = (groupTitle: string) => {
    setExpandedGroups((current) => ({
      ...current,
      [groupTitle]: !(current[groupTitle] ?? true),
    }));
  };

  return (
    <aside
      className={`flex h-full min-h-0 w-[288px] shrink-0 flex-col overflow-hidden bg-akiva-surface/95 shadow-sm ${
        menuSide === 'left' ? 'border-r border-akiva-border' : 'border-l border-akiva-border'
      }`}
    >
      <div className="shrink-0 border-b border-akiva-border p-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-akiva-accent text-white shadow-sm shadow-violet-950/10">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-5 text-akiva-text">Customers</p>
            <p className="truncate text-[11px] font-medium text-akiva-text-muted">Select an action</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-akiva-border bg-akiva-surface p-1">
          <button
            type="button"
            onClick={() => onMenuSideChange('left')}
            aria-label="Dock customer menu left"
            title="Dock customer menu left"
            className={`flex h-7 items-center justify-center rounded-md transition ${
              menuSide === 'left'
                ? 'bg-akiva-accent text-white shadow-sm shadow-violet-950/10'
                : 'text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
            }`}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMenuSideChange('right')}
            aria-label="Dock customer menu right"
            title="Dock customer menu right"
            className={`flex h-7 items-center justify-center rounded-md transition ${
              menuSide === 'right'
                ? 'bg-akiva-accent text-white shadow-sm shadow-violet-950/10'
                : 'text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
            }`}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <nav className="scrollbar-hover min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        <a
          href={CUSTOMER_BASE_PATH}
          onClick={(event) => {
            event.preventDefault();
            onOpenAction('workspace');
          }}
          className={`group relative flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-semibold transition ${
            activeAction === 'workspace'
              ? 'bg-akiva-accent-soft text-akiva-accent-text'
              : 'text-akiva-text hover:bg-white/70 dark:hover:bg-slate-800'
          }`}
        >
          <span
            className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition ${
              activeAction === 'workspace' ? 'bg-akiva-accent' : 'bg-transparent group-hover:bg-akiva-accent/35'
            }`}
          />
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            activeAction === 'workspace'
              ? 'bg-akiva-surface text-akiva-accent-text'
              : 'bg-akiva-surface-raised text-akiva-accent-text'
          }`}
          >
            <Users className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 truncate">Overview</span>
        </a>

        {CUSTOMER_ACTION_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const expanded = expandedGroups[group.title] ?? true;
          const groupActive = group.actions.some((action) => action.id === activeAction);
          return (
            <div key={group.title} className="space-y-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={expanded}
                className={`flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] font-semibold uppercase tracking-normal transition ${
                  groupActive
                    ? 'bg-akiva-accent-soft text-akiva-text'
                    : 'bg-akiva-surface-muted text-akiva-text-muted hover:bg-white/70 hover:text-akiva-text dark:hover:bg-slate-800'
                }`}
              >
                <GroupIcon className="h-3.5 w-3.5 text-akiva-accent-text" />
                <span className="min-w-0 flex-1 truncate">{group.title}</span>
                {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              </button>

              {expanded ? <div className="space-y-px">
                {group.actions.map((action) => {
                  const Icon = action.icon;
                  const active = action.id === activeAction;
                  return (
                    <a
                      key={action.id}
                      href={actionPath(action.id)}
                      onClick={(event) => {
                        event.preventDefault();
                        onOpenAction(action.id);
                      }}
                      className={`group relative flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition ${
                        active
                          ? 'bg-akiva-accent-soft text-akiva-accent-text'
                          : 'text-akiva-text hover:bg-white/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span
                        className={`absolute inset-y-2 left-0 w-0.5 rounded-full transition ${
                          active ? 'bg-akiva-accent' : 'bg-transparent group-hover:bg-akiva-accent/35'
                        }`}
                      />
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                        active
                          ? 'bg-akiva-surface text-akiva-accent-text'
                          : 'bg-akiva-surface-raised text-akiva-accent-text'
                      }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 truncate font-medium leading-5">{action.label}</span>
                    </a>
                  );
                })}
              </div> : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

type CustomerSalesTrendRow = {
  month: string;
  label: string;
  sales: number;
  invoices: number;
};

type CustomerBalanceTrendRow = {
  month: string;
  label: string;
  netMovement: number;
  balance: number;
};

function CustomerMetricCard({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    neutral: 'border-akiva-border bg-akiva-surface',
    success: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20',
    warning: 'border-orange-200 bg-orange-50/80 dark:border-orange-900 dark:bg-orange-950/20',
    danger: 'border-red-200 bg-red-50/80 dark:border-red-900 dark:bg-red-950/20',
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-normal text-akiva-text-muted">{label}</p>
      <div className="mt-1 truncate text-base font-semibold text-akiva-text">{value}</div>
      {note ? <p className="mt-1 truncate text-xs font-medium text-akiva-text-muted">{note}</p> : null}
    </div>
  );
}

function ChartShell({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-akiva-border bg-akiva-surface p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-akiva-text">{title}</h3>
          <p className="mt-0.5 text-xs leading-5 text-akiva-text-muted">{detail}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ChartEmptyState({ loading, message }: { loading: boolean; message: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-akiva-border bg-akiva-surface-muted px-4 text-center text-sm font-semibold text-akiva-text-muted">
      {loading ? 'Loading dashboard data...' : message}
    </div>
  );
}

function SalesTrendChart({
  rows,
  loading,
}: {
  rows: CustomerSalesTrendRow[];
  loading: boolean;
}) {
  const hasSales = rows.some((row) => row.sales > 0);

  if (!hasSales) {
    return <ChartEmptyState loading={loading} message="No invoice sales found for this customer." />;
  }

  return (
    <div className="h-56 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 14, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={customerChartAxisTick} interval="preserveStartEnd" />
          <YAxis
            tickFormatter={(value: number) => formatCompactMoney(value)}
            tickLine={false}
            axisLine={false}
            tick={customerChartAxisTick}
            width={72}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [
              String(name) === 'Invoices' ? formatNumber(Number(value)) : formatMoney(Number(value)),
              String(name),
            ]}
            contentStyle={customerChartTooltipContentStyle}
            labelStyle={customerChartTooltipTextStyle}
            itemStyle={customerChartTooltipTextStyle}
          />
          <Area
            type="monotone"
            dataKey="sales"
            name="Sales"
            stroke="var(--akiva-chart-ink)"
            strokeWidth={2.5}
            fill="var(--akiva-chart-ink-fill)"
            activeDot={{ r: 4 }}
          />
          <Line type="monotone" dataKey="invoices" name="Invoices" stroke="var(--akiva-chart-success)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BalanceTrendChart({
  rows,
  loading,
}: {
  rows: CustomerBalanceTrendRow[];
  loading: boolean;
}) {
  const hasMovement = rows.some((row) => row.netMovement !== 0 || row.balance !== 0);

  if (!hasMovement) {
    return <ChartEmptyState loading={loading} message="No balance movement found for this customer." />;
  }

  return (
    <div className="h-56 min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 14, left: -10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--akiva-chart-grid)" strokeDasharray="4 6" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={customerChartAxisTick} interval="preserveStartEnd" />
          <YAxis
            tickFormatter={(value: number) => formatCompactMoney(value)}
            tickLine={false}
            axisLine={false}
            tick={customerChartAxisTick}
            width={72}
          />
          <Tooltip
            formatter={(value: unknown, name: unknown) => [formatMoney(Number(value)), String(name)]}
            contentStyle={customerChartTooltipContentStyle}
            labelStyle={customerChartTooltipTextStyle}
            itemStyle={customerChartTooltipTextStyle}
          />
          <ReferenceLine y={0} stroke="var(--akiva-chart-muted)" strokeDasharray="4 5" />
          <Line
            type="monotone"
            dataKey="balance"
            name="Balance"
            stroke="var(--akiva-chart-brand)"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="netMovement"
            name="Net movement"
            stroke="var(--akiva-chart-warning)"
            strokeWidth={2}
            strokeDasharray="6 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function WorkspaceOverview({
  selectedCustomer,
  data,
  dataLoading,
  openAction,
  dateFormat,
}: {
  selectedCustomer: SalesCustomer | null;
  data: CustomerWorkspaceData;
  dataLoading: boolean;
  openAction: (actionId: CustomerActionId) => void;
  dateFormat: string;
}) {
  const openTransactions = data.transactions.filter((row) => !row.settled);
  const openBalance = openTransactions.reduce((sum, row) => sum + row.grossTotal, 0);
  const allTransactionBalance = data.transactions.reduce((sum, row) => sum + row.grossTotal, 0);
  const invoiceRows = data.transactions.filter((row) => row.transType === 10 && row.grossTotal > 0);
  const invoiceTotal = invoiceRows.reduce((sum, row) => sum + row.grossTotal, 0);
  const creditsReceiptsTotal = data.transactions
    .filter((row) => row.transType === 11 || row.transType === 12 || row.grossTotal < 0)
    .reduce((sum, row) => sum + Math.abs(row.grossTotal), 0);
  const averageInvoice = invoiceRows.length > 0 ? invoiceTotal / invoiceRows.length : 0;
  const openOrderValue = data.outstandingOrders.reduce((sum, row) => sum + row.grossTotal, 0);
  const latestInvoice = [...invoiceRows].sort((first, second) => String(second.transactionDate).localeCompare(String(first.transactionDate)))[0];
  const positionTone = openBalance > 0 ? 'warning' : openBalance < 0 ? 'success' : 'neutral';
  const positionTitle = openBalance > 0 ? 'Customer owes us' : openBalance < 0 ? 'Customer in credit' : 'Account clear';
  const positionDetail = openBalance > 0 ? 'Debtor position' : openBalance < 0 ? 'We owe this customer' : 'No open balance';

  const salesTrendRows = useMemo<CustomerSalesTrendRow[]>(() => {
    const keys = recentMonthKeys(data.transactions, 8);
    return keys.map((month) => {
      const rows = data.transactions.filter((row) => monthKeyFromIso(row.transactionDate) === month);
      const invoices = rows.filter((row) => row.transType === 10 && row.grossTotal > 0);
      return {
        month,
        label: formatMonthLabel(month),
        sales: invoices.reduce((sum, row) => sum + row.grossTotal, 0),
        invoices: invoices.length,
      };
    });
  }, [data.transactions]);

  const balanceTrendRows = useMemo<CustomerBalanceTrendRow[]>(() => {
    const keys = recentMonthKeys(data.transactions, 8);
    const firstMonth = keys[0] ?? monthKeyFromIso(localIsoDate(new Date()));
    let runningBalance = data.transactions
      .filter((row) => {
        const month = monthKeyFromIso(row.transactionDate);
        return month !== '' && month < firstMonth;
      })
      .reduce((sum, row) => sum + row.grossTotal, 0);

    return keys.map((month) => {
      const netMovement = data.transactions
        .filter((row) => monthKeyFromIso(row.transactionDate) === month)
        .reduce((sum, row) => sum + row.grossTotal, 0);
      runningBalance += netMovement;
      return {
        month,
        label: formatMonthLabel(month),
        netMovement,
        balance: runningBalance,
      };
    });
  }, [data.transactions]);

  return (
    <ActionPanel actionId="workspace">
      {!selectedCustomer ? (
        <EmptyPanel title="No customer selected" detail="Search for a customer to load the workspace." />
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <section className="rounded-xl border border-akiva-border bg-akiva-surface p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-normal text-akiva-text-muted">Selected customer</p>
                  <h3 className="mt-1 truncate text-xl font-semibold text-akiva-text">{selectedCustomer.customerName}</h3>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-akiva-text-muted">
                    <span className="rounded-full border border-akiva-border bg-akiva-surface-raised px-2.5 py-1">{selectedCustomer.debtorNo}</span>
                    <span className="rounded-full border border-akiva-border bg-akiva-surface-raised px-2.5 py-1">
                      Branch {selectedCustomer.branchCode || '-'}
                    </span>
                    {selectedCustomer.salesType ? (
                      <span className="rounded-full border border-akiva-border bg-akiva-surface-raised px-2.5 py-1">{selectedCustomer.salesType}</span>
                    ) : null}
                  </div>
                </div>
                <div className={`rounded-xl border px-4 py-3 text-right ${
                  positionTone === 'warning'
                    ? 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20'
                    : positionTone === 'success'
                      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
                      : 'border-akiva-border bg-akiva-surface-raised'
                }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">{positionTitle}</p>
                  <p className="mt-1 akiva-financial-value text-2xl font-semibold text-akiva-text">{formatMoney(Math.abs(openBalance))}</p>
                  <p className="mt-1 text-xs font-semibold text-akiva-text-muted">{positionDetail}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <CustomerMetricCard
                  label="Invoice sales"
                  value={dataLoading ? 'Loading...' : formatMoney(invoiceTotal)}
                  note={`${formatNumber(invoiceRows.length)} invoices`}
                />
                <CustomerMetricCard
                  label="Open balance"
                  value={dataLoading ? 'Loading...' : formatMoney(openBalance)}
                  note={`${formatNumber(openTransactions.length)} unsettled docs`}
                  tone={positionTone}
                />
                <CustomerMetricCard
                  label="Open orders"
                  value={dataLoading ? 'Loading...' : formatMoney(openOrderValue)}
                  note={`${formatNumber(data.outstandingOrders.length)} orders`}
                />
                <CustomerMetricCard
                  label="Average invoice"
                  value={dataLoading ? 'Loading...' : formatMoney(averageInvoice)}
                  note={latestInvoice ? `Last ${formatDisplayDate(latestInvoice.transactionDate, dateFormat)}` : 'No recent invoice'}
                />
              </div>
            </section>

            <section className="rounded-xl border border-akiva-border bg-akiva-surface p-4">
              <p className="text-[11px] font-semibold uppercase tracking-normal text-akiva-text-muted">Account identity</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-akiva-text-muted">Phone</span>
                  <span className="truncate font-semibold text-akiva-text">{selectedCustomer.phone || '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-akiva-text-muted">Email</span>
                  <span className="truncate font-semibold text-akiva-text">{selectedCustomer.email || '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-akiva-text-muted">Terms</span>
                  <span className="truncate font-semibold text-akiva-text">{selectedCustomer.paymentTerms || '-'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-akiva-text-muted">Location</span>
                  <span className="truncate font-semibold text-akiva-text">{selectedCustomer.defaultLocation || '-'}</span>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-akiva-text-muted">{selectedCustomer.address || 'No address captured.'}</p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => openAction('transaction-inquiries')}
                  className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-2.5 py-2 text-xs font-semibold text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:text-akiva-text"
                >
                  Transactions
                </button>
                <button
                  type="button"
                  onClick={() => openAction('account-statement')}
                  className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-2.5 py-2 text-xs font-semibold text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:text-akiva-text"
                >
                  Statement
                </button>
                <button
                  type="button"
                  onClick={() => openAction('order-inquiries')}
                  className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-2.5 py-2 text-xs font-semibold text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:text-akiva-text"
                >
                  Orders
                </button>
              </div>
            </section>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <ChartShell title="Sales trend" detail="Invoice value and invoice count by month.">
              <SalesTrendChart rows={salesTrendRows} loading={dataLoading} />
            </ChartShell>
            <ChartShell title="Balance movement" detail="Running account balance and monthly net movement.">
              <BalanceTrendChart rows={balanceTrendRows} loading={dataLoading} />
            </ChartShell>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <CustomerMetricCard label="Total transaction balance" value={dataLoading ? 'Loading...' : formatMoney(allTransactionBalance)} />
            <CustomerMetricCard label="Receipts / credits" value={dataLoading ? 'Loading...' : formatMoney(creditsReceiptsTotal)} />
            <CustomerMetricCard label="Order pipeline" value={dataLoading ? 'Loading...' : `${formatNumber(data.orderStatus.length)} tracked orders`} />
          </div>
        </div>
      )}
    </ActionPanel>
  );
}

function CustomerDetailLine({ label, value, valueClassName = '' }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="grid min-h-10 gap-1 border-b border-akiva-border/70 py-2 last:border-b-0 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)] sm:gap-4">
      <div className="text-xs font-semibold uppercase tracking-normal text-akiva-text-muted">{label}</div>
      <div className={`min-w-0 whitespace-pre-line text-sm font-semibold leading-5 text-akiva-text ${valueClassName}`}>{value || '-'}</div>
    </div>
  );
}

function CustomerDetailsSection({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-akiva-border bg-akiva-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-akiva-border bg-akiva-surface-muted text-akiva-accent-text">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-semibold text-akiva-text">{title}</h3>
      </div>
      <div>{children}</div>
    </section>
  );
}

function CustomerSummaryPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-full border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text-muted shadow-sm">
      {children}
    </span>
  );
}

function CustomerContactCell({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <td className={`border-b border-akiva-border px-3 py-2 align-top text-sm ${muted ? 'text-akiva-text-muted' : 'font-medium text-akiva-text'}`}>
      {children || '-'}
    </td>
  );
}

function CustomerDetailsPage({ customer, dateFormat }: { customer: SalesCustomer | null; dateFormat: string }) {
  const addressLine = (line: 1 | 2 | 3 | 4 | 5 | 6) => {
    const directValue = customer?.[`addressLine${line}` as keyof SalesCustomer];
    if (typeof directValue === 'string' && directValue.trim() !== '') return directValue;
    const fallbackParts = String(customer?.address || '').split(',').map((part) => part.trim()).filter(Boolean);
    return fallbackParts[line - 1] || '';
  };
  const contacts = customer?.contacts ?? [];
  const customerSince = customer?.customerSince
    ? formatDisplayDate(customer.customerSince, dateFormat)
    : '-';
  const salesTypeLabel = customer?.salesTypeName || customer?.salesType || '-';
  const customerTypeLabel = customer?.customerType || customer?.customerTypeId || '-';
  const addressLines = [
    ['Address Line 1', addressLine(1)],
    ['Address Line 2', addressLine(2)],
    ['Address Line 3', addressLine(3)],
    ['Address Line 4', addressLine(4)],
    ['Postal Code', addressLine(5)],
    ['Country', addressLine(6)],
  ];

  return (
    <ActionPanel actionId="customer-details">
      {!customer ? (
        <EmptyPanel title="No customer selected" detail="Choose a customer to view the master record." />
      ) : (
        <div className="space-y-3">
          <section className="rounded-lg border border-akiva-border bg-akiva-surface p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-normal text-akiva-text-muted">Customer master</p>
                <h3 className="mt-1 truncate text-xl font-semibold text-akiva-text">{customer.customerName}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CustomerSummaryPill>Code {customer.debtorNo}</CustomerSummaryPill>
                  <CustomerSummaryPill>Branch {customer.branchCode || '-'}</CustomerSummaryPill>
                  <CustomerSummaryPill>{salesTypeLabel}</CustomerSummaryPill>
                  <CustomerSummaryPill>{customer.creditStatus || 'Good History'}</CustomerSummaryPill>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[420px]">
                <InfoTile label="Phone" value={customer.phone || '-'} />
                <InfoTile label="Email" value={customer.email || '-'} />
                <InfoTile label="Terms" value={paymentTermLabel(customer)} />
                <InfoTile label="Credit limit" value={<span className="akiva-financial-value">{formatMoney(customer.creditLimit ?? 0, customerCurrency(customer))}</span>} />
              </div>
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <CustomerDetailsSection title="Identity & Address" icon={Building2}>
              <CustomerDetailLine label="Customer type" value={customerTypeLabel} />
              <CustomerDetailLine label="Customer since" value={customerSince} />
              {addressLines.map(([label, value]) => (
                <CustomerDetailLine key={label} label={label} value={value} />
              ))}
            </CustomerDetailsSection>

            <CustomerDetailsSection title="Commercial Terms" icon={CreditCard}>
              <CustomerDetailLine label="Discount percent" value={formatCustomerPercent(customer.discountPercent)} />
              <CustomerDetailLine label="Discount code" value={customer.discountCode || '-'} />
              <CustomerDetailLine label="Payment discount" value={formatCustomerPercent(customer.paymentDiscountPercent)} />
              <CustomerDetailLine label="Payment terms" value={paymentTermLabel(customer)} />
              <CustomerDetailLine label="Currency" value={currencyDisplayName(customerCurrency(customer))} />
              <CustomerDetailLine label="Tax reference" value={customer.taxReference || '-'} />
            </CustomerDetailsSection>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)]">
            <CustomerDetailsSection title="Controls" icon={Tag}>
              <CustomerDetailLine label="Language" value={customerLanguageLabel(customer.languageId)} />
              <CustomerDetailLine label="Customer PO required" value={customer.customerPoLineRequired ? 'Yes' : 'No'} />
              <CustomerDetailLine label="Invoice addressing" value={customer.invoiceAddressing || 'Address to HO'} />
              <CustomerDetailLine label="Default location" value={customer.defaultLocation || '-'} />
              <CustomerDetailLine label="Default shipper" value={customer.defaultShipperId ? String(customer.defaultShipperId) : '-'} />
            </CustomerDetailsSection>

            <section className="overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
              <div className="flex items-center gap-2 border-b border-akiva-border px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-akiva-border bg-akiva-surface-muted text-akiva-accent-text">
                  <Users className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold text-akiva-text">Contacts</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[680px] w-full border-separate border-spacing-0">
                  <thead>
                    <tr className="bg-akiva-table-header text-left text-xs font-semibold uppercase tracking-normal text-akiva-table-header-text">
                      {['Name', 'Role', 'Phone', 'Email', 'Notes'].map((heading) => (
                        <th key={heading} className="border-b border-akiva-border px-3 py-2">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.length > 0 ? (
                      contacts.map((contact, index) => (
                        <tr key={`${contact.name}-${contact.email}-${index}`} className={index % 2 === 0 ? 'bg-akiva-surface' : 'bg-akiva-table-stripe'}>
                          <CustomerContactCell>{contact.name}</CustomerContactCell>
                          <CustomerContactCell muted>{contact.role}</CustomerContactCell>
                          <CustomerContactCell muted>{contact.phone}</CustomerContactCell>
                          <CustomerContactCell muted>{contact.email}</CustomerContactCell>
                          <CustomerContactCell muted>{contact.notes}</CustomerContactCell>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm font-semibold text-akiva-text-muted">
                          No contacts captured for this customer.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </ActionPanel>
  );
}

function TransactionInquiryPage({
  customer,
  transactions,
  loading,
  dateFormat,
  onRefresh,
}: {
  customer: SalesCustomer | null;
  transactions: SalesTransaction[];
  loading: boolean;
  dateFormat: string;
  onRefresh: () => void;
}) {
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => getDefaultDateRange());
  const [transactionFilter, setTransactionFilter] = useState('all');
  const currency = customerCurrency(customer);
  const aging = useMemo(() => buildAgingBuckets(transactions, customer), [customer, transactions]);
  const filteredTransactions = useMemo(() => {
    return transactions.filter((row) => {
      const transactionDate = extractIsoDate(row.transactionDate);
      const inRange = transactionDate !== '' && transactionDate >= dateRange.from && transactionDate <= dateRange.to;
      if (!inRange) return false;

      if (transactionFilter === 'open') return !row.settled;
      if (transactionFilter === 'settled') return row.settled;
      if (transactionFilter === 'invoices') return row.transType === 10;
      if (transactionFilter === 'credits') return row.transType === 11;
      if (transactionFilter === 'receipts') return row.transType === 12;
      return true;
    });
  }, [dateRange.from, dateRange.to, transactionFilter, transactions]);

  const columns = useMemo<AdvancedTableColumn<SalesTransaction>[]>(() => [
    {
      id: 'date',
      header: 'Date',
      accessor: (row) => row.transactionDate,
      cell: (row) => formatDisplayDate(row.transactionDate, dateFormat),
      width: 120,
    },
    {
      id: 'type',
      header: 'Type',
      accessor: (row) => transactionTypeLabel(row.transType),
      width: 120,
    },
    { id: 'reference', header: 'Reference', accessor: (row) => row.reference || row.transNo || '-', minWidth: 150 },
    { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo || '-', width: 110 },
    {
      id: 'amount',
      header: 'Amount',
      accessor: (row) => row.grossTotal,
      cell: (row) => <span className="akiva-financial-value font-semibold">{formatMoney(row.grossTotal, currency)}</span>,
      align: 'right',
      width: 150,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (row.settled ? 'Settled' : 'Open'),
      cell: (row) => (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
          row.settled
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
            : 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100'
        }`}
        >
          {row.settled ? 'Settled' : 'Open'}
        </span>
      ),
      width: 110,
    },
  ], [currency, dateFormat]);

  return (
    <ActionPanel
      actionId="transaction-inquiries"
      headerActions={
        customer ? (
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            label="Date range"
            className="w-full sm:w-[360px]"
            triggerClassName="h-9 rounded-lg px-3"
            compact
          />
        ) : null
      }
    >
      {!customer ? (
        <EmptyPanel title="No customer selected" detail="Choose a customer to view transaction inquiry details." />
      ) : (
        <div className="space-y-3">
          {pdfError ? (
            <div className="rounded-lg border border-akiva-danger/40 bg-akiva-danger-soft px-3 py-2 text-xs font-semibold text-akiva-danger">
              {pdfError}
            </div>
          ) : null}
          <section className="rounded-xl border border-akiva-border bg-akiva-surface p-3">
            <div className="flex flex-col gap-3 text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-normal text-akiva-text-muted">Customer</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-akiva-text">
                  {customer.debtorNo} - {customer.customerName}
                </h3>
              </div>
              <div className="min-w-0 text-sm font-semibold leading-6 text-akiva-text lg:text-center">
                <p>All amounts stated in: {currencyDisplayName(currency)}</p>
                <p>Terms: {paymentTermLabel(customer)}</p>
                <p>Credit Limit: {formatMoney(customer.creditLimit ?? 0, currency)}</p>
                <p>Credit Status: {customer.creditStatus || 'Good History'}</p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-akiva-border bg-akiva-surface-raised">
              <div className="grid min-w-[720px] grid-cols-5 border-b border-akiva-border bg-akiva-table-header text-xs font-semibold uppercase tracking-normal text-akiva-table-header-text">
                <div className="border-r border-akiva-border px-3 py-2 text-center">Total Balance</div>
                <div className="border-r border-akiva-border px-3 py-2 text-center">Current</div>
                <div className="border-r border-akiva-border px-3 py-2 text-center">Now Due</div>
                <div className="border-r border-akiva-border px-3 py-2 text-center">30-60 Days Overdue</div>
                <div className="px-3 py-2 text-center">Over 60 Days Overdue</div>
              </div>
              <div className="grid min-w-[720px] grid-cols-5 text-sm font-semibold text-akiva-text">
                <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.total, currency)}</div>
                <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.current, currency)}</div>
                <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.nowDue, currency)}</div>
                <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.over30, currency)}</div>
                <div className="akiva-financial-value px-3 py-2 text-right">{formatMoney(aging.over60, currency)}</div>
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex w-full rounded-lg border border-akiva-border bg-akiva-surface-raised p-1 sm:w-auto">
                {[
                  { value: 'all', label: 'All' },
                  { value: 'open', label: 'Open' },
                  { value: 'settled', label: 'Settled' },
                ].map((option) => {
                  const active = transactionFilter === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTransactionFilter(option.value)}
                      className={`min-h-8 flex-1 rounded-md px-3 text-xs font-semibold transition sm:flex-none ${
                        active
                          ? 'bg-akiva-accent text-white shadow-sm'
                          : 'text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-70"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

          </section>

          <AdvancedTable
            tableId="customer-workspace-transactions"
            ariaLabel="Customer transactions"
            columns={columns}
            rows={filteredTransactions}
            rowKey={(row) => `${row.transType}-${row.transNo}-${row.reference}`}
            emptyMessage="No transactions found for this customer and date range."
            loading={loading}
            loadingMessage="Loading customer transactions..."
            density="compact"
            initialPageSize={12}
            maxTableHeight="520px"
            enableDensityToggle={false}
            enableSavedViews={false}
            showColumnControls={false}
            showExports={false}
            showSearch
            searchPlaceholder="Search reference, order, amount, or status"
          />
        </div>
      )}
    </ActionPanel>
  );
}

type AccountStatementRow = SalesTransaction & {
  typeLabel: string;
  number: string;
  dateLabel: string;
  branch: string;
  comments: string;
  orderLabel: string;
  charges: number;
  credits: number;
  allocated: number;
  balance: number;
  runningBalance: number;
};

function AccountStatementPage({
  customer,
  transactions,
  loading,
  dateFormat,
}: {
  customer: SalesCustomer | null;
  transactions: SalesTransaction[];
  loading: boolean;
  dateFormat: string;
}) {
  const currency = customerCurrency(customer);
  const outstandingTransactions = useMemo(() => transactions.filter((row) => !row.settled), [transactions]);
  const aging = useMemo(() => buildAgingBuckets(transactions, customer), [customer, transactions]);
  const statementRows = useMemo<AccountStatementRow[]>(() => {
    let runningBalance = 0;
    return [...outstandingTransactions]
      .sort((first, second) => String(first.transactionDate).localeCompare(String(second.transactionDate)) || String(first.transNo).localeCompare(String(second.transNo), undefined, { numeric: true }))
      .map((row) => {
        const charges = row.grossTotal >= 0 ? row.grossTotal : 0;
        const credits = row.grossTotal < 0 ? Math.abs(row.grossTotal) : 0;
        const allocated = row.settled ? Math.abs(row.grossTotal) : 0;
        const balance = row.grossTotal - (row.grossTotal >= 0 ? allocated : -allocated);
        runningBalance += balance;
        return {
          ...row,
          typeLabel: transactionTypeLabel(row.transType),
          number: row.transNo || row.reference || '-',
          dateLabel: formatDisplayDate(row.transactionDate, dateFormat),
          branch: customer?.branchCode || '-',
          comments: row.reference || '',
          orderLabel: row.orderNo || '-',
          charges,
          credits,
          allocated,
          balance,
          runningBalance,
        };
      });
  }, [customer?.branchCode, dateFormat, outstandingTransactions]);

  const statementTotals = useMemo(() => ({
    charges: statementRows.reduce((sum, row) => sum + row.charges, 0),
    credits: statementRows.reduce((sum, row) => sum + row.credits, 0),
    allocated: statementRows.reduce((sum, row) => sum + row.allocated, 0),
    balance: statementRows.reduce((sum, row) => sum + row.balance, 0),
  }), [statementRows]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

  const invoiceAmount = (value: number) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

  const fallbackDocument = (row: AccountStatementRow): SalesTransactionDocument => ({
    company: {
      name: 'Akiva',
      address: [],
      phone: '',
      fax: '',
      email: '',
      taxReference: '',
    },
    transNo: row.number,
    transType: row.transType,
    debtorNo: row.debtorNo,
    branchCode: row.branch,
    customerName: row.customerName || customer?.customerName || '',
    transactionDate: row.transactionDate,
    orderNo: row.orderNo || row.orderLabel,
    orderDate: row.transactionDate,
    customerReference: row.reference || '',
    salesPerson: '',
    dispatchDetail: 'Default Shipper',
    dispatchedFrom: customer?.defaultLocation || '',
    currencyCode: currency,
    paymentTerms: paymentTermLabel(customer),
    dueDate: dueDateForTransaction(row.transactionDate, customer)?.toISOString().slice(0, 10) || '',
    taxReference: customer?.taxReference || '',
    soldTo: [
      customer?.customerName || row.customerName || '',
      customer?.addressLine1 || '',
      customer?.addressLine2 || '',
      customer?.addressLine3 || '',
      customer?.addressLine5 || '',
      customer?.addressLine6 || '',
    ].filter(Boolean),
    deliveredTo: [
      customer?.customerName || row.customerName || '',
      ...(customer?.address || '').split(',').map((part) => part.trim()).filter(Boolean),
    ],
    subTotal: row.charges || row.balance,
    freight: 0,
    tax: 0,
    discount: 0,
    total: row.balance || row.charges,
    lines: [{
      stockId: '',
      description: row.typeLabel,
      quantity: 1,
      discountPercent: 0,
      unitPrice: row.charges || row.balance,
      netAmount: row.balance || row.charges,
      narrative: row.comments,
      units: '',
    }],
  });

  const loadTransactionDocuments = async (rows: AccountStatementRow[]) => {
    const documents: SalesTransactionDocument[] = [];
    for (const row of rows) {
      if (![10, 11].includes(row.transType)) {
        documents.push(fallbackDocument(row));
        continue;
      }
      const document = await fetchSalesTransactionDocument(row.transType, row.transNo);
      documents.push(document ?? fallbackDocument(row));
    }
    return documents;
  };

  const drawTaxInvoicePage = (doc: jsPDF, document: SalesTransactionDocument) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 34;
    const right = pageWidth - margin;
    const ink: [number, number, number] = [17, 24, 39];
    const muted: [number, number, number] = [71, 85, 105];
    const lineColor: [number, number, number] = [55, 65, 81];
    const softLine: [number, number, number] = [203, 213, 225];
    const surface: [number, number, number] = [248, 250, 252];
    const headerFill: [number, number, number] = [226, 232, 240];
    const accent: [number, number, number] = [109, 40, 217];
    const clean = (value: unknown) => String(value ?? '').trim();
    const line = (x1: number, y1: number, x2: number, y2: number) => doc.line(x1, y1, x2, y2);
    const text = (value: unknown, x: number, y: number, options?: Parameters<jsPDF['text']>[3]) => {
      doc.text(clean(value), x, y, options);
    };
    const fitText = (
      value: unknown,
      x: number,
      y: number,
      maxWidth: number,
      options?: Parameters<jsPDF['text']>[3],
      minFontSize = 6.6,
    ) => {
      const originalSize = doc.getFontSize();
      let nextText = clean(value);
      let nextSize = originalSize;

      while (nextText && doc.getTextWidth(nextText) > maxWidth && nextSize > minFontSize) {
        nextSize -= 0.35;
        doc.setFontSize(nextSize);
      }

      if (nextText && doc.getTextWidth(nextText) > maxWidth) {
        while (nextText.length > 1 && doc.getTextWidth(`${nextText.slice(0, -1).trimEnd()}...`) > maxWidth) {
          nextText = nextText.slice(0, -1).trimEnd();
        }
        nextText = nextText.length > 1 ? `${nextText.slice(0, -1).trimEnd()}...` : nextText;
      }

      doc.text(nextText, x, y, options);
      doc.setFontSize(originalSize);
    };
    const split = (value: unknown, width: number, maxLines: number) => {
      const rawLines = doc.splitTextToSize(clean(value), width) as string[];
      const lines = rawLines.slice(0, maxLines);
      if (rawLines.length > maxLines && lines.length > 0) {
        const last = lines[lines.length - 1];
        lines[lines.length - 1] = last.length > 3 ? `${last.slice(0, -3).trimEnd()}...` : `${last}...`;
      }
      return lines;
    };
    const drawWrapped = (value: unknown, x: number, y: number, width: number, lineHeight: number, maxLines: number, options?: Parameters<jsPDF['text']>[3]) => {
      const lines = split(value, width, maxLines);
      lines.forEach((lineText, index) => doc.text(lineText, x, y + index * lineHeight, options));
      return y + Math.max(lines.length, 1) * lineHeight;
    };
    const drawAddressCard = (title: string, values: string[], x: number, y: number, width: number, height: number) => {
      doc.setDrawColor(...softLine);
      doc.setFillColor(...surface);
      doc.roundedRect(x, y, width, height, 6, 6, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      text(title.toUpperCase(), x + 10, y + 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...ink);
      drawWrapped(values.filter(Boolean).join('\n'), x + 10, y + 28, width - 20, 10.5, 5);
    };
    const formattedDate = (value: string) => value ? formatDisplayDate(value, dateFormat) : '';
    const documentTitle = document.transType === 11 ? 'TAX CREDIT NOTE' : 'TAX INVOICE';

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(...accent);
    doc.rect(0, 0, pageWidth, 5, 'F');
    doc.setDrawColor(...lineColor);
    doc.setTextColor(...ink);
    doc.setLineWidth(0.55);
    doc.setFont('helvetica', 'normal');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    text(documentTitle, pageWidth / 2, 42, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    text('Page 1', right, 32, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(...ink);
    fitText(document.company.name || 'Akiva', margin + 2, 60, 210);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...muted);
    let companyY = drawWrapped((document.company.address || []).join('\n'), margin + 2, 73, 210, 9.5, 4);
    const companyContacts = [
      document.company.phone ? `Phone: ${document.company.phone}` : '',
      document.company.fax ? `Fax: ${document.company.fax}` : '',
      document.company.email ? `Email: ${document.company.email}` : '',
      document.company.taxReference ? `Tax Ref: ${document.company.taxReference}` : '',
    ].filter(Boolean);
    companyY += 1;
    drawWrapped(companyContacts.join('\n'), margin + 2, companyY, 210, 9.5, 4);

    const metaX = 312;
    const metaY = 52;
    const metaW = right - metaX;
    const metaH = 126;
    doc.setDrawColor(...softLine);
    doc.setFillColor(...surface);
    doc.roundedRect(metaX, metaY, metaW, metaH, 8, 8, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.3);
    const metaRows = [
      ['Number', document.transNo],
      ['Customer Code', `${document.debtorNo} Branch ${document.branchCode || document.debtorNo}`],
      ['Date', formattedDate(document.transactionDate)],
      ['Order No', document.orderNo || document.transNo],
      ['Order Date', formattedDate(document.orderDate || document.transactionDate)],
      ['Dispatch Detail', document.dispatchDetail || 'Default Shipper'],
      ['Dispatched From', document.dispatchedFrom || 'ADMINISTRATION'],
    ];
    metaRows.forEach(([label, value], index) => {
      const y = metaY + 16 + index * 15.3;
      doc.setTextColor(...muted);
      doc.setFont('helvetica', 'bold');
      text(label, metaX + 10, y);
      doc.setTextColor(...ink);
      doc.setFont('helvetica', 'normal');
      fitText(value, metaX + 98, y, metaW - 108);
    });

    drawAddressCard('Sold To', document.soldTo || [], margin, 190, 244, 74);
    drawAddressCard('Delivered To', document.deliveredTo || [], 318, 190, right - 318, 74);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(...muted);
    fitText(`All amounts stated in: ${document.currencyCode || currency} - ${currencyDisplayName(document.currencyCode || currency)}`, margin + 2, 282, 330);
    fitText(`Due Date: ${formattedDate(document.dueDate)}`, right - 2, 282, 150, { align: 'right' });

    const tableX = margin;
    const tableY = 292;
    const tableW = pageWidth - margin * 2;
    const tableRight = tableX + tableW;
    const infoY = 328;
    const headerY = 350;
    const footerY = pageHeight - 92;
    const tableBottom = pageHeight - 28;
    const col = {
      item: tableX,
      desc: tableX + 76,
      unit: tableX + 262,
      qty: tableX + 338,
      uom: tableX + 382,
      disc: tableX + 424,
      price: tableX + 466,
      right: tableRight,
    };

    doc.setDrawColor(...lineColor);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(tableX, tableY, tableW, tableBottom - tableY, 9, 9, 'F');
    doc.setFillColor(...surface);
    doc.roundedRect(tableX + 0.4, tableY + 0.4, tableW - 0.8, infoY - tableY - 0.4, 9, 9, 'F');
    doc.rect(tableX + 0.4, tableY + 9, tableW - 0.8, infoY - tableY - 9, 'F');
    doc.setFillColor(...headerFill);
    doc.rect(tableX + 0.4, infoY + 0.4, tableW - 0.8, headerY - infoY - 0.8, 'F');
    line(tableX + 0.4, infoY, tableRight - 0.4, infoY);
    line(tableX + 0.4, headerY, tableRight - 0.4, headerY);
    line(tableX + 0.4, footerY, tableRight - 0.4, footerY);
    line(tableX + 174, tableY, tableX + 174, infoY);
    line(tableX + 360, tableY, tableX + 360, infoY);
    [col.desc, col.unit, col.qty, col.uom, col.disc, col.price].forEach((x) => line(x, infoY, x, footerY));
    line(tableX + 308, footerY, tableX + 308, tableBottom);
    line(tableX + 308, tableBottom - 18, tableRight, tableBottom - 18);

    const infoCols = [
      { x: tableX + 8, width: 154, label: 'Cust. Tax Ref:', value: document.taxReference || '' },
      { x: tableX + 184, width: 160, label: 'Cust. Reference No.:', value: document.customerReference || '' },
      { x: tableX + 370, width: tableRight - tableX - 378, label: 'Sales Person:', value: document.salesPerson || '' },
    ];
    infoCols.forEach((item) => {
      doc.setFontSize(8.2);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...muted);
      text(item.label, item.x, tableY + 13);
      doc.setFontSize(9);
      doc.setTextColor(...ink);
      fitText(item.value, item.x, tableY + 28, item.width);
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...ink);
    text('Item Code', col.item + 5, infoY + 14);
    text('Description', col.desc + 5, infoY + 14);
    text('Unit Price', col.unit + 5, infoY + 14);
    text('Qty', col.qty + 6, infoY + 14);
    text('UOM', col.uom + 5, infoY + 14);
    text('Disc.', col.disc + 5, infoY + 14);
    text('Price', col.price + 5, infoY + 14);

    let rowTop = headerY;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    for (const lineItem of document.lines || []) {
      const descriptionLines = split(lineItem.description || '', col.unit - col.desc - 10, 2);
      const narrativeLines = lineItem.narrative ? split(lineItem.narrative, col.unit - col.desc - 20, 2) : [];
      const contentY = rowTop + 15;
      const descriptionLineHeight = 9.1;
      const narrativeLineHeight = 7.8;
      const narrativeY = contentY + descriptionLines.length * descriptionLineHeight + 1.5;
      const rowHeight = Math.max(24, 14 + descriptionLines.length * descriptionLineHeight + narrativeLines.length * narrativeLineHeight + (narrativeLines.length > 0 ? 3 : 0));
      if (rowTop + rowHeight > footerY - 8) break;
      doc.setDrawColor(...softLine);
      line(tableX + 0.4, rowTop + rowHeight, tableRight - 0.4, rowTop + rowHeight);
      doc.setTextColor(...ink);
      fitText(lineItem.stockId || '', col.item + 8, contentY, col.desc - col.item - 16);
      descriptionLines.forEach((descriptionLine, index) => text(descriptionLine, col.desc + 5, contentY + index * descriptionLineHeight));
      fitText(invoiceAmount(lineItem.unitPrice), col.qty - 8, contentY, col.qty - col.unit - 13, { align: 'right' });
      fitText(invoiceAmount(lineItem.quantity).replace(/\.00$/, ''), col.uom - 8, contentY, col.uom - col.qty - 14, { align: 'right' });
      fitText(lineItem.units || '', col.uom + 5, contentY, col.disc - col.uom - 10);
      fitText(lineItem.discountPercent > 0 ? `${invoiceAmount(lineItem.discountPercent)}%` : '', col.price - 5, contentY, col.price - col.disc - 10, { align: 'right' });
      fitText(invoiceAmount(lineItem.netAmount), col.right - 10, contentY, col.right - col.price - 16, { align: 'right' });
      doc.setFontSize(7.8);
      doc.setTextColor(...muted);
      narrativeLines.forEach((narrativeLine, index) => text(narrativeLine, col.desc + 13, narrativeY + index * narrativeLineHeight));
      doc.setFontSize(8.6);
      rowTop += rowHeight;
    }

    doc.setTextColor(...ink);
    doc.setFontSize(8.4);
    doc.setFont('helvetica', 'bold');
    drawWrapped(`Payment Terms: ${document.paymentTerms || paymentTermLabel(customer)}`, tableX + 8, footerY + 13, 286, 9.5, 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...muted);
    drawWrapped('Ownership will not pass to the buyer until the goods have been paid for in full.', tableX + 8, footerY + 35, 286, 8, 2);

    doc.setFontSize(8.8);
    doc.setTextColor(...ink);
    const totalLabelX = tableX + 316;
    const totalValueX = tableRight - 12;
    const totalRows = [
      ['Sub Total', document.subTotal],
      ['Freight', document.freight],
      ['Tax', document.tax],
    ];
    totalRows.forEach(([label, amount], index) => {
      const y = footerY + 13 + index * 16;
      fitText(String(label), totalLabelX, y, 96);
      fitText(invoiceAmount(Number(amount)), totalValueX, y, tableRight - totalLabelX - 112, { align: 'right' });
    });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    fitText(document.transType === 11 ? 'TOTAL CREDIT' : 'TOTAL INVOICE', totalLabelX, tableBottom - 6, 112);
    fitText(invoiceAmount(document.total), totalValueX, tableBottom - 6, tableRight - totalLabelX - 124, { align: 'right' });
    doc.setDrawColor(...lineColor);
    doc.setLineWidth(0.55);
    doc.roundedRect(tableX, tableY, tableW, tableBottom - tableY, 9, 9, 'S');
  };

  const createPdf = async (rows: AccountStatementRow[] = statementRows) => {
    const documents = await loadTransactionDocuments(rows);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    documents.forEach((document, index) => {
      if (index > 0) doc.addPage();
      drawTaxInvoicePage(doc, document);
    });
    return doc;
  };

  const openPdf = async (rows: AccountStatementRow[] = statementRows) => {
    setPdfBusy(true);
    setPdfError('');
    try {
      const doc = await createPdf(rows);
      doc.save(statementFileName(customer));
    } catch {
      setPdfError('Unable to generate the invoice PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  const printPdf = async () => {
    setPdfBusy(true);
    setPdfError('');
    try {
      const doc = await createPdf();
      doc.autoPrint();
      const pdfUrl = doc.output('bloburl');
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    } catch {
      setPdfError('Unable to print the invoice PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  const emailStatement = async (rows: AccountStatementRow[] = statementRows) => {
    setPdfBusy(true);
    setPdfError('');
    try {
      const doc = await createPdf(rows);
      doc.save(statementFileName(customer));
    } catch {
      setPdfError('Unable to generate the invoice PDF for email.');
      setPdfBusy(false);
      return;
    }
    setPdfBusy(false);
    const subject = `Customer statement ${customer?.debtorNo ?? ''}`.trim();
    const body = [
      `Hello,`,
      '',
      `Please find the customer transaction PDF generated for attachment.`,
      '',
      `Customer: ${customer ? `${customer.debtorNo} - ${customer.customerName}` : '-'}`,
      `Total balance: ${formatMoney(aging.total, currency)}`,
      `Current: ${formatMoney(aging.current, currency)}`,
      `Now due: ${formatMoney(aging.nowDue, currency)}`,
      `30-60 days overdue: ${formatMoney(aging.over30, currency)}`,
      `Over 60 days overdue: ${formatMoney(aging.over60, currency)}`,
    ].join('\n');

    window.location.href = `mailto:${encodeURIComponent(customer?.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <ActionPanel
      actionId="account-statement"
      headerActions={
        customer ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void printPdf()}
              disabled={statementRows.length === 0 || pdfBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
            <button
              type="button"
              onClick={() => void openPdf()}
              disabled={statementRows.length === 0 || pdfBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => void emailStatement()}
              disabled={statementRows.length === 0 || pdfBusy}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-xs font-semibold text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              Email
            </button>
          </div>
        ) : null
      }
    >
      {!customer ? (
        <EmptyPanel title="No customer selected" detail="Choose a customer to view an account statement." />
      ) : (
        <div className="space-y-3">
          <section className="rounded-xl border border-akiva-border bg-akiva-surface p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-normal text-akiva-text-muted">Customer</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-akiva-text">{customer.debtorNo} - {customer.customerName}</h3>
                <p className="mt-1 text-xs font-semibold text-akiva-text-muted">Outstanding transactions as at {formatDisplayDate(localIsoDate(new Date()), dateFormat)}</p>
              </div>
              <div className="text-sm font-semibold leading-6 text-akiva-text lg:text-right">
                <p>All amounts stated in: {currencyDisplayName(currency)}</p>
                <p>Terms: {paymentTermLabel(customer)}</p>
                <p>Credit Limit: {formatMoney(customer.creditLimit ?? 0, currency)}</p>
                <p>Credit Status: {customer.creditStatus || 'Good History'}</p>
              </div>
            </div>
          </section>

          <div className="overflow-auto rounded-xl border border-akiva-border bg-akiva-surface-raised shadow-sm">
            <table className="min-w-[1180px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-akiva-table-header text-left text-xs font-semibold uppercase tracking-normal text-akiva-table-header-text">
                  <th className="border-b border-akiva-border px-3 py-2">Type</th>
                  <th className="border-b border-akiva-border px-3 py-2 text-right">Number</th>
                  <th className="border-b border-akiva-border px-3 py-2">Date</th>
                  <th className="border-b border-akiva-border px-3 py-2">Branch</th>
                  <th className="border-b border-akiva-border px-3 py-2">Reference</th>
                  <th className="border-b border-akiva-border px-3 py-2">Comments</th>
                  <th className="border-b border-akiva-border px-3 py-2 text-right">Order</th>
                  <th className="border-b border-akiva-border px-3 py-2 text-right">Charges</th>
                  <th className="border-b border-akiva-border px-3 py-2 text-right">Credits</th>
                  <th className="border-b border-akiva-border px-3 py-2 text-right">Allocated</th>
                  <th className="border-b border-akiva-border px-3 py-2 text-right">Balance</th>
                  <th className="border-b border-akiva-border px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-sm text-akiva-text-muted">Loading statement...</td>
                  </tr>
                ) : statementRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-sm text-akiva-text-muted">No outstanding statement rows found for this customer.</td>
                  </tr>
                ) : (
                  statementRows.map((row, index) => (
                    <tr key={`${row.transType}-${row.transNo}-${row.transactionDate}`} className={index % 2 === 0 ? 'bg-akiva-surface-raised' : 'bg-akiva-table-stripe'}>
                      <td className="border-b border-akiva-border px-3 py-2 font-medium text-akiva-text">{row.typeLabel}</td>
                      <td className="border-b border-akiva-border px-3 py-2 text-right text-akiva-text">{row.number}</td>
                      <td className="border-b border-akiva-border px-3 py-2 text-akiva-text">{row.dateLabel}</td>
                      <td className="border-b border-akiva-border px-3 py-2 text-akiva-text">{row.branch}</td>
                      <td className="border-b border-akiva-border px-3 py-2 text-akiva-text">{row.reference || '-'}</td>
                      <td className="border-b border-akiva-border px-3 py-2 text-akiva-text-muted">{row.comments || '-'}</td>
                      <td className="border-b border-akiva-border px-3 py-2 text-right text-akiva-text">{row.orderLabel}</td>
                      <td className="akiva-financial-value border-b border-akiva-border px-3 py-2 text-right font-semibold text-akiva-text">{row.charges ? formatMoney(row.charges, currency) : '-'}</td>
                      <td className="akiva-financial-value border-b border-akiva-border px-3 py-2 text-right font-semibold text-akiva-text">{row.credits ? formatMoney(row.credits, currency) : '-'}</td>
                      <td className="akiva-financial-value border-b border-akiva-border px-3 py-2 text-right text-akiva-text">{formatMoney(row.allocated, currency)}</td>
                      <td className="akiva-financial-value border-b border-akiva-border px-3 py-2 text-right font-semibold text-akiva-text">{formatMoney(row.balance, currency)}</td>
                      <td className="border-b border-akiva-border px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button type="button" disabled={pdfBusy} onClick={() => void openPdf([row])} className="rounded-md border border-akiva-border bg-akiva-surface px-2 py-1 text-xs font-semibold text-akiva-text-muted hover:border-akiva-accent hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">PDF</button>
                          <button type="button" disabled={pdfBusy} onClick={() => void emailStatement([row])} className="rounded-md border border-akiva-border bg-akiva-surface px-2 py-1 text-xs font-semibold text-akiva-text-muted hover:border-akiva-accent hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60">Email</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {statementRows.length > 0 ? (
                <tfoot>
                  <tr className="bg-akiva-surface-muted text-sm font-semibold text-akiva-text">
                    <td className="px-3 py-2" colSpan={7}>Totals</td>
                    <td className="akiva-financial-value px-3 py-2 text-right">{formatMoney(statementTotals.charges, currency)}</td>
                    <td className="akiva-financial-value px-3 py-2 text-right">{formatMoney(statementTotals.credits, currency)}</td>
                    <td className="akiva-financial-value px-3 py-2 text-right">{formatMoney(statementTotals.allocated, currency)}</td>
                    <td className="akiva-financial-value px-3 py-2 text-right">{formatMoney(statementTotals.balance, currency)}</td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-akiva-border bg-akiva-surface-raised shadow-sm">
            <div className="grid min-w-[720px] grid-cols-5 border-b border-akiva-border bg-akiva-table-header text-xs font-semibold uppercase tracking-normal text-akiva-table-header-text">
              <div className="border-r border-akiva-border px-3 py-2 text-center">Total Balance</div>
              <div className="border-r border-akiva-border px-3 py-2 text-center">Current</div>
              <div className="border-r border-akiva-border px-3 py-2 text-center">Now Due</div>
              <div className="border-r border-akiva-border px-3 py-2 text-center">30-60 Days Overdue</div>
              <div className="px-3 py-2 text-center">Over 60 Days Overdue</div>
            </div>
            <div className="grid min-w-[720px] grid-cols-5 text-sm font-semibold text-akiva-text">
              <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.total, currency)}</div>
              <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.current, currency)}</div>
              <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.nowDue, currency)}</div>
              <div className="akiva-financial-value border-r border-akiva-border px-3 py-2 text-right">{formatMoney(aging.over30, currency)}</div>
              <div className="akiva-financial-value px-3 py-2 text-right">{formatMoney(aging.over60, currency)}</div>
            </div>
          </div>
        </div>
      )}
    </ActionPanel>
  );
}

function OrderStatusTable({
  tableId,
  orders,
  loading,
  dateFormat,
  emptyMessage,
}: {
  tableId: string;
  orders: SalesOrderStatusRow[];
  loading: boolean;
  dateFormat: string;
  emptyMessage: string;
}) {
  const columns = useMemo<AdvancedTableColumn<SalesOrderStatusRow>[]>(() => [
    { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo, width: 110 },
    {
      id: 'orderDate',
      header: 'Order Date',
      accessor: (row) => row.orderDate,
      cell: (row) => formatDisplayDate(row.orderDate, dateFormat),
      width: 125,
    },
    {
      id: 'deliveryDate',
      header: 'Delivery',
      accessor: (row) => row.deliveryDate,
      cell: (row) => formatDisplayDate(row.deliveryDate, dateFormat),
      width: 125,
    },
    {
      id: 'progress',
      header: 'Progress',
      accessor: (row) => `${row.completedLines}/${row.lineCount}`,
      cell: (row) => `${formatNumber(row.completedLines)} of ${formatNumber(row.lineCount)} lines`,
      width: 150,
    },
    {
      id: 'value',
      header: 'Value',
      accessor: (row) => row.grossTotal,
      cell: (row) => <span className="akiva-financial-value font-semibold">{formatMoney(row.grossTotal)}</span>,
      align: 'right',
      width: 150,
    },
  ], [dateFormat]);

  return (
    <AdvancedTable
      tableId={tableId}
      ariaLabel="Customer order inquiries"
      columns={columns}
      rows={orders}
      rowKey={(row) => row.orderNo}
      emptyMessage={emptyMessage}
      loading={loading}
      loadingMessage="Loading order inquiries..."
      density="compact"
      initialPageSize={12}
      maxTableHeight="520px"
      showSearch
      searchPlaceholder="Search orders"
    />
  );
}

function OrderInquiriesPage({
  orders,
  loading,
  dateFormat,
}: {
  orders: SalesOrderStatusRow[];
  loading: boolean;
  dateFormat: string;
}) {
  return (
    <ActionPanel actionId="order-inquiries">
      <OrderStatusTable
        tableId="customer-workspace-order-status"
        orders={orders}
        loading={loading}
        dateFormat={dateFormat}
        emptyMessage="No orders found for this customer."
      />
    </ActionPanel>
  );
}

function OutstandingOrdersPage({
  orders,
  loading,
  dateFormat,
}: {
  orders: SalesOutstandingOrder[];
  loading: boolean;
  dateFormat: string;
}) {
  const columns = useMemo<AdvancedTableColumn<SalesOutstandingOrder>[]>(() => [
    { id: 'orderNo', header: 'Order', accessor: (row) => row.orderNo, width: 110 },
    {
      id: 'orderDate',
      header: 'Order Date',
      accessor: (row) => row.orderDate,
      cell: (row) => formatDisplayDate(row.orderDate, dateFormat),
      width: 125,
    },
    {
      id: 'deliveryDate',
      header: 'Delivery',
      accessor: (row) => row.deliveryDate,
      cell: (row) => formatDisplayDate(row.deliveryDate, dateFormat),
      width: 125,
    },
    {
      id: 'lines',
      header: 'Outstanding',
      accessor: (row) => row.outstandingLines,
      cell: (row) => `${formatNumber(row.outstandingLines)} lines / ${formatNumber(row.outstandingQty, 2)} qty`,
      minWidth: 170,
    },
    {
      id: 'value',
      header: 'Value',
      accessor: (row) => row.grossTotal,
      cell: (row) => <span className="akiva-financial-value font-semibold">{formatMoney(row.grossTotal)}</span>,
      align: 'right',
      width: 150,
    },
  ], [dateFormat]);

  return (
    <ActionPanel actionId="outstanding-sales-orders">
      <AdvancedTable
        tableId="customer-workspace-outstanding-orders"
        ariaLabel="Customer outstanding sales orders"
        columns={columns}
        rows={orders}
        rowKey={(row) => row.orderNo}
        emptyMessage="No outstanding sales orders found for this customer."
        loading={loading}
        loadingMessage="Loading outstanding orders..."
        density="compact"
        initialPageSize={12}
        maxTableHeight="520px"
        showSearch
        searchPlaceholder="Search outstanding orders"
      />
    </ActionPanel>
  );
}

function CustomerPurchasesPage({
  transactions,
  orders,
  loading,
  dateFormat,
}: {
  transactions: SalesTransaction[];
  orders: SalesOrderStatusRow[];
  loading: boolean;
  dateFormat: string;
}) {
  const invoiceRows = transactions.filter((row) => row.transType === 10);
  const invoiceTotal = invoiceRows.reduce((sum, row) => sum + row.grossTotal, 0);
  const orderTotal = orders.reduce((sum, row) => sum + row.grossTotal, 0);

  return (
    <ActionPanel actionId="customer-purchases">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <InfoTile label="Invoice total" value={loading ? 'Loading...' : formatMoney(invoiceTotal)} />
        <InfoTile label="Invoices" value={loading ? 'Loading...' : formatNumber(invoiceRows.length)} />
        <InfoTile label="Order value" value={loading ? 'Loading...' : formatMoney(orderTotal)} />
      </div>
      <OrderStatusTable
        tableId="customer-workspace-purchases-orders"
        orders={orders}
        loading={loading}
        dateFormat={dateFormat}
        emptyMessage="No order value found for this customer."
      />
    </ActionPanel>
  );
}

function AllocationPage({ transactions, loading, dateFormat }: { transactions: SalesTransaction[]; loading: boolean; dateFormat: string }) {
  const allocationRows = transactions.filter((row) => !row.settled || row.transType === 11 || row.transType === 12);
  const columns = useMemo<AdvancedTableColumn<SalesTransaction>[]>(() => [
    {
      id: 'date',
      header: 'Date',
      accessor: (row) => row.transactionDate,
      cell: (row) => formatDisplayDate(row.transactionDate, dateFormat),
      width: 120,
    },
    { id: 'type', header: 'Type', accessor: (row) => transactionTypeLabel(row.transType), width: 130 },
    { id: 'reference', header: 'Reference', accessor: (row) => row.reference || row.transNo || '-', minWidth: 160 },
    {
      id: 'amount',
      header: 'Amount',
      accessor: (row) => row.grossTotal,
      cell: (row) => <span className="akiva-financial-value font-semibold">{formatMoney(row.grossTotal)}</span>,
      align: 'right',
      width: 150,
    },
  ], [dateFormat]);

  return (
    <ActionPanel actionId="allocate-receipts">
      <AdvancedTable
        tableId="customer-workspace-allocations"
        ariaLabel="Customer allocation candidates"
        columns={columns}
        rows={allocationRows}
        rowKey={(row) => `${row.transType}-${row.transNo}-${row.reference}`}
        emptyMessage="No receipts, credits, or open transactions found."
        loading={loading}
        loadingMessage="Loading allocation candidates..."
        density="compact"
        initialPageSize={12}
        maxTableHeight="520px"
        showSearch
        searchPlaceholder="Search allocation candidates"
      />
    </ActionPanel>
  );
}

function StatementDispatchPage({
  actionId,
  customer,
}: {
  actionId: 'print-statement' | 'email-statement';
  customer: SalesCustomer | null;
}) {
  return (
    <ActionPanel actionId={actionId}>
      {!customer ? (
        <EmptyPanel title="No customer selected" detail="Choose a customer before preparing a statement." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-akiva-text-muted">Statement date</span>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-akiva-text-muted">Statement format</span>
              <select className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent">
                <option>Detailed</option>
                <option>Summary</option>
                <option>Open items only</option>
              </select>
            </label>
            {actionId === 'email-statement' ? (
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase text-akiva-text-muted">Email to</span>
                <input defaultValue={customer.email} className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
              </label>
            ) : null}
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase text-akiva-text-muted">Message</span>
              <textarea rows={4} className="mt-1 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
            </label>
          </div>
          <div className="rounded-xl border border-akiva-border bg-akiva-surface p-4">
            <p className="text-xs font-semibold uppercase text-akiva-text-muted">Prepared for</p>
            <p className="mt-2 text-lg font-semibold text-akiva-text">{customer.customerName}</p>
            <p className="mt-1 text-sm text-akiva-text-muted">{customer.debtorNo} / {customer.branchCode || '-'}</p>
            <button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-akiva-accent px-4 text-sm font-semibold text-white transition hover:bg-akiva-accent-strong">
              {actionId === 'print-statement' ? <Printer className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {actionId === 'print-statement' ? 'Prepare Print' : 'Prepare Email'}
            </button>
          </div>
        </div>
      )}
    </ActionPanel>
  );
}

function SimpleFormPage({
  actionId,
  customer,
}: {
  actionId: CustomerActionId;
  customer: SalesCustomer | null;
}) {
  const isAddCustomer = actionId === 'add-customer';
  const isCounterSale = actionId === 'counter-sale';
  const isBranch = actionId === 'customer-branches';
  const isContact = actionId === 'add-contact';
  const isNote = actionId === 'add-note';
  const isPricing = actionId === 'special-prices';
  const isEdi = actionId === 'edi-configuration';
  const isLogin = actionId === 'login-configuration';

  return (
    <ActionPanel actionId={actionId}>
      {!customer && !isAddCustomer ? (
        <EmptyPanel title="No customer selected" detail="Choose a customer before opening this action." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-akiva-text-muted">Customer code</span>
              <input defaultValue={isAddCustomer ? '' : customer?.debtorNo ?? ''} className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-akiva-text-muted">Customer name</span>
              <input defaultValue={isAddCustomer ? '' : customer?.customerName ?? ''} className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
            </label>
            {isCounterSale ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Customer reference</span>
                  <input className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Stock item</span>
                  <input className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Quantity</span>
                  <input type="number" min="1" defaultValue="1" className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Unit price</span>
                  <input type="number" min="0" className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
              </>
            ) : null}
            {isBranch ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Branch code</span>
                  <input defaultValue={customer?.branchCode ?? ''} className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Branch name</span>
                  <input defaultValue={customer?.branchName ?? ''} className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
              </>
            ) : null}
            {isPricing ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Item code</span>
                  <input className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Special price</span>
                  <input type="number" min="0" className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
              </>
            ) : null}
            {isContact ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Contact name</span>
                  <input className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Contact email</span>
                  <input type="email" defaultValue={customer?.email ?? ''} className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
              </>
            ) : null}
            {isEdi || isLogin ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">{isEdi ? 'Document channel' : 'Login status'}</span>
                  <select className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent">
                    <option>{isEdi ? 'Email' : 'Enabled'}</option>
                    <option>{isEdi ? 'Portal' : 'Disabled'}</option>
                    <option>{isEdi ? 'EDI gateway' : 'Invitation pending'}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">{isEdi ? 'Destination' : 'Access group'}</span>
                  <input defaultValue={isEdi ? customer?.email ?? '' : 'Customer'} className="mt-1 h-10 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
                </label>
              </>
            ) : null}
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase text-akiva-text-muted">{isNote ? 'Note' : 'Address / details'}</span>
              <textarea defaultValue={isNote ? '' : customer?.address ?? ''} rows={5} className="mt-1 w-full rounded-xl border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent" />
            </label>
          </div>
          <div className="rounded-xl border border-akiva-border bg-akiva-surface p-4">
            <p className="text-xs font-semibold uppercase text-akiva-text-muted">Action context</p>
            <p className="mt-2 text-lg font-semibold text-akiva-text">{isAddCustomer ? 'New customer' : customer?.customerName}</p>
            <p className="mt-1 text-sm text-akiva-text-muted">
              {isAddCustomer ? 'Create customer record' : `${customer?.debtorNo ?? '-'} / ${customer?.branchCode ?? '-'}`}
            </p>
            <button className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-akiva-accent px-4 text-sm font-semibold text-white transition hover:bg-akiva-accent-strong">
              <PenLine className="h-4 w-4" />
              Save Draft
            </button>
          </div>
        </div>
      )}
    </ActionPanel>
  );
}

function CustomerActionContent({
  activeAction,
  selectedCustomer,
  data,
  dataLoading,
  openAction,
  onRefreshData,
  dateFormat,
}: {
  activeAction: CustomerActionId;
  selectedCustomer: SalesCustomer | null;
  data: CustomerWorkspaceData;
  dataLoading: boolean;
  openAction: (actionId: CustomerActionId) => void;
  onRefreshData: () => void;
  dateFormat: string;
}) {
  if (activeAction === 'workspace') {
    return <WorkspaceOverview selectedCustomer={selectedCustomer} data={data} dataLoading={dataLoading} openAction={openAction} dateFormat={dateFormat} />;
  }

  if (activeAction === 'customer-details') return <CustomerDetailsPage customer={selectedCustomer} dateFormat={dateFormat} />;
  if (activeAction === 'transaction-inquiries') {
    return (
      <TransactionInquiryPage
        customer={selectedCustomer}
        transactions={data.transactions}
        loading={dataLoading}
        dateFormat={dateFormat}
        onRefresh={onRefreshData}
      />
    );
  }
  if (activeAction === 'account-statement') {
    return <AccountStatementPage customer={selectedCustomer} transactions={data.transactions} loading={dataLoading} dateFormat={dateFormat} />;
  }
  if (activeAction === 'order-inquiries') {
    return <OrderInquiriesPage orders={data.orderStatus} loading={dataLoading} dateFormat={dateFormat} />;
  }
  if (activeAction === 'customer-purchases') {
    return <CustomerPurchasesPage transactions={data.transactions} orders={data.orderStatus} loading={dataLoading} dateFormat={dateFormat} />;
  }
  if (activeAction === 'outstanding-sales-orders') {
    return <OutstandingOrdersPage orders={data.outstandingOrders} loading={dataLoading} dateFormat={dateFormat} />;
  }
  if (activeAction === 'allocate-receipts') {
    return <AllocationPage transactions={data.transactions} loading={dataLoading} dateFormat={dateFormat} />;
  }
  if (activeAction === 'print-statement' || activeAction === 'email-statement') {
    return <StatementDispatchPage actionId={activeAction} customer={selectedCustomer} />;
  }

  return <SimpleFormPage actionId={activeAction} customer={selectedCustomer} />;
}

interface CustomerWorkspaceProps {
  modal?: boolean;
}

export function CustomerWorkspace({ modal = false }: CustomerWorkspaceProps = {}) {
  const [activeAction, setActiveAction] = useState<CustomerActionId>(() => (modal ? 'workspace' : actionFromPath(window.location.pathname)));
  const [menuSide, setMenuSide] = useState<CustomerMenuSide>('right');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<SalesCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<SalesCustomer | null>(null);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [data, setData] = useState<CustomerWorkspaceData>({
    transactions: [],
    outstandingOrders: [],
    orderStatus: [],
  });
  const dateFormat = useSystemDateFormat();

  useEffect(() => {
    if (modal) return undefined;

    const syncActionFromPath = () => setActiveAction(actionFromPath(window.location.pathname));
    window.addEventListener('popstate', syncActionFromPath);
    window.addEventListener(NAVIGATION_EVENT, syncActionFromPath);
    return () => {
      window.removeEventListener('popstate', syncActionFromPath);
      window.removeEventListener(NAVIGATION_EVENT, syncActionFromPath);
    };
  }, [modal]);

  const loadCustomers = useCallback(async (query: string) => {
    setLoadingCustomers(true);
    try {
      const rows = await fetchSalesCustomers(query);
      setCustomers(rows);
      setSelectedCustomer((current) => current ?? rows[0] ?? null);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCustomers(customerSearch.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [customerSearch, loadCustomers]);

  useEffect(() => {
    if (!selectedCustomer) {
      setData({ transactions: [], outstandingOrders: [], orderStatus: [] });
      return;
    }

    let active = true;
    setDataLoading(true);

    Promise.all([
      fetchSalesTransactions(1000, selectedCustomer.debtorNo),
      fetchOutstandingSalesOrders(selectedCustomer.debtorNo),
      fetchSalesOrderStatus(selectedCustomer.debtorNo),
    ])
      .then(([transactions, outstandingOrders, orderStatus]) => {
        if (!active) return;
        const debtorNo = selectedCustomer.debtorNo;
        setData({
          transactions: transactions.filter((row) => row.debtorNo === debtorNo),
          outstandingOrders: outstandingOrders.filter((row) => row.debtorNo === debtorNo),
          orderStatus: orderStatus.filter((row) => row.debtorNo === debtorNo),
        });
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dataRefreshKey, selectedCustomer]);

  const openAction = (actionId: CustomerActionId) => {
    setActiveAction(actionId);
    if (!modal) {
      navigateToPath(actionPath(actionId));
    }
  };

  const activeActionDefinition = CUSTOMER_ACTION_LOOKUP.get(activeAction) ?? CUSTOMER_ACTION_LOOKUP.get('workspace')!;
  const workspaceHeader = (
    <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CustomerWorkspaceBadge icon={Users}>Customers</CustomerWorkspaceBadge>
            <CustomerWorkspaceBadge icon={activeActionDefinition.icon}>{activeActionDefinition.label}</CustomerWorkspaceBadge>
            {selectedCustomer ? (
              <CustomerWorkspaceBadge icon={Building2}>{selectedCustomer.debtorNo}</CustomerWorkspaceBadge>
            ) : null}
          </div>
          {!modal ? (
            <>
              <h1 className="mt-4 akiva-page-title">Customer Workspace</h1>
              <p className="akiva-page-subtitle">Customer search, selected account context, and related customer actions.</p>
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void loadCustomers(customerSearch.trim())}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
          aria-label="Refresh customers"
          title="Refresh customers"
        >
          <RefreshCw className={`h-4 w-4 ${loadingCustomers || dataLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
  const workspaceSearch = (
    <CustomerSearchStrip
      customers={customers}
      customerSearch={customerSearch}
      selectedCustomer={selectedCustomer}
      loadingCustomers={loadingCustomers}
      onSearchChange={setCustomerSearch}
      onSelectCustomer={setSelectedCustomer}
      onRefresh={() => void loadCustomers(customerSearch.trim())}
    />
  );
  const navigation = (
    <ActionNavigation
      activeAction={activeAction}
      onOpenAction={openAction}
      menuSide={menuSide}
      onMenuSideChange={setMenuSide}
    />
  );
  const content = (
    <CustomerActionContent
      activeAction={activeAction}
      selectedCustomer={selectedCustomer}
      data={data}
      dataLoading={dataLoading}
      openAction={openAction}
      onRefreshData={() => setDataRefreshKey((current) => current + 1)}
      dateFormat={dateFormat}
    />
  );

  if (modal) {
    return (
      <section className="flex h-full min-h-0 overflow-hidden bg-akiva-surface-raised text-akiva-text">
        {menuSide === 'left' ? navigation : null}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {workspaceHeader}
          {workspaceSearch}
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
            {content}
          </div>
        </div>
        {menuSide === 'right' ? navigation : null}
      </section>
    );
  }

  return (
    <div className="akiva-page-shell px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1560px]">
        <section className="akiva-frame overflow-visible rounded-[28px] backdrop-blur">
          {workspaceHeader}
          {workspaceSearch}
          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[330px_minmax(0,1fr)] lg:px-8 lg:py-7">
            {navigation}
            {content}
          </div>
        </section>
      </div>
    </div>
  );
}

export function CustomerWorkspaceModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openModal = () => setOpen(true);
    window.addEventListener(CUSTOMER_WORKSPACE_MODAL_EVENT, openModal);
    return () => window.removeEventListener(CUSTOMER_WORKSPACE_MODAL_EVENT, openModal);
  }, []);

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Customers" size="2xl" bodyClassName="flex-1 overflow-hidden p-0">
      <CustomerWorkspace modal />
    </Modal>
  );
}
