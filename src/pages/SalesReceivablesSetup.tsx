import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, CreditCard, Loader2, Pencil, Plus, RefreshCw, Save, Search, ShoppingCart, Tags, Trash2, Users } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  deleteSalesReceivablesSetupRecord,
  fetchSalesReceivablesSetup,
  saveSalesReceivablesSetupRecord,
} from '../data/salesReceivablesSetupApi';
import type {
  CogsGlPosting,
  CreditStatus,
  CustomerType,
  DiscountMatrixRow,
  PaymentMethod,
  PaymentTerm,
  SalesArea,
  SalesGlPosting,
  SalesReceivablesSetupForm,
  SalesReceivablesSetupPayload,
  SalesReceivablesSetupTab,
  SalesPerson,
  SalesType,
} from '../types/salesReceivablesSetup';

interface SalesReceivablesSetupProps {
  initialTab?: SalesReceivablesSetupTab;
}

type SetupRow = SalesType | CustomerType | CreditStatus | PaymentTerm | PaymentMethod | SalesPerson | SalesArea | SalesGlPosting | CogsGlPosting | DiscountMatrixRow;

interface TabDefinition {
  id: SalesReceivablesSetupTab;
  label: string;
  singularLabel: string;
  title: string;
  description: string;
  addLabel: string;
  codeLabel: string;
  nameLabel: string;
  nameMaxLength: number;
  codeMaxLength?: number;
  codePlaceholder?: string;
  namePlaceholder: string;
  recordNote: string;
  usesName?: boolean;
}

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'sales-types',
    label: 'Sales Types',
    singularLabel: 'Sales Type',
    title: 'Sales Types / Price List Maintenance',
    description: 'Maintain price-list categories used by customers, orders, pricing, and sales analysis.',
    addLabel: 'Add Sales Type',
    codeLabel: 'Type Code',
    nameLabel: 'Sales Type Name',
    codeMaxLength: 2,
    codePlaceholder: 'DE',
    nameMaxLength: 40,
    namePlaceholder: 'Default Price List',
    recordNote: 'The sales type code is limited to two characters and is fixed after creation.',
  },
  {
    id: 'customer-types',
    label: 'Customer Types',
    singularLabel: 'Customer Type',
    title: 'Customer Type Setup',
    description: 'Maintain customer groupings used for customer classification, reporting, and transaction history.',
    addLabel: 'Add Customer Type',
    codeLabel: 'Type ID',
    nameLabel: 'Type Name',
    nameMaxLength: 100,
    namePlaceholder: 'Retail Customer',
    recordNote: 'The customer type ID is assigned automatically and is fixed after creation.',
  },
  {
    id: 'credit-status',
    label: 'Credit Statuses',
    singularLabel: 'Credit Status',
    title: 'Credit Status Code Maintenance',
    description: 'Maintain credit status codes used by customer accounts to allow, watch, or block invoicing.',
    addLabel: 'Add Credit Status',
    codeLabel: 'Status Code',
    nameLabel: 'Description',
    codePlaceholder: '20',
    nameMaxLength: 30,
    namePlaceholder: 'Watch',
    recordNote: 'The status code must be numeric and is fixed after creation.',
  },
  {
    id: 'payment-terms',
    label: 'Payment Terms',
    singularLabel: 'Payment Term',
    title: 'Payment Terms Maintenance',
    description: 'Maintain payment terms used by customer and supplier accounts for due date calculations.',
    addLabel: 'Add Payment Term',
    codeLabel: 'Term Code',
    nameLabel: 'Description',
    codeMaxLength: 2,
    codePlaceholder: 'CA',
    nameMaxLength: 40,
    namePlaceholder: 'Cash Only',
    recordNote: 'The term code is limited to two characters and is fixed after creation.',
  },
  {
    id: 'payment-methods',
    label: 'Payment Methods',
    singularLabel: 'Payment Method',
    title: 'Payment Methods',
    description: 'Maintain payment and receipt methods used for bank transactions, receipts, and POS settings.',
    addLabel: 'Add Payment Method',
    codeLabel: 'Method ID',
    nameLabel: 'Payment Method',
    nameMaxLength: 15,
    namePlaceholder: 'Cash',
    recordNote: 'The payment method ID is assigned automatically and the method name is used by bank transactions.',
  },
  {
    id: 'sales-people',
    label: 'Sales People',
    singularLabel: 'Salesperson',
    title: 'Sales People Maintenance',
    description: 'Maintain salesperson records used by customer branches, users, sales orders, and sales analysis.',
    addLabel: 'Add Salesperson',
    codeLabel: 'Salesperson Code',
    nameLabel: 'Salesperson Name',
    codeMaxLength: 3,
    codePlaceholder: 'JSM',
    nameMaxLength: 30,
    namePlaceholder: 'Jane Smith',
    recordNote: 'The salesperson code is limited to three characters and is fixed after creation.',
  },
  {
    id: 'areas',
    label: 'Areas',
    singularLabel: 'Area',
    title: 'Sales Area Maintenance',
    description: 'Maintain sales areas used by customer branches and sales analysis reporting.',
    addLabel: 'Add Area',
    codeLabel: 'Area Code',
    nameLabel: 'Area Name',
    codeMaxLength: 3,
    codePlaceholder: 'DAR',
    nameMaxLength: 25,
    namePlaceholder: 'Dar es Salaam',
    recordNote: 'The area code is limited to three characters and is fixed after creation.',
  },
  {
    id: 'sales-gl-postings',
    label: 'Sales GL Postings',
    singularLabel: 'Sales GL Posting',
    title: 'Sales GL Postings Set Up',
    description: 'Maintain the GL interface used to post sales and discount values by area, stock category, and sales type.',
    addLabel: 'Add Sales GL Posting',
    codeLabel: 'Posting ID',
    nameLabel: 'Posting Combination',
    nameMaxLength: 80,
    namePlaceholder: '',
    recordNote: 'Posting combinations route sales and discount values to profit and loss accounts.',
    usesName: false,
  },
  {
    id: 'cogs-gl-postings',
    label: 'COGS GL Postings',
    singularLabel: 'COGS GL Posting',
    title: 'Cost Of Sales GL Postings Set Up',
    description: 'Maintain the GL interface used to post cost of goods sold by area, stock category, and sales type.',
    addLabel: 'Add COGS GL Posting',
    codeLabel: 'Posting ID',
    nameLabel: 'Posting Combination',
    nameMaxLength: 80,
    namePlaceholder: '',
    recordNote: 'Posting combinations route cost of goods sold values to profit and loss accounts.',
    usesName: false,
  },
  {
    id: 'discount-matrix',
    label: 'Discount Matrix',
    singularLabel: 'Discount Matrix Row',
    title: 'Discount Matrix Maintenance',
    description: 'Maintain quantity-based discounts by customer price list and stock discount category.',
    addLabel: 'Add Discount Matrix Row',
    codeLabel: 'Matrix Key',
    nameLabel: 'Discount Matrix Row',
    nameMaxLength: 80,
    namePlaceholder: '',
    recordNote: 'Each row applies a percentage discount when order quantity reaches the defined break.',
    usesName: false,
  },
];

