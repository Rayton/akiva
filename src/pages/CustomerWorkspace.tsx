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
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import {
  fetchOutstandingSalesOrders,
  fetchSalesCustomers,
  fetchSalesOrderStatus,
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

function selectedCustomerLabel(customer: SalesCustomer): string {
  return `${customer.customerName} (${customer.debtorNo}${customer.branchCode ? ` / ${customer.branchCode}` : ''})`;
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
}: {
  actionId: CustomerActionId;
  children: ReactNode;
}) {
  const action = CUSTOMER_ACTION_LOOKUP.get(actionId) ?? CUSTOMER_ACTION_LOOKUP.get('workspace')!;
  const Icon = action.icon;

  return (
    <section className="rounded-xl border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2.5 border-b border-akiva-border pb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-akiva-border bg-akiva-surface-muted text-akiva-accent-text">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-akiva-text">{action.label}</h2>
          <p className="mt-0.5 text-xs leading-5 text-akiva-text-muted">{action.detail}</p>
        </div>
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
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <SearchableSelect
                value={selectedCustomer ? customerKey(selectedCustomer) : ''}
                onChange={(value) => {
                  const nextCustomer = selectCustomers.find((customer) => customerKey(customer) === value);
                  if (nextCustomer) onSelectCustomer(nextCustomer);
                }}
                options={selectCustomers.map((customer) => ({
                  value: customerKey(customer),
                  label: selectedCustomerLabel(customer),
                  searchText: [
                    customer.customerName,
                    customer.debtorNo,
                    customer.branchCode,
                    customer.branchName,
                    customer.phone,
                    customer.email,
                    customer.address ?? '',
                  ].join(' '),
                }))}
                onSearchChange={onSearchChange}
                className="pl-9"
                inputClassName="h-11"
                panelClassName="z-[160]"
                placeholder="Search name, code, branch, phone, or email"
              />
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

function CustomerDetailsPage({ customer }: { customer: SalesCustomer | null }) {
  return (
    <ActionPanel actionId="customer-details">
      {!customer ? (
        <EmptyPanel title="No customer selected" detail="Choose a customer to view the master record." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <InfoTile label="Customer name" value={customer.customerName} />
          <InfoTile label="Customer code" value={customer.debtorNo} />
          <InfoTile label="Branch" value={`${customer.branchCode || '-'} ${customer.branchName ? `- ${customer.branchName}` : ''}`} />
          <InfoTile label="Phone" value={customer.phone || '-'} />
          <InfoTile label="Email" value={customer.email || '-'} />
          <InfoTile label="Address" value={customer.address || '-'} />
          <InfoTile label="Sales type" value={customer.salesType || '-'} />
          <InfoTile label="Payment terms" value={customer.paymentTerms || '-'} />
          <InfoTile label="Default location" value={customer.defaultLocation || '-'} />
          <InfoTile label="Default shipper" value={customer.defaultShipperId ? String(customer.defaultShipperId) : '-'} />
        </div>
      )}
    </ActionPanel>
  );
}

function TransactionInquiryPage({
  transactions,
  loading,
  dateFormat,
}: {
  transactions: SalesTransaction[];
  loading: boolean;
  dateFormat: string;
}) {
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
      cell: (row) => <span className="akiva-financial-value font-semibold">{formatMoney(row.grossTotal)}</span>,
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
  ], [dateFormat]);

  return (
    <ActionPanel actionId="transaction-inquiries">
      <AdvancedTable
        tableId="customer-workspace-transactions"
        ariaLabel="Customer transactions"
        columns={columns}
        rows={transactions}
        rowKey={(row) => `${row.transType}-${row.transNo}-${row.reference}`}
        emptyMessage="No transactions found for this customer."
        loading={loading}
        loadingMessage="Loading customer transactions..."
        density="compact"
        initialPageSize={12}
        maxTableHeight="520px"
        showSearch
        searchPlaceholder="Search reference, order, amount, or status"
      />
    </ActionPanel>
  );
}

function AccountStatementPage({
  transactions,
  loading,
  dateFormat,
}: {
  transactions: SalesTransaction[];
  loading: boolean;
  dateFormat: string;
}) {
  const statementRows = useMemo(() => {
    let runningBalance = 0;
    return [...transactions]
      .sort((first, second) => String(first.transactionDate).localeCompare(String(second.transactionDate)))
      .map((row) => {
        runningBalance += row.grossTotal;
        return {
          ...row,
          debit: row.grossTotal >= 0 ? row.grossTotal : 0,
          credit: row.grossTotal < 0 ? Math.abs(row.grossTotal) : 0,
          runningBalance,
        };
      });
  }, [transactions]);

  const columns = useMemo<AdvancedTableColumn<(typeof statementRows)[number]>[]>(() => [
    {
      id: 'date',
      header: 'Date',
      accessor: (row) => row.transactionDate,
      cell: (row) => formatDisplayDate(row.transactionDate, dateFormat),
      width: 120,
    },
    { id: 'document', header: 'Document', accessor: (row) => `${transactionTypeLabel(row.transType)} ${row.reference || row.transNo}`, minWidth: 190 },
    {
      id: 'debit',
      header: 'Debit',
      accessor: (row) => row.debit,
      cell: (row) => <span className="akiva-financial-value">{row.debit ? formatMoney(row.debit) : '-'}</span>,
      align: 'right',
      width: 140,
    },
    {
      id: 'credit',
      header: 'Credit',
      accessor: (row) => row.credit,
      cell: (row) => <span className="akiva-financial-value">{row.credit ? formatMoney(row.credit) : '-'}</span>,
      align: 'right',
      width: 140,
    },
    {
      id: 'balance',
      header: 'Balance',
      accessor: (row) => row.runningBalance,
      cell: (row) => <span className="akiva-financial-value font-semibold">{formatMoney(row.runningBalance)}</span>,
      align: 'right',
      width: 150,
    },
  ], [dateFormat]);

  return (
    <ActionPanel actionId="account-statement">
      <AdvancedTable
        tableId="customer-workspace-statement"
        ariaLabel="Customer account statement"
        columns={columns}
        rows={statementRows}
        rowKey={(row) => `${row.transType}-${row.transNo}-${row.transactionDate}`}
        emptyMessage="No statement rows found for this customer."
        loading={loading}
        loadingMessage="Loading statement..."
        density="compact"
        initialPageSize={14}
        maxTableHeight="560px"
        showSearch
        searchPlaceholder="Search statement rows"
      />
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
  dateFormat,
}: {
  activeAction: CustomerActionId;
  selectedCustomer: SalesCustomer | null;
  data: CustomerWorkspaceData;
  dataLoading: boolean;
  openAction: (actionId: CustomerActionId) => void;
  dateFormat: string;
}) {
  if (activeAction === 'workspace') {
    return <WorkspaceOverview selectedCustomer={selectedCustomer} data={data} dataLoading={dataLoading} openAction={openAction} dateFormat={dateFormat} />;
  }

  if (activeAction === 'customer-details') return <CustomerDetailsPage customer={selectedCustomer} />;
  if (activeAction === 'transaction-inquiries') {
    return <TransactionInquiryPage transactions={data.transactions} loading={dataLoading} dateFormat={dateFormat} />;
  }
  if (activeAction === 'account-statement') {
    return <AccountStatementPage transactions={data.transactions} loading={dataLoading} dateFormat={dateFormat} />;
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
      fetchSalesTransactions(250, selectedCustomer.debtorNo),
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
  }, [selectedCustomer]);

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
