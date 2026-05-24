import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CreditCard,
  FileText,
  Mail,
  Phone,
  ReceiptText,
  Search,
  Users,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
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
}

interface BillRow {
  id: number;
  bill_number?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  status?: string | null;
  total?: number | string | null;
  amount_paid?: number | string | null;
  amount_due?: number | string | null;
  supplier?: {
    name?: string | null;
    supplier_code?: string | null;
  } | null;
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
}

interface AccountsPayableProps {
  sourceSlug?: string;
  sourceCaption?: string;
}

type PayablesView =
  | 'overview'
  | 'select-supplier'
  | 'allocations'
  | 'aging'
  | 'payment-run'
  | 'remittances'
  | 'outstanding-grns'
  | 'prior-balances'
  | 'daily-transactions'
  | 'supplier-transactions'
  | 'add-supplier'
  | 'factor-companies';

interface AgingRow {
  bucket: string;
  amount: number;
}

const viewCopy: Record<PayablesView, { title: string; description: string; searchPlaceholder: string }> = {
  overview: {
    title: 'Accounts Payable',
    description: 'Modern bill capture, approval and payment tracking.',
    searchPlaceholder: 'Search suppliers...',
  },
  'select-supplier': {
    title: 'Select Supplier',
    description: 'Find supplier accounts, contact details, and payable status.',
    searchPlaceholder: 'Search supplier name or code...',
  },
  allocations: {
    title: 'Supplier Allocations',
    description: 'Review open supplier bills and payment allocation status.',
    searchPlaceholder: 'Search bill, supplier, or status...',
  },
  aging: {
    title: 'Aged Suppliers',
    description: 'Outstanding supplier balances grouped by due-age bucket.',
    searchPlaceholder: 'Search aging buckets...',
  },
  'payment-run': {
    title: 'Payment Run Report',
    description: 'Open bills that are due or ready for the next supplier payment run.',
    searchPlaceholder: 'Search bill, supplier, or status...',
  },
  remittances: {
    title: 'Remittance Advices',
    description: 'Supplier balances and bill references for remittance review.',
    searchPlaceholder: 'Search supplier or bill reference...',
  },
  'outstanding-grns': {
    title: 'Outstanding GRNs',
    description: 'Supplier payable items awaiting goods receipt or invoice matching.',
    searchPlaceholder: 'Search supplier or bill reference...',
  },
  'prior-balances': {
    title: 'Supplier Balances At A Prior Month End',
    description: 'Supplier account balances and credit terms for period-end review.',
    searchPlaceholder: 'Search supplier name or code...',
  },
  'daily-transactions': {
    title: 'List Daily Transactions',
    description: 'Recent supplier bill activity and payable movements.',
    searchPlaceholder: 'Search bill, supplier, or status...',
  },
  'supplier-transactions': {
    title: 'Supplier Transaction Inquiries',
    description: 'Supplier account lookup for payable transaction inquiry.',
    searchPlaceholder: 'Search supplier name or code...',
  },
  'add-supplier': {
    title: 'Add Supplier',
    description: 'Supplier master records available for payable processing.',
    searchPlaceholder: 'Search supplier name or code...',
  },
  'factor-companies': {
    title: 'Maintain Factor Companies',
    description: 'Supplier financing relationships and factor company references.',
    searchPlaceholder: 'Search supplier or factor reference...',
  },
};

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolvePayablesView(sourceSlug = '', sourceCaption = ''): PayablesView {
  const key = normalizedKey(`${sourceSlug} ${sourceCaption}`);

  if (key.includes('supplierallocations')) return 'allocations';
  if (key.includes('agedsuppliers') || key.includes('agedsupplier')) return 'aging';
  if (key.includes('supppaymentrun') || key.includes('paymentrun')) return 'payment-run';
  if (key.includes('pdfremittanceadvice') || key.includes('remittance')) return 'remittances';
  if (key.includes('outstandinggrn')) return 'outstanding-grns';
  if (key.includes('supplierbalsatperiodend') || key.includes('priorsupplierbalances')) return 'prior-balances';
  if (key.includes('pdfsupptranslisting') || key.includes('supplierdailytransactions') || key.includes('listdailytransactions')) return 'daily-transactions';
  if (key.includes('suppliertransinquiry') || key.includes('suppliertransactions')) return 'supplier-transactions';
  if (key.includes('addsupplier')) return 'add-supplier';
  if (key.includes('factorcompanies') || key.includes('factors')) return 'factor-companies';
  if (key.includes('selectsupplier') || key.includes('supplierselect') || key.includes('suppliermaintenance')) return 'select-supplier';

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
  if (!value) return '-';
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

function matchesQuery(values: Array<string | number | null | undefined>, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return values.some((value) => String(value ?? '').toLowerCase().includes(needle));
}

export function AccountsPayable({ sourceSlug = 'payables', sourceCaption = '' }: AccountsPayableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [agingRows, setAgingRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const view = resolvePayablesView(sourceSlug, sourceCaption);
  const copy = viewCopy[view];

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await apiFetch(buildApiUrl(`/api/payables${searchTerm ? `?q=${encodeURIComponent(searchTerm)}` : ''}`));
        const res = (await response.json()) as { success: boolean; data: ApiPayload; message?: string };
        if (!res.success) throw new Error(res.message || 'Accounts payable data could not be loaded.');

        if (!cancelled) {
          setPayload(res.data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Accounts payable data could not be loaded.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (view !== 'aging') return;

      try {
        const response = await apiFetch(buildApiUrl('/api/payables/reports/aging'));
        const res = (await response.json()) as { success: boolean; data: Record<string, number> };
        if (!res.success || cancelled) return;

        setAgingRows([
          { bucket: 'Current', amount: asNumber(res.data.current) },
          { bucket: '1-30 Days', amount: asNumber(res.data.days_1_30) },
          { bucket: '31-60 Days', amount: asNumber(res.data.days_31_60) },
          { bucket: '61-90 Days', amount: asNumber(res.data.days_61_90) },
          { bucket: '91+ Days', amount: asNumber(res.data.days_91_plus) },
        ]);
      } catch {
        if (!cancelled) setAgingRows([]);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [view]);

  const suppliers = payload?.suppliers ?? [];
  const bills = payload?.upcoming ?? [];
  const summary = payload?.summary;

  const supplierRows = useMemo(
    () =>
      suppliers.filter((supplier) =>
        matchesQuery([supplier.name, supplier.supplier_code, supplier.email, supplier.phone, supplier.payment_term_code], searchTerm)
      ),
    [searchTerm, suppliers]
  );

  const billRows = useMemo(
    () =>
      bills.filter((bill) =>
        matchesQuery(
          [bill.bill_number, bill.status, bill.supplier?.name, bill.supplier?.supplier_code, bill.amount_due, bill.due_date],
          searchTerm
        )
      ),
    [bills, searchTerm]
  );

  const filteredAgingRows = useMemo(
    () => agingRows.filter((row) => matchesQuery([row.bucket, row.amount], searchTerm)),
    [agingRows, searchTerm]
  );

  const supplierColumns = useMemo(
    () => [
      { key: 'name', header: 'Supplier Name', className: 'font-medium' },
      { key: 'supplier_code', header: 'Code' },
      {
        key: 'email',
        header: 'Email',
        render: (value: string) => (
          <div className="flex items-center">
            <Mail className="mr-2 h-4 w-4 text-gray-400" />
            <span className="text-sm">{value || '-'}</span>
          </div>
        ),
      },
      {
        key: 'phone',
        header: 'Phone',
        render: (value: string) => (
          <div className="flex items-center">
            <Phone className="mr-2 h-4 w-4 text-gray-400" />
            <span className="text-sm">{value || '-'}</span>
          </div>
        ),
      },
      {
        key: 'active',
        header: 'Status',
        render: (value: boolean | number) => (
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${value ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>
            {value ? 'Active' : 'Inactive'}
          </span>
        ),
      },
    ],
    []
  );

  const billColumns = useMemo(
    () => [
      {
        key: 'supplier',
        header: 'Supplier',
        render: (_value: unknown, row: BillRow) => (
          <div>
            <div className="font-medium">{row.supplier?.name ?? '-'}</div>
            <div className="text-xs text-akiva-text-muted">{row.supplier?.supplier_code ?? ''}</div>
          </div>
        ),
      },
      { key: 'bill_number', header: 'Bill #' },
      { key: 'bill_date', header: 'Bill Date', render: (value: string) => formatDate(value) },
      { key: 'due_date', header: 'Due Date', render: (value: string) => formatDate(value) },
      { key: 'total', header: 'Total', render: (value: number | string) => formatMoney(value) },
      { key: 'amount_due', header: 'Amount Due', render: (value: number | string) => formatMoney(value) },
      {
        key: 'status',
        header: 'Status',
        render: (value: string) => (
          <div className="flex items-center">
            <AlertCircle className="mr-2 h-4 w-4 text-amber-500" />
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">{formatStatus(value)}</span>
          </div>
        ),
      },
    ],
    []
  );

  const agingColumns = useMemo(
    () => [
      { key: 'bucket', header: 'Aging Bucket', className: 'font-medium' },
      { key: 'amount', header: 'Outstanding Amount', render: (value: number) => formatMoney(value) },
    ],
    []
  );

  const balanceColumns = useMemo(
    () => [
      { key: 'name', header: 'Supplier Name', className: 'font-medium' },
      { key: 'supplier_code', header: 'Code' },
      { key: 'currency_code', header: 'Currency' },
      { key: 'payment_term_code', header: 'Terms' },
      { key: 'credit_limit', header: 'Credit Limit', render: (value: number | string, row: SupplierRow) => formatMoney(value, row.currency_code ?? 'USD') },
    ],
    []
  );

  const tableConfig = useMemo(() => {
    if (view === 'aging') {
      return { columns: agingColumns, data: filteredAgingRows as object[], label: 'Aged supplier balances' };
    }

    if (view === 'allocations' || view === 'payment-run' || view === 'remittances' || view === 'outstanding-grns' || view === 'daily-transactions') {
      return { columns: billColumns, data: billRows as object[], label: copy.title };
    }

    if (view === 'prior-balances' || view === 'factor-companies') {
      return { columns: balanceColumns, data: supplierRows as object[], label: copy.title };
    }

    return { columns: supplierColumns, data: supplierRows as object[], label: copy.title };
  }, [agingColumns, balanceColumns, billColumns, billRows, copy.title, filteredAgingRows, supplierColumns, supplierRows, view]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="akiva-page-title">{copy.title}</h1>
        <p className="text-gray-600">{copy.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
        <Card className="text-center">
          <ReceiptText className="mx-auto mb-2 h-5 w-5 text-red-600" />
          <h3 className="mb-2 font-semibold text-gray-900">Total Payables</h3>
          <p className="text-2xl font-bold text-red-600">{formatMoney(summary?.totalPayables ?? 0)}</p>
        </Card>
        <Card className="text-center">
          <Users className="mx-auto mb-2 h-5 w-5 text-blue-600" />
          <h3 className="mb-2 font-semibold text-gray-900">Active Suppliers</h3>
          <p className="text-2xl font-bold text-blue-600">{summary?.activeSuppliers ?? 0}</p>
        </Card>
        <Card className="text-center">
          <CalendarClock className="mx-auto mb-2 h-5 w-5 text-orange-600" />
          <h3 className="mb-2 font-semibold text-gray-900">Overdue Bills</h3>
          <p className="text-2xl font-bold text-orange-600">{summary?.overdueBills ?? 0}</p>
        </Card>
        <Card className="text-center">
          <CreditCard className="mx-auto mb-2 h-5 w-5 text-purple-600" />
          <h3 className="mb-2 font-semibold text-gray-900">Due This Week</h3>
          <p className="text-2xl font-bold text-purple-600">{formatMoney(summary?.dueThisWeek ?? 0)}</p>
        </Card>
      </div>

      <Card>
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={copy.searchPlaceholder}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-akiva-text">{copy.title}</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">
              {loading ? 'Loading records...' : `${tableConfig.data.length.toLocaleString()} records`}
            </p>
          </div>
          <FileText className="h-5 w-5 text-akiva-text-muted" />
        </div>

        <Table columns={tableConfig.columns} data={tableConfig.data} ariaLabel={tableConfig.label} />
      </Card>
    </div>
  );
}