function tabDefinition(tab: SalesReceivablesSetupTab): TabDefinition {
  return TAB_DEFINITIONS.find((definition) => definition.id === tab) ?? TAB_DEFINITIONS[0];
}

function rowId(row: SetupRow): string | number {
  return 'code' in row ? row.code : row.id;
}

function isSalesGlPosting(row: SetupRow): row is SalesGlPosting {
  return 'stockCategory' in row && 'salesGlCode' in row;
}

function isCogsGlPosting(row: SetupRow): row is CogsGlPosting {
  return 'stockCategory' in row && 'cogsGlCode' in row;
}

function isDiscountMatrixRow(row: SetupRow): row is DiscountMatrixRow {
  return 'discountRatePercent' in row && 'quantityBreak' in row;
}

function rowDisplay(row: SetupRow): string {
  if (isSalesGlPosting(row) || isCogsGlPosting(row)) {
    return `${row.area} / ${row.stockCategory} / ${row.salesType}`;
  }
  if (isDiscountMatrixRow(row)) {
    return `${row.salesType} / ${row.discountCategory || 'No category'} / ${row.quantityBreak}`;
  }
  return `${rowId(row)} - ${row.name}`;
}

function emptyForm(): SalesReceivablesSetupForm {
  return {
    code: '',
    name: '',
    disallowInvoices: 0,
    dueMode: 'days',
    dayNumber: 1,
    paymentType: true,
    receiptType: true,
    usePreprintedStationery: false,
    openCashDrawer: false,
    percentDiscount: 0,
    telephone: '',
    fax: '',
    commissionRate1: 0,
    breakpoint: 0,
    commissionRate2: 0,
    current: true,
    area: 'AN',
    stockCategory: 'ANY',
    salesType: 'AN',
    salesGlCode: '',
    discountGlCode: '',
    cogsGlCode: '',
    discountCategory: '',
    quantityBreak: 1,
    discountRatePercent: 1,
  };
}

function formFromRow(row: SetupRow): SalesReceivablesSetupForm {
  if (isSalesGlPosting(row)) {
    return {
      ...emptyForm(),
      code: String(row.id),
      name: '',
      area: row.area,
      stockCategory: row.stockCategory,
      salesType: row.salesType,
      salesGlCode: row.salesGlCode,
      discountGlCode: row.discountGlCode,
    };
  }

  if (isCogsGlPosting(row)) {
    return {
      ...emptyForm(),
      code: String(row.id),
      name: '',
      area: row.area,
      stockCategory: row.stockCategory,
      salesType: row.salesType,
      cogsGlCode: row.cogsGlCode,
    };
  }

  if (isDiscountMatrixRow(row)) {
    return {
      ...emptyForm(),
      code: row.id,
      name: '',
      salesType: row.salesType,
      discountCategory: row.discountCategory,
      quantityBreak: row.quantityBreak,
      discountRatePercent: row.discountRatePercent,
    };
  }

  return {
    code: 'code' in row ? row.code : String(row.id),
    name: row.name,
    disallowInvoices: 'disallowInvoices' in row ? row.disallowInvoices : 0,
    dueMode: 'daysBeforeDue' in row && row.daysBeforeDue <= 0 ? 'following-month' : 'days',
    dayNumber: 'daysBeforeDue' in row ? (row.daysBeforeDue > 0 ? row.daysBeforeDue : row.dayInFollowingMonth) : 1,
    paymentType: 'paymentType' in row ? row.paymentType : true,
    receiptType: 'receiptType' in row ? row.receiptType : true,
    usePreprintedStationery: 'usePreprintedStationery' in row ? row.usePreprintedStationery : false,
    openCashDrawer: 'openCashDrawer' in row ? row.openCashDrawer : false,
    percentDiscount: 'percentDiscount' in row ? row.percentDiscount : 0,
    telephone: 'telephone' in row ? row.telephone : '',
    fax: 'fax' in row ? row.fax : '',
    commissionRate1: 'commissionRate1' in row ? row.commissionRate1 : 0,
    breakpoint: 'breakpoint' in row ? row.breakpoint : 0,
    commissionRate2: 'commissionRate2' in row ? row.commissionRate2 : 0,
    current: 'current' in row ? row.current : true,
  };
}

function rowsForTab(payload: SalesReceivablesSetupPayload | null, tab: SalesReceivablesSetupTab): SetupRow[] {
  if (!payload) return [];
  if (tab === 'sales-types') return payload.salesTypes;
  if (tab === 'customer-types') return payload.customerTypes;
  if (tab === 'credit-status') return payload.creditStatuses;
  if (tab === 'payment-terms') return payload.paymentTerms;
  if (tab === 'payment-methods') return payload.paymentMethods;
  if (tab === 'sales-people') return payload.salesPeople;
  if (tab === 'sales-gl-postings') return payload.salesGlPostings;
  if (tab === 'cogs-gl-postings') return payload.cogsGlPostings;
  if (tab === 'discount-matrix') return payload.discountMatrix;
  return payload.areas;
}

function creditStatusLabel(value: number): string {
  if (value === 1) return 'No Invoicing';
  if (value === 2) return 'Watch';
  return 'Invoice OK';
}

function deleteDescription(tab: SalesReceivablesSetupTab): string {
  if (tab === 'sales-types') return 'This price list will be removed only if customers and transactions do not use it.';
  if (tab === 'credit-status') return 'This credit status will be removed only if customer accounts do not use it.';
  if (tab === 'payment-terms') return 'This payment term will be removed only if customer and supplier accounts do not use it.';
  if (tab === 'payment-methods') return 'This payment method will be removed only if bank transactions do not use it.';
  if (tab === 'sales-people') return 'This salesperson will be removed only if branches, sales analysis, and user records do not use them.';
  if (tab === 'areas') return 'This area will be removed only if customer branches and sales analysis records do not use it.';
  if (tab === 'sales-gl-postings') return 'This posting combination will be removed from the sales GL interface.';
  if (tab === 'cogs-gl-postings') return 'This posting combination will be removed from the cost of sales GL interface.';
  if (tab === 'discount-matrix') return 'This quantity discount row will be removed from the discount matrix.';
  return 'This customer type will be removed only if customers and transactions do not use it.';
}

function paymentTermScheduleLabel(row: PaymentTerm): string {
  if (row.daysBeforeDue > 0) return `Due after ${row.daysBeforeDue} days`;
  if (row.dayInFollowingMonth > 0) return `Due on day ${row.dayInFollowingMonth} of following month`;
  return 'Not set';
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

export function SalesReceivablesSetup({ initialTab = 'sales-types' }: SalesReceivablesSetupProps) {
  const [activeTab, setActiveTab] = useState<SalesReceivablesSetupTab>(initialTab);
  const [payload, setPayload] = useState<SalesReceivablesSetupPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SetupRow | null>(null);
  const [form, setForm] = useState<SalesReceivablesSetupForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  useEffect(() => {
    setActiveTab(initialTab);
    setSearchTerm('');
  }, [initialTab]);

  const definition = tabDefinition(activeTab);

  const loadSetup = async () => {
    setLoading(true);
    setError('');
    try {
      setPayload(await fetchSalesReceivablesSetup());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Sales and receivables setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
  }, []);

  const rows = useMemo(() => rowsForTab(payload, activeTab), [activeTab, payload]);
  const stats = payload?.stats ?? {
    salesTypes: 0,
    customerTypes: 0,
    creditStatuses: 0,
    paymentTerms: 0,
    paymentMethods: 0,
    salesPeople: 0,
    areas: 0,
    salesGlPostings: 0,
    cogsGlPostings: 0,
    discountMatrix: 0,
    priceRows: 0,
    customers: 0,
    suppliers: 0,
    bankTransactions: 0,
    transactions: 0,
  };

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const searchable = [
        String(rowId(row)),
        'name' in row ? row.name : '',
        isSalesGlPosting(row) ? `${row.area} ${row.areaName} ${row.stockCategory} ${row.stockCategoryName} ${row.salesType} ${row.salesTypeName} ${row.salesGlCode} ${row.salesGlName} ${row.discountGlCode} ${row.discountGlName}` : '',
        isCogsGlPosting(row) ? `${row.area} ${row.areaName} ${row.stockCategory} ${row.stockCategoryName} ${row.salesType} ${row.salesTypeName} ${row.cogsGlCode} ${row.cogsGlName}` : '',
        isDiscountMatrixRow(row) ? `${row.salesType} ${row.salesTypeName} ${row.discountCategory} ${row.quantityBreak} ${row.discountRatePercent}` : '',
        'disallowInvoices' in row ? creditStatusLabel(row.disallowInvoices) : '',
        'daysBeforeDue' in row ? paymentTermScheduleLabel(row) : '',
        'paymentType' in row ? `${yesNo(row.paymentType)} ${yesNo(row.receiptType)} ${yesNo(row.usePreprintedStationery)} ${yesNo(row.openCashDrawer)} ${row.percentDiscount}` : '',
        'telephone' in row ? `${row.telephone} ${row.fax} ${row.commissionRate1} ${row.breakpoint} ${row.commissionRate2} ${yesNo(row.current)}` : '',
      ].join(' ');
      return searchable.toLowerCase().includes(needle);
    });
  }, [rows, searchTerm]);

  const openCreateDialog = () => {
    const nextForm = emptyForm();
    if (activeTab === 'sales-gl-postings' || activeTab === 'cogs-gl-postings') {
      const firstAccount = payload?.lookups.profitLossAccounts[0]?.code ?? '';
      nextForm.salesGlCode = firstAccount;
      nextForm.discountGlCode = firstAccount;
      nextForm.cogsGlCode = firstAccount;
    }
    if (activeTab === 'discount-matrix') {
      nextForm.salesType = payload?.salesTypes[0]?.code ?? '';
      nextForm.discountCategory = payload?.lookups.discountCategories[0]?.code ?? '';
    }
    setEditingRow(null);
    setForm(nextForm);
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (row: SetupRow) => {
    setEditingRow(row);
    setForm(formFromRow(row));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await saveSalesReceivablesSetupRecord(activeTab, form, editingRow ? rowId(editingRow) : undefined);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingRow(null);
      setForm(emptyForm());
      setMessage(response.message ?? `${definition.singularLabel} saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `${definition.singularLabel} could not be saved.`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: SetupRow) => {
    const id = rowId(row);
    const confirmed = await confirm({
      title: `Delete ${definition.singularLabel}`,
      description: deleteDescription(activeTab),
      detail: rowDisplay(row),
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setDeletingId(id);
    setError('');
    setMessage('');
    try {
      const response = await deleteSalesReceivablesSetupRecord(activeTab, id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? `${definition.singularLabel} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `${definition.singularLabel} could not be deleted.`);
    } finally {
      setDeletingId('');
    }
  };

  const columns = useMemo<AdvancedTableColumn<SetupRow>[]>(
    () => {
      const tableColumns: AdvancedTableColumn<SetupRow>[] = activeTab === 'sales-gl-postings'
        ? [
            {
              id: 'area',
              header: 'Area',
              accessor: (row) => (isSalesGlPosting(row) ? `${row.area} ${row.areaName}` : ''),
              cell: (row) => isSalesGlPosting(row) ? <span><span className="font-mono font-semibold">{row.area}</span> {row.areaName}</span> : null,
              width: 220,
            },
            {
              id: 'stockCategory',
              header: 'Stock Category',
              accessor: (row) => (isSalesGlPosting(row) ? `${row.stockCategory} ${row.stockCategoryName}` : ''),
              cell: (row) => isSalesGlPosting(row) ? <span><span className="font-mono font-semibold">{row.stockCategory}</span> {row.stockCategoryName}</span> : null,
              width: 260,
            },
            {
              id: 'salesType',
              header: 'Sales Type',
              accessor: (row) => (isSalesGlPosting(row) ? `${row.salesType} ${row.salesTypeName}` : ''),
              cell: (row) => isSalesGlPosting(row) ? <span><span className="font-mono font-semibold">{row.salesType}</span> {row.salesTypeName}</span> : null,
              width: 220,
            },
            {
              id: 'salesGlCode',
              header: 'Sales Account',
              accessor: (row) => (isSalesGlPosting(row) ? `${row.salesGlCode} ${row.salesGlName}` : ''),
              cell: (row) => isSalesGlPosting(row) ? <span><span className="font-mono font-semibold">{row.salesGlCode}</span> {row.salesGlName}</span> : null,
              width: 300,
            },
            {
              id: 'discountGlCode',
              header: 'Discount Account',
              accessor: (row) => (isSalesGlPosting(row) ? `${row.discountGlCode} ${row.discountGlName}` : ''),
              cell: (row) => isSalesGlPosting(row) ? <span><span className="font-mono font-semibold">{row.discountGlCode}</span> {row.discountGlName}</span> : null,
              width: 300,
            },
            {
              id: 'status',
              header: 'Status',
              accessor: (row) => (isSalesGlPosting(row) && row.hasInvalidAccounts ? 'Missing account' : 'Ready'),
              cell: (row) => {
                if (!isSalesGlPosting(row)) return null;
                const tone = row.hasInvalidAccounts
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
                return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{row.hasInvalidAccounts ? 'Missing account' : 'Ready'}</span>;
              },
              width: 150,
            },
          ]
        : activeTab === 'cogs-gl-postings'
          ? [
              {
                id: 'area',
                header: 'Area',
                accessor: (row) => (isCogsGlPosting(row) ? `${row.area} ${row.areaName}` : ''),
                cell: (row) => isCogsGlPosting(row) ? <span><span className="font-mono font-semibold">{row.area}</span> {row.areaName}</span> : null,
                width: 220,
              },
              {
                id: 'stockCategory',
                header: 'Stock Category',
                accessor: (row) => (isCogsGlPosting(row) ? `${row.stockCategory} ${row.stockCategoryName}` : ''),
                cell: (row) => isCogsGlPosting(row) ? <span><span className="font-mono font-semibold">{row.stockCategory}</span> {row.stockCategoryName}</span> : null,
                width: 260,
              },
              {
                id: 'salesType',
                header: 'Sales Type',
                accessor: (row) => (isCogsGlPosting(row) ? `${row.salesType} ${row.salesTypeName}` : ''),
                cell: (row) => isCogsGlPosting(row) ? <span><span className="font-mono font-semibold">{row.salesType}</span> {row.salesTypeName}</span> : null,
                width: 220,
              },
              {
                id: 'cogsGlCode',
                header: 'COGS Account',
                accessor: (row) => (isCogsGlPosting(row) ? `${row.cogsGlCode} ${row.cogsGlName}` : ''),
                cell: (row) => isCogsGlPosting(row) ? <span><span className="font-mono font-semibold">{row.cogsGlCode}</span> {row.cogsGlName}</span> : null,
                width: 320,
              },
              {
                id: 'status',
                header: 'Status',
                accessor: (row) => (isCogsGlPosting(row) && row.hasInvalidAccount ? 'Missing account' : 'Ready'),
                cell: (row) => {
                  if (!isCogsGlPosting(row)) return null;
                  const tone = row.hasInvalidAccount
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
                  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{row.hasInvalidAccount ? 'Missing account' : 'Ready'}</span>;
                },
                width: 150,
              },
            ]
          : activeTab === 'discount-matrix'
            ? [
                {
                  id: 'salesType',
                  header: 'Sales Type',
                  accessor: (row) => (isDiscountMatrixRow(row) ? `${row.salesType} ${row.salesTypeName}` : ''),
                  cell: (row) => isDiscountMatrixRow(row) ? <span><span className="font-mono font-semibold">{row.salesType}</span> {row.salesTypeName}</span> : null,
                  width: 260,
                },
                {
                  id: 'discountCategory',
                  header: 'Discount Category',
                  accessor: (row) => (isDiscountMatrixRow(row) ? row.discountCategory : ''),
                  cell: (row) => isDiscountMatrixRow(row) ? <span className="font-mono font-semibold">{row.discountCategory || 'None'}</span> : null,
                  width: 190,
                },
                {
                  id: 'quantityBreak',
                  header: 'Quantity Break',
                  accessor: (row) => (isDiscountMatrixRow(row) ? row.quantityBreak : ''),
                  width: 160,
                },
                {
                  id: 'discountRatePercent',
                  header: 'Discount Rate',
                  accessor: (row) => (isDiscountMatrixRow(row) ? row.discountRatePercent.toFixed(2) : ''),
                  cell: (row) => isDiscountMatrixRow(row) ? `${row.discountRatePercent.toFixed(2)}%` : '',
                  width: 160,
                },
              ]
        : [
            {
              id: 'id',
              header: definition.codeLabel,
              accessor: (row) => rowId(row),
              cell: (row) => <span className="font-mono font-semibold">{rowId(row)}</span>,
              width: 140,
            },
            {
              id: 'name',
              header: definition.nameLabel,
              accessor: (row) => ('name' in row ? row.name : ''),
              width: 360,
            },
          ];

      if (activeTab === 'credit-status') {
        tableColumns.push({
          id: 'disallowInvoices',
          header: 'Credit Control',
          accessor: (row) => ('disallowInvoices' in row ? creditStatusLabel(row.disallowInvoices) : ''),
          width: 190,
          cell: (row) => {
            if (!('disallowInvoices' in row)) return null;
            const tone = row.disallowInvoices === 1
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
              : row.disallowInvoices === 2
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
            return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{creditStatusLabel(row.disallowInvoices)}</span>;
          },
        });
      }

      if (activeTab === 'payment-terms') {
        tableColumns.push(
          {
            id: 'dueMode',
            header: 'Due Basis',
            accessor: (row) => ('daysBeforeDue' in row && row.daysBeforeDue > 0 ? 'Due after days' : 'Following month'),
            width: 180,
          },
          {
            id: 'dayNumber',
            header: 'Schedule',
            accessor: (row) => ('daysBeforeDue' in row ? paymentTermScheduleLabel(row) : ''),
            width: 260,
          }
        );
      }

      if (activeTab === 'payment-methods') {
        tableColumns.push(
          {
            id: 'paymentType',
            header: 'Payments',
            accessor: (row) => ('paymentType' in row ? yesNo(row.paymentType) : ''),
            width: 120,
          },
          {
            id: 'receiptType',
            header: 'Receipts',
            accessor: (row) => ('receiptType' in row ? yesNo(row.receiptType) : ''),
            width: 120,
          },
          {
            id: 'usePreprintedStationery',
            header: 'Pre-printed',
            accessor: (row) => ('usePreprintedStationery' in row ? yesNo(row.usePreprintedStationery) : ''),
            width: 140,
          },
          {
            id: 'openCashDrawer',
            header: 'Cash Drawer',
            accessor: (row) => ('openCashDrawer' in row ? yesNo(row.openCashDrawer) : ''),
            width: 140,
          },
          {
            id: 'percentDiscount',
            header: 'Discount %',
            accessor: (row) => ('percentDiscount' in row ? (row.percentDiscount * 100).toFixed(2) : ''),
            cell: (row) => ('percentDiscount' in row ? `${(row.percentDiscount * 100).toFixed(2)}%` : ''),
            width: 130,
          }
        );
      }

      if (activeTab === 'sales-people') {
        tableColumns.push(
          {
            id: 'telephone',
            header: 'Telephone',
            accessor: (row) => ('telephone' in row ? row.telephone : ''),
            width: 150,
          },
          {
            id: 'fax',
            header: 'Facsimile',
            accessor: (row) => ('fax' in row ? row.fax : ''),
            width: 150,
          },
          {
            id: 'commissionRate1',
            header: 'Comm Rate 1',
            accessor: (row) => ('commissionRate1' in row ? row.commissionRate1.toFixed(2) : ''),
            width: 140,
          },
          {
            id: 'breakpoint',
            header: 'Break',
            accessor: (row) => ('breakpoint' in row ? row.breakpoint.toFixed(2) : ''),
            width: 130,
          },
          {
            id: 'commissionRate2',
            header: 'Comm Rate 2',
            accessor: (row) => ('commissionRate2' in row ? row.commissionRate2.toFixed(2) : ''),
            width: 140,
          },
          {
            id: 'current',
            header: 'Current',
            accessor: (row) => ('current' in row ? yesNo(row.current) : ''),
            width: 120,
          }
        );
      }

      tableColumns.push({
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        sortable: false,
        filterable: false,
        width: 120,
        cell: (row) => {
          const id = rowId(row);
          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => openEditDialog(row)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text"
                title="Edit"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void deleteRow(row)}
                disabled={deletingId === id}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                title="Delete"
                aria-label="Delete"
              >
                {deletingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          );
        },
      });

      return tableColumns;
    },
    [activeTab, definition.codeLabel, definition.nameLabel, deletingId]
  );

  if (loading && !payload) {
    return (
      <div className="flex min-h-80 items-center justify-center text-akiva-text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading sales and receivables setup...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Sales/Receivables setup
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <Tags className="h-3.5 w-3.5" />
                  {definition.label}
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                {definition.title}
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">{definition.description}</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" onClick={() => void loadSetup()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={openCreateDialog} disabled={!payload}>
                <Plus className="mr-2 h-4 w-4" />
                {definition.addLabel}
              </Button>
            </div>
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

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-10">
              {[
                { key: 'sales-types', label: 'Sales Types', value: stats.salesTypes, icon: Tags },
                { key: 'customer-types', label: 'Customer Types', value: stats.customerTypes, icon: Users },
                { key: 'credit-status', label: 'Credit Statuses', value: stats.creditStatuses, icon: CheckCircle2 },
                { key: 'payment-terms', label: 'Payment Terms', value: stats.paymentTerms, icon: CalendarDays },
                { key: 'payment-methods', label: 'Payment Methods', value: stats.paymentMethods, icon: CreditCard },
                { key: 'sales-people', label: 'Sales People', value: stats.salesPeople, icon: Users },
                { key: 'areas', label: 'Areas', value: stats.areas, icon: Tags },
                { key: 'sales-gl-postings', label: 'Sales GL', value: stats.salesGlPostings, icon: CreditCard },
                { key: 'cogs-gl-postings', label: 'COGS GL', value: stats.cogsGlPostings, icon: CreditCard },
                { key: 'discount-matrix', label: 'Discounts', value: stats.discountMatrix, icon: Tags },
              ].map((stat) => {
                const Icon = stat.icon;
                const active = stat.key === activeTab;
                const content = (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-xs font-medium text-akiva-text-muted">{stat.label}</p>
                      <Icon className="h-4 w-4 text-akiva-accent" />
                    </div>
                    <p className="mt-1 text-xl font-bold text-akiva-text">{stat.value}</p>
                  </>
                );

                return (
                  <button
                    key={stat.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(stat.key as SalesReceivablesSetupTab);
                      setSearchTerm('');
                    }}
                    className={`rounded-lg border bg-akiva-surface-raised p-3 text-left shadow-sm transition hover:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent ${
                      active ? 'border-akiva-accent ring-2 ring-akiva-accent/25' : 'border-akiva-border'
                    }`}
                  >
                    {content}
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <h2 className="text-base font-semibold text-akiva-text">{definition.label}</h2>
                  <p className="mt-1 text-xs text-akiva-text-muted">{definition.recordNote}</p>
                </div>
                <div className="relative lg:w-96">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Search ${definition.label.toLowerCase()}...`}
                    className={`${inputClassName} pl-10`}
                  />
                </div>
              </div>

              <AdvancedTable
                tableId={`configuration-sales-receivables-${activeTab}`}
                columns={columns}
                rows={filteredRows}
                rowKey={(row) => String(rowId(row))}
                loading={loading}
                loadingMessage={`Loading ${definition.label.toLowerCase()}...`}
                emptyMessage={`No ${definition.label.toLowerCase()} found.`}
                initialPageSize={25}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </div>
          </div>
        </section>

        <Modal
          isOpen={dialogOpen}
          onClose={() => !saving && setDialogOpen(false)}
          title={editingRow ? `Edit ${definition.singularLabel}` : definition.addLabel}
          size="md"
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" form="sales-receivables-setup-form" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </>
          }
        >
          <form id="sales-receivables-setup-form" onSubmit={submitForm} className="space-y-4">
            {activeTab === 'sales-types' || ((activeTab === 'credit-status' || activeTab === 'payment-terms' || activeTab === 'sales-people' || activeTab === 'areas') && !editingRow) ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-akiva-text-muted">{definition.codeLabel}</span>
                <input
                  type={activeTab === 'credit-status' ? 'number' : 'text'}
                  maxLength={definition.codeMaxLength}
                  required
                  value={form.code ?? ''}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    code: activeTab === 'sales-types' || activeTab === 'sales-people' || activeTab === 'areas'
                      ? event.target.value.toUpperCase().replace(/\s+/g, '')
                      : event.target.value.replace(/\s+/g, ''),
                  }))}
                  disabled={Boolean(editingRow)}
                  className={inputClassName}
                  placeholder={definition.codePlaceholder}
                />
              </label>
            ) : editingRow ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-akiva-text-muted">{definition.codeLabel}</span>
                <input type="text" value={form.code ?? ''} disabled className={inputClassName} />
              </label>
            ) : null}

            {definition.usesName !== false ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-akiva-text-muted">{definition.nameLabel}</span>
                <input
                  type="text"
                  maxLength={definition.nameMaxLength}
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className={inputClassName}
                  placeholder={definition.namePlaceholder}
                />
              </label>
            ) : null}

            {activeTab === 'sales-gl-postings' || activeTab === 'cogs-gl-postings' ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Area</span>
                    <select
                      required
                      value={form.area ?? 'AN'}
                      onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                      className={inputClassName}
                    >
                      <option value="AN">Any Other</option>
                      {payload?.areas.map((area) => (
                        <option key={area.code} value={area.code}>
                          {area.code} - {area.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Stock Category</span>
                    <select
                      required
                      value={form.stockCategory ?? 'ANY'}
                      onChange={(event) => setForm((current) => ({ ...current, stockCategory: event.target.value }))}
                      className={inputClassName}
                    >
                      <option value="ANY">Any Other</option>
                      {payload?.lookups.stockCategories.map((category) => (
                        <option key={category.code} value={category.code}>
                          {category.code} - {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Sales Type</span>
                    <select
                      required
                      value={form.salesType ?? 'AN'}
                      onChange={(event) => setForm((current) => ({ ...current, salesType: event.target.value }))}
                      className={inputClassName}
                    >
                      <option value="AN">Any Other</option>
                      {payload?.salesTypes.map((salesType) => (
                        <option key={salesType.code} value={salesType.code}>
                          {salesType.code} - {salesType.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {activeTab === 'sales-gl-postings' ? (
                  <>
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase text-akiva-text-muted">Sales GL Account</span>
                      <select
                        required
                        value={form.salesGlCode ?? ''}
                        onChange={(event) => setForm((current) => ({ ...current, salesGlCode: event.target.value }))}
                        className={inputClassName}
                      >
                        <option value="" disabled>Select account</option>
                        {payload?.lookups.profitLossAccounts.map((account) => (
                          <option key={account.code} value={account.code}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold uppercase text-akiva-text-muted">Discount GL Account</span>
                      <select
                        required
                        value={form.discountGlCode ?? ''}
                        onChange={(event) => setForm((current) => ({ ...current, discountGlCode: event.target.value }))}
                        className={inputClassName}
                      >
                        <option value="" disabled>Select account</option>
                        {payload?.lookups.profitLossAccounts.map((account) => (
                          <option key={account.code} value={account.code}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : (
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">COGS GL Account</span>
                    <select
                      required
                      value={form.cogsGlCode ?? ''}
                      onChange={(event) => setForm((current) => ({ ...current, cogsGlCode: event.target.value }))}
                      className={inputClassName}
                    >
                      <option value="" disabled>Select account</option>
                      {payload?.lookups.profitLossAccounts.map((account) => (
                        <option key={account.code} value={account.code}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ) : null}

            {activeTab === 'discount-matrix' ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Customer Price List</span>
                    <select
                      required
                      value={form.salesType ?? ''}
                      onChange={(event) => setForm((current) => ({ ...current, salesType: event.target.value }))}
                      className={inputClassName}
                    >
                      <option value="" disabled>Select price list</option>
                      {payload?.salesTypes.map((salesType) => (
                        <option key={salesType.code} value={salesType.code}>
                          {salesType.code} - {salesType.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Discount Category</span>
                    <select
                      value={form.discountCategory ?? ''}
                      onChange={(event) => setForm((current) => ({ ...current, discountCategory: event.target.value }))}
                      className={inputClassName}
                    >
                      <option value="">No category</option>
                      {payload?.lookups.discountCategories.map((category) => (
                        <option key={category.code} value={category.code}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Quantity Break</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={form.quantityBreak ?? 1}
                      onChange={(event) => setForm((current) => ({ ...current, quantityBreak: Number(event.target.value) }))}
                      className={inputClassName}
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Discount Rate (%)</span>
                    <input
                      type="number"
                      min={0.0001}
                      max={100}
                      step={0.01}
                      required
                      value={form.discountRatePercent ?? 1}
                      onChange={(event) => setForm((current) => ({ ...current, discountRatePercent: Number(event.target.value) }))}
                      className={inputClassName}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {activeTab === 'credit-status' ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase text-akiva-text-muted">Credit Control</span>
                <select
                  required
                  value={String(form.disallowInvoices ?? 0)}
                  onChange={(event) => setForm((current) => ({ ...current, disallowInvoices: Number(event.target.value) }))}
                  className={inputClassName}
                >
                  <option value="0">Invoice OK</option>
                  <option value="1">No Invoicing</option>
                  <option value="2">Watch</option>
                </select>
              </label>
            ) : null}

            {activeTab === 'payment-terms' ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Due Basis</span>
                  <select
                    required
                    value={form.dueMode ?? 'days'}
                    onChange={(event) => {
                      const dueMode = event.target.value === 'following-month' ? 'following-month' : 'days';
                      setForm((current) => ({
                        ...current,
                        dueMode,
                        dayNumber: dueMode === 'days' ? current.dayNumber ?? 30 : Math.min(current.dayNumber ?? 30, 31),
                      }));
                    }}
                    className={inputClassName}
                  >
                    <option value="days">Due after a number of days</option>
                    <option value="following-month">Due on day in following month</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">
                    {form.dueMode === 'following-month' ? 'Day' : 'Days'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={form.dueMode === 'following-month' ? 31 : 360}
                    required
                    value={form.dayNumber ?? 1}
                    onChange={(event) => setForm((current) => ({ ...current, dayNumber: Number(event.target.value) }))}
                    className={inputClassName}
                  />
                </label>
              </div>
            ) : null}

            {activeTab === 'payment-methods' ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { name: 'paymentType', label: 'Use For Payments' },
                    { name: 'receiptType', label: 'Use For Receipts' },
                    { name: 'usePreprintedStationery', label: 'Use Pre-printed Stationery' },
                    { name: 'openCashDrawer', label: 'Open POS Cash Drawer' },
                  ].map((field) => (
                    <label
                      key={field.name}
                      className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(form[field.name as keyof SalesReceivablesSetupForm])}
                        onChange={(event) => setForm((current) => ({ ...current, [field.name]: event.target.checked }))}
                        className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Payment Discount Percent on Receipts</span>
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    required
                    value={form.percentDiscount ?? 0}
                    onChange={(event) => setForm((current) => ({ ...current, percentDiscount: Number(event.target.value) }))}
                    className={inputClassName}
                  />
                </label>
              </div>
            ) : null}

            {activeTab === 'sales-people' ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Telephone No</span>
                    <input
                      type="text"
                      maxLength={20}
                      value={form.telephone ?? ''}
                      onChange={(event) => setForm((current) => ({ ...current, telephone: event.target.value }))}
                      className={inputClassName}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Facsimile No</span>
                    <input
                      type="text"
                      maxLength={20}
                      value={form.fax ?? ''}
                      onChange={(event) => setForm((current) => ({ ...current, fax: event.target.value }))}
                      className={inputClassName}
                    />
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Commission Rate 1</span>
                    <input
                      type="number"
                      step={0.01}
                      required
                      value={form.commissionRate1 ?? 0}
                      onChange={(event) => setForm((current) => ({ ...current, commissionRate1: Number(event.target.value) }))}
                      className={inputClassName}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Breakpoint</span>
                    <input
                      type="number"
                      step={0.01}
                      required
                      value={form.breakpoint ?? 0}
                      onChange={(event) => setForm((current) => ({ ...current, breakpoint: Number(event.target.value) }))}
                      className={inputClassName}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">Commission Rate 2</span>
                    <input
                      type="number"
                      step={0.01}
                      required
                      value={form.commissionRate2 ?? 0}
                      onChange={(event) => setForm((current) => ({ ...current, commissionRate2: Number(event.target.value) }))}
                      className={inputClassName}
                    />
                  </label>
                </div>

                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text">
                  <input
                    type="checkbox"
                    checked={Boolean(form.current)}
                    onChange={(event) => setForm((current) => ({ ...current, current: event.target.checked }))}
                    className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
                  />
                  <span>Current</span>
                </label>
              </div>
            ) : null}
          </form>
        </Modal>
        {confirmationDialog}
      </div>
    </div>
  );
}
