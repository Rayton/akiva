import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Tags,
  Trash2,
  Truck,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  deletePurchasesPayablesSetupRecord,
  fetchPurchasesPayablesSetup,
  savePurchasesPayablesSetupRecord,
} from '../data/purchasesPayablesSetupApi';
import { DEFAULT_GL_SETTINGS, fetchGlSettings } from '../data/glApi';
import type { GlSettings } from '../types/gl';
import type {
  FreightCost,
  PaymentMethod,
  PaymentTerm,
  PoAuthorisationLevel,
  PurchasesPayablesLookupOption,
  PurchasesPayablesSetupForm,
  PurchasesPayablesSetupPayload,
  PurchasesPayablesSetupTab,
  Shipper,
  SupplierType,
} from '../types/purchasesPayablesSetup';

interface PurchasesPayablesSetupProps {
  initialTab?: PurchasesPayablesSetupTab;
}

type SetupRow = SupplierType | PaymentTerm | PoAuthorisationLevel | PaymentMethod | Shipper | FreightCost;

interface TabDefinition {
  id: PurchasesPayablesSetupTab;
  label: string;
  singularLabel: string;
  title: string;
  description: string;
  addLabel: string;
}

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'supplier-types',
    label: 'Supplier Types',
    singularLabel: 'Supplier type',
    title: 'Supplier Types',
    description: 'Maintain the supplier classifications used on payable accounts.',
    addLabel: 'Add Supplier Type',
  },
  {
    id: 'payment-terms',
    label: 'Payment Terms',
    singularLabel: 'Payment term',
    title: 'Supplier Payment Terms',
    description: 'Set payable due dates by days or by a day in the following month.',
    addLabel: 'Add Payment Term',
  },
  {
    id: 'po-authorisation-levels',
    label: 'PO Authorisation',
    singularLabel: 'Authorisation level',
    title: 'Purchase Order Authorisation Levels',
    description: 'Control who can create, review, approve, and release purchase orders.',
    addLabel: 'Add Authorisation',
  },
  {
    id: 'payment-methods',
    label: 'Payment Methods',
    singularLabel: 'Payment method',
    title: 'Payment Methods',
    description: 'Maintain payment and receipt methods used by bank transactions.',
    addLabel: 'Add Payment Method',
  },
  {
    id: 'shippers',
    label: 'Shippers',
    singularLabel: 'Shipper',
    title: 'Shippers',
    description: 'Maintain carriers and their minimum freight charge.',
    addLabel: 'Add Shipper',
  },
  {
    id: 'freight-costs',
    label: 'Freight Costs',
    singularLabel: 'Freight cost',
    title: 'Freight Costs',
    description: 'Maintain freight rates by dispatch location, destination, and shipper.',
    addLabel: 'Add Freight Cost',
  },
];

function tabDefinition(tab: PurchasesPayablesSetupTab): TabDefinition {
  return TAB_DEFINITIONS.find((definition) => definition.id === tab) ?? TAB_DEFINITIONS[0];
}

function isPaymentTerm(row: SetupRow): row is PaymentTerm {
  return 'code' in row && 'daysBeforeDue' in row;
}

function isPoAuthorisation(row: SetupRow): row is PoAuthorisationLevel {
  return 'userId' in row && 'currencyCode' in row && 'authLevel' in row;
}

function isPaymentMethod(row: SetupRow): row is PaymentMethod {
  return 'paymentType' in row;
}

function isShipper(row: SetupRow): row is Shipper {
  return 'minimumCharge' in row && 'name' in row && !('locationFrom' in row);
}

function isFreightCost(row: SetupRow): row is FreightCost {
  return 'locationFrom' in row && 'shipperId' in row;
}

function rowId(row: SetupRow): string | number {
  if (isPaymentTerm(row)) return row.code;
  if (isPoAuthorisation(row)) return row.id;
  return row.id;
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function permissionLabel(value: boolean, allowed: string, denied: string): string {
  return value ? allowed : denied;
}

function PermissionBadge({ allowed, label }: { allowed: boolean; label: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        allowed
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
      }`}
    >
      {label}
    </span>
  );
}

function formatAmount(value: number, settings: GlSettings): string {
  const decimals = Math.max(0, Number(settings.currencyDecimalPlaces ?? 2));
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function paymentTermScheduleLabel(row: PaymentTerm): string {
  if (row.daysBeforeDue > 0) return `Due after ${row.daysBeforeDue} days`;
  if (row.dayInFollowingMonth > 0) return `Due on day ${row.dayInFollowingMonth} of following month`;
  return 'Not set';
}

function optionLabel(option: PurchasesPayablesLookupOption): string {
  return `${option.code} - ${option.name}`;
}

function emptyForm(payload?: PurchasesPayablesSetupPayload | null): PurchasesPayablesSetupForm {
  return {
    code: '',
    name: '',
    dueMode: 'days',
    dayNumber: 1,
    userId: payload?.lookups.users[0]?.code ?? '',
    currencyCode: payload?.lookups.currencies[0]?.code ?? '',
    canCreate: true,
    canReview: true,
    authLevel: 0,
    offHold: false,
    paymentType: true,
    receiptType: true,
    usePreprintedStationery: false,
    openCashDrawer: false,
    percentDiscount: 0,
    minimumCharge: 0,
    locationFrom: payload?.lookups.locations[0]?.code ?? '',
    destinationCountry: '',
    destination: '',
    shipperId: payload?.shippers[0]?.id ?? 0,
    cubRate: 0,
    kgRate: 0,
    maxKgs: 999999,
    maxCub: 999999,
    fixedPrice: 0,
  };
}

function formFromRow(row: SetupRow, payload: PurchasesPayablesSetupPayload | null): PurchasesPayablesSetupForm {
  const base = emptyForm(payload);
  if (isPaymentTerm(row)) {
    return {
      ...base,
      code: row.code,
      name: row.name,
      dueMode: row.daysBeforeDue > 0 ? 'days' : 'following-month',
      dayNumber: row.daysBeforeDue > 0 ? row.daysBeforeDue : row.dayInFollowingMonth || 1,
    };
  }
  if (isPoAuthorisation(row)) {
    return {
      ...base,
      userId: row.userId,
      currencyCode: row.currencyCode,
      canCreate: row.canCreate,
      canReview: row.canReview,
      authLevel: row.authLevel,
      offHold: row.offHold,
    };
  }
  if (isPaymentMethod(row)) {
    return {
      ...base,
      name: row.name,
      paymentType: row.paymentType,
      receiptType: row.receiptType,
      usePreprintedStationery: row.usePreprintedStationery,
      openCashDrawer: row.openCashDrawer,
      percentDiscount: row.percentDiscount,
    };
  }
  if (isFreightCost(row)) {
    return {
      ...base,
      locationFrom: row.locationFrom,
      destinationCountry: row.destinationCountry,
      destination: row.destination,
      shipperId: row.shipperId,
      cubRate: row.cubRate,
      kgRate: row.kgRate,
      maxKgs: row.maxKgs,
      maxCub: row.maxCub,
      fixedPrice: row.fixedPrice,
      minimumCharge: row.minimumCharge,
    };
  }
  return { ...base, name: row.name, minimumCharge: isShipper(row) ? row.minimumCharge : 0 };
}

function rowsForTab(payload: PurchasesPayablesSetupPayload | null, tab: PurchasesPayablesSetupTab): SetupRow[] {
  if (!payload) return [];
  if (tab === 'supplier-types') return payload.supplierTypes;
  if (tab === 'payment-terms') return payload.paymentTerms;
  if (tab === 'po-authorisation-levels') return payload.poAuthorisationLevels;
  if (tab === 'payment-methods') return payload.paymentMethods;
  if (tab === 'shippers') return payload.shippers;
  return payload.freightCosts;
}

function rowDisplay(row: SetupRow): string {
  if (isPaymentTerm(row)) return `${row.code} - ${row.name}`;
  if (isPoAuthorisation(row)) return `${row.userId} / ${row.currencyCode}`;
  if (isFreightCost(row)) return `${row.locationFrom} to ${row.destination} via ${row.shipperName}`;
  return `${row.id} - ${row.name}`;
}

function deleteDescription(tab: PurchasesPayablesSetupTab): string {
  if (tab === 'supplier-types') return 'This supplier type will be removed only if supplier accounts do not use it.';
  if (tab === 'payment-terms') return 'This payment term will be removed only if customer and supplier accounts do not use it.';
  if (tab === 'payment-methods') return 'This payment method will be removed only if bank transactions do not use it.';
  if (tab === 'shippers') return 'This shipper will be removed only if sales orders, customer transactions, and freight costs do not use it.';
  if (tab === 'freight-costs') return 'This freight rate will be removed from payable freight setup.';
  return 'This purchase order authorisation level will be removed for the selected user and currency.';
}

export function PurchasesPayablesSetup({ initialTab = 'supplier-types' }: PurchasesPayablesSetupProps) {
  const [activeTab, setActiveTab] = useState<PurchasesPayablesSetupTab>(initialTab);
  const [payload, setPayload] = useState<PurchasesPayablesSetupPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SetupRow | null>(null);
  const [form, setForm] = useState<PurchasesPayablesSetupForm>(() => emptyForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [glSettings, setGlSettings] = useState<GlSettings>(DEFAULT_GL_SETTINGS);
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
      const [setupPayload, settings] = await Promise.all([
        fetchPurchasesPayablesSetup(),
        fetchGlSettings().catch(() => DEFAULT_GL_SETTINGS),
      ]);
      setPayload(setupPayload);
      setGlSettings(settings);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Purchases and payables setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
  }, []);

  const rows = useMemo(() => rowsForTab(payload, activeTab), [activeTab, payload]);
  const stats = payload?.stats ?? {
    supplierTypes: 0,
    paymentTerms: 0,
    poAuthorisationLevels: 0,
    paymentMethods: 0,
    shippers: 0,
    freightCosts: 0,
    suppliers: 0,
    bankTransactions: 0,
  };

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const searchable = [
        String(rowId(row)),
        'name' in row ? row.name : '',
        isPaymentTerm(row) ? paymentTermScheduleLabel(row) : '',
        isPoAuthorisation(row) ? `${row.userId} ${row.userName} ${row.currencyCode} ${row.currencyName} ${row.authLevel}` : '',
        isPaymentMethod(row) ? `${yesNo(row.paymentType)} ${yesNo(row.receiptType)} ${row.percentDiscount}` : '',
        isFreightCost(row) ? `${row.locationFrom} ${row.locationName} ${row.destinationCountry} ${row.destination} ${row.shipperName}` : '',
      ].join(' ');
      return searchable.toLowerCase().includes(needle);
    });
  }, [rows, searchTerm]);

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm(emptyForm(payload));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (row: SetupRow) => {
    setEditingRow(row);
    setForm(formFromRow(row, payload));
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
      const response = await savePurchasesPayablesSetupRecord(activeTab, form, editingRow ? rowId(editingRow) : undefined);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingRow(null);
      setForm(emptyForm(payload));
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
      const response = await deletePurchasesPayablesSetupRecord(activeTab, id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? `${definition.singularLabel} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `${definition.singularLabel} could not be deleted.`);
    } finally {
      setDeletingId('');
    }
  };

  const columns = useMemo<AdvancedTableColumn<SetupRow>[]>(() => {
    const actions: AdvancedTableColumn<SetupRow> = {
      id: 'actions',
      header: 'Actions',
      accessor: () => '',
      cell: (row) => {
        const id = rowId(row);
        return (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openEditDialog(row)}>
              <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Edit</span>
            </Button>
            <Button size="sm" variant="danger" disabled={deletingId === id} onClick={() => void deleteRow(row)}>
              <span className="inline-flex items-center gap-2">
                {deletingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </span>
            </Button>
          </div>
        );
      },
      width: 210,
      sortable: false,
      filterable: false,
    };

    if (activeTab === 'payment-terms') {
      return [
        { id: 'code', header: 'Code', accessor: (row) => (isPaymentTerm(row) ? row.code : ''), width: 110 },
        { id: 'name', header: 'Terms', accessor: (row) => (isPaymentTerm(row) ? row.name : ''), width: 260 },
        { id: 'schedule', header: 'Schedule', accessor: (row) => (isPaymentTerm(row) ? paymentTermScheduleLabel(row) : ''), width: 280 },
        actions,
      ];
    }

    if (activeTab === 'po-authorisation-levels') {
      return [
        {
          id: 'userId',
          header: 'User ID',
          accessor: (row) => (isPoAuthorisation(row) ? row.userId : ''),
          cell: (row) => isPoAuthorisation(row) ? <span className="font-mono font-semibold">{row.userId}</span> : null,
          width: 140,
        },
        {
          id: 'userName',
          header: 'Username',
          accessor: (row) => (isPoAuthorisation(row) ? row.userName : ''),
          cell: (row) => isPoAuthorisation(row) ? <span>{row.userName || 'Not named'}</span> : null,
          width: 220,
        },
        {
          id: 'currency',
          header: 'Currency',
          accessor: (row) => (isPoAuthorisation(row) ? `${row.currencyCode} ${row.currencyName}` : ''),
          cell: (row) => isPoAuthorisation(row) ? <span><span className="font-mono font-semibold">{row.currencyCode}</span> {row.currencyName}</span> : null,
          width: 200,
        },
        {
          id: 'authLevel',
          header: 'Approval limit',
          accessor: (row) => (isPoAuthorisation(row) ? row.authLevel : 0),
          cell: (row) => isPoAuthorisation(row) ? <span className="font-mono tabular-nums">{formatAmount(row.authLevel, glSettings)}</span> : null,
          exportValue: (row) => (isPoAuthorisation(row) ? row.authLevel : 0),
          width: 150,
          align: 'right',
        },
        {
          id: 'canCreate',
          header: 'Create purchase orders',
          accessor: (row) => (isPoAuthorisation(row) ? permissionLabel(row.canCreate, 'Can create POs', 'Cannot create POs') : ''),
          cell: (row) => isPoAuthorisation(row) ? <PermissionBadge allowed={row.canCreate} label={permissionLabel(row.canCreate, 'Can create POs', 'Cannot create POs')} /> : null,
          width: 190,
        },
        {
          id: 'canReview',
          header: 'Review purchase orders',
          accessor: (row) => (isPoAuthorisation(row) ? permissionLabel(row.canReview, 'Can review POs', 'Cannot review POs') : ''),
          cell: (row) => isPoAuthorisation(row) ? <PermissionBadge allowed={row.canReview} label={permissionLabel(row.canReview, 'Can review POs', 'Cannot review POs')} /> : null,
          width: 190,
        },
        {
          id: 'offHold',
          header: 'Release held purchase orders',
          accessor: (row) => (isPoAuthorisation(row) ? permissionLabel(row.offHold, 'Can release held POs', 'Cannot release held POs') : ''),
          cell: (row) => isPoAuthorisation(row) ? <PermissionBadge allowed={row.offHold} label={permissionLabel(row.offHold, 'Can release held POs', 'Cannot release held POs')} /> : null,
          width: 230,
        },
        actions,
      ];
    }

    if (activeTab === 'payment-methods') {
      return [
        { id: 'id', header: 'ID', accessor: (row) => (!isPaymentTerm(row) && !isPoAuthorisation(row) && !isFreightCost(row) ? row.id : ''), width: 90 },
        { id: 'name', header: 'Method', accessor: (row) => ('name' in row ? row.name : ''), width: 220 },
        { id: 'paymentType', header: 'Payment', accessor: (row) => (isPaymentMethod(row) ? yesNo(row.paymentType) : ''), width: 130 },
        { id: 'receiptType', header: 'Receipt', accessor: (row) => (isPaymentMethod(row) ? yesNo(row.receiptType) : ''), width: 130 },
        {
          id: 'discount',
          header: 'Discount',
          accessor: (row) => (isPaymentMethod(row) ? row.percentDiscount : 0),
          cell: (row) => isPaymentMethod(row) ? <span className="font-mono tabular-nums">{formatAmount(row.percentDiscount, glSettings)}</span> : null,
          exportValue: (row) => (isPaymentMethod(row) ? row.percentDiscount : 0),
          width: 130,
          align: 'right',
        },
        actions,
      ];
    }

    if (activeTab === 'shippers') {
      return [
        { id: 'id', header: 'ID', accessor: (row) => ('id' in row ? row.id : ''), width: 90 },
        { id: 'name', header: 'Shipper', accessor: (row) => ('name' in row ? row.name : ''), width: 260 },
        {
          id: 'minimumCharge',
          header: 'Minimum Charge',
          accessor: (row) => (isShipper(row) ? row.minimumCharge : 0),
          cell: (row) => isShipper(row) ? <span className="font-mono tabular-nums">{formatAmount(row.minimumCharge, glSettings)}</span> : null,
          exportValue: (row) => (isShipper(row) ? row.minimumCharge : 0),
          width: 170,
          align: 'right',
        },
        actions,
      ];
    }

    if (activeTab === 'freight-costs') {
      return [
        {
          id: 'from',
          header: 'From',
          accessor: (row) => (isFreightCost(row) ? `${row.locationFrom} ${row.locationName}` : ''),
          cell: (row) => isFreightCost(row) ? <span><span className="font-mono font-semibold">{row.locationFrom}</span> {row.locationName}</span> : null,
          width: 230,
        },
        { id: 'destination', header: 'Destination', accessor: (row) => (isFreightCost(row) ? `${row.destinationCountry} ${row.destination}` : ''), width: 260 },
        { id: 'shipper', header: 'Shipper', accessor: (row) => (isFreightCost(row) ? row.shipperName : ''), width: 200 },
        {
          id: 'kgRate',
          header: 'Rate/kg',
          accessor: (row) => (isFreightCost(row) ? row.kgRate : 0),
          cell: (row) => isFreightCost(row) ? <span className="font-mono tabular-nums">{formatAmount(row.kgRate, glSettings)}</span> : null,
          exportValue: (row) => (isFreightCost(row) ? row.kgRate : 0),
          width: 130,
          align: 'right',
        },
        {
          id: 'cubRate',
          header: 'Rate/cube',
          accessor: (row) => (isFreightCost(row) ? row.cubRate : 0),
          cell: (row) => isFreightCost(row) ? <span className="font-mono tabular-nums">{formatAmount(row.cubRate, glSettings)}</span> : null,
          exportValue: (row) => (isFreightCost(row) ? row.cubRate : 0),
          width: 140,
          align: 'right',
        },
        {
          id: 'fixedPrice',
          header: 'Fixed price',
          accessor: (row) => (isFreightCost(row) ? row.fixedPrice : 0),
          cell: (row) => isFreightCost(row) ? <span className="font-mono tabular-nums">{formatAmount(row.fixedPrice, glSettings)}</span> : null,
          exportValue: (row) => (isFreightCost(row) ? row.fixedPrice : 0),
          width: 140,
          align: 'right',
        },
        {
          id: 'minimumCharge',
          header: 'Minimum',
          accessor: (row) => (isFreightCost(row) ? row.minimumCharge : 0),
          cell: (row) => isFreightCost(row) ? <span className="font-mono tabular-nums">{formatAmount(row.minimumCharge, glSettings)}</span> : null,
          exportValue: (row) => (isFreightCost(row) ? row.minimumCharge : 0),
          width: 130,
          align: 'right',
        },
        actions,
      ];
    }

    return [
      { id: 'id', header: 'ID', accessor: (row) => ('id' in row ? row.id : ''), width: 90 },
      { id: 'name', header: 'Supplier Type', accessor: (row) => ('name' in row ? row.name : ''), width: 280 },
      actions,
    ];
  }, [activeTab, deletingId]);

  const setField = <K extends keyof PurchasesPayablesSetupForm>(fieldName: K, value: PurchasesPayablesSetupForm[K]) => {
    setForm((previous) => ({ ...previous, [fieldName]: value }));
  };

  const renderPaymentTermFields = () => (
    <>
      <label className="block text-sm font-medium text-akiva-text">
        Code
        <input
          className={`${inputClassName} mt-1`}
          value={form.code ?? ''}
          onChange={(event) => setField('code', event.target.value)}
          maxLength={2}
          required
          disabled={Boolean(editingRow)}
        />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Terms
        <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setField('name', event.target.value)} maxLength={40} required />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Due basis
        <select className={`${inputClassName} mt-1`} value={form.dueMode ?? 'days'} onChange={(event) => setField('dueMode', event.target.value as 'days' | 'following-month')}>
          <option value="days">Days before due</option>
          <option value="following-month">Day in following month</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Day number
        <input className={`${inputClassName} mt-1`} type="number" min={1} max={form.dueMode === 'following-month' ? 31 : 360} value={form.dayNumber ?? 1} onChange={(event) => setField('dayNumber', Number(event.target.value))} required />
      </label>
    </>
  );

  const renderAuthorisationFields = () => (
    <>
      <label className="block text-sm font-medium text-akiva-text">
        User
        <SearchableSelect
          className="mt-1"
          value={form.userId ?? ''}
          disabled={Boolean(editingRow)}
          onChange={(value) => setField('userId', value)}
          options={(payload?.lookups.users ?? []).map((option) => ({ value: option.code, label: optionLabel(option) }))}
        />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Currency
        <SearchableSelect
          className="mt-1"
          value={form.currencyCode ?? ''}
          disabled={Boolean(editingRow)}
          onChange={(value) => setField('currencyCode', value)}
          options={(payload?.lookups.currencies ?? []).map((option) => ({ value: option.code, label: optionLabel(option) }))}
        />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Approval limit
        <input className={`${inputClassName} mt-1`} type="number" min={0} step="0.01" value={form.authLevel ?? 0} onChange={(event) => setField('authLevel', Number(event.target.value))} required />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['canCreate', 'Allow creating purchase orders'],
          ['canReview', 'Allow reviewing purchase orders'],
          ['offHold', 'Allow releasing held purchase orders'],
        ].map(([fieldName, label]) => (
          <label key={fieldName} className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 text-sm font-medium text-akiva-text">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
              checked={Boolean(form[fieldName as keyof PurchasesPayablesSetupForm])}
              onChange={(event) => setField(fieldName as keyof PurchasesPayablesSetupForm, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
    </>
  );

  const renderPaymentMethodFields = () => (
    <>
      <label className="block text-sm font-medium text-akiva-text">
        Method name
        <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setField('name', event.target.value)} maxLength={15} required />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Discount fraction
        <input className={`${inputClassName} mt-1`} type="number" min={0} max={1} step="0.0001" value={form.percentDiscount ?? 0} onChange={(event) => setField('percentDiscount', Number(event.target.value))} required />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['paymentType', 'Payment type'],
          ['receiptType', 'Receipt type'],
          ['usePreprintedStationery', 'Preprinted stationery'],
          ['openCashDrawer', 'Open cash drawer'],
        ].map(([fieldName, label]) => (
          <label key={fieldName} className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 text-sm font-medium text-akiva-text">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
              checked={Boolean(form[fieldName as keyof PurchasesPayablesSetupForm])}
              onChange={(event) => setField(fieldName as keyof PurchasesPayablesSetupForm, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
    </>
  );

  const renderFreightFields = () => (
    <>
      <label className="block text-sm font-medium text-akiva-text">
        Dispatch location
        <SearchableSelect
          className="mt-1"
          value={form.locationFrom ?? ''}
          onChange={(value) => setField('locationFrom', value)}
          options={(payload?.lookups.locations ?? []).map((option) => ({ value: option.code, label: optionLabel(option) }))}
        />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Shipper
        <SearchableSelect
          className="mt-1"
          value={String(form.shipperId ?? '')}
          onChange={(value) => setField('shipperId', Number(value))}
          options={(payload?.shippers ?? []).map((shipper) => ({ value: shipper.id, label: `${shipper.id} - ${shipper.name}` }))}
        />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Destination country
        <input className={`${inputClassName} mt-1`} value={form.destinationCountry ?? ''} onChange={(event) => setField('destinationCountry', event.target.value)} maxLength={40} />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Destination
        <input className={`${inputClassName} mt-1`} value={form.destination ?? ''} onChange={(event) => setField('destination', event.target.value)} maxLength={40} required />
      </label>
      {[
        ['kgRate', 'Rate per kg'],
        ['cubRate', 'Rate per cube'],
        ['maxKgs', 'Max kg'],
        ['maxCub', 'Max cube'],
        ['fixedPrice', 'Fixed price'],
        ['minimumCharge', 'Minimum charge'],
      ].map(([fieldName, label]) => (
        <label key={fieldName} className="block text-sm font-medium text-akiva-text">
          {label}
          <input
            className={`${inputClassName} mt-1`}
            type="number"
            min={0}
            step="0.01"
            value={Number(form[fieldName as keyof PurchasesPayablesSetupForm] ?? 0)}
            onChange={(event) => setField(fieldName as keyof PurchasesPayablesSetupForm, Number(event.target.value))}
            required
          />
        </label>
      ))}
    </>
  );

  const renderFormFields = () => {
    if (activeTab === 'payment-terms') return renderPaymentTermFields();
    if (activeTab === 'po-authorisation-levels') return renderAuthorisationFields();
    if (activeTab === 'payment-methods') return renderPaymentMethodFields();
    if (activeTab === 'freight-costs') return renderFreightFields();

    return (
      <>
        <label className="block text-sm font-medium text-akiva-text">
          {activeTab === 'shippers' ? 'Shipper name' : 'Supplier type'}
          <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setField('name', event.target.value)} maxLength={activeTab === 'shippers' ? 40 : 100} required />
        </label>
        {activeTab === 'shippers' ? (
          <label className="block text-sm font-medium text-akiva-text">
            Minimum charge
            <input className={`${inputClassName} mt-1`} type="number" min={0} step="0.01" value={form.minimumCharge ?? 0} onChange={(event) => setField('minimumCharge', Number(event.target.value))} required />
          </label>
        ) : null}
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Configuration</p>
              <h1 className="mt-1 text-2xl font-bold text-akiva-text sm:text-3xl">Purchases/Payables setup</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">{definition.description}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadSetup()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
              <Button onClick={openCreateDialog}>
                <span className="inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" />{definition.addLabel}</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
            {[
              ['Supplier Types', stats.supplierTypes, Tags],
              ['Payment Terms', stats.paymentTerms, CalendarDays],
              ['PO Auth', stats.poAuthorisationLevels, ShieldCheck],
              ['Payment Methods', stats.paymentMethods, CreditCard],
              ['Shippers', stats.shippers, Truck],
              ['Freight Costs', stats.freightCosts, Truck],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof Tags;
              return (
                <div key={String(label)} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{String(label)}</p>
                    <StatIcon className="h-4 w-4 text-akiva-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-akiva-text">{Number(value).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {TAB_DEFINITIONS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-akiva-accent text-white shadow-sm'
                    : 'border border-akiva-border bg-akiva-surface text-akiva-text hover:bg-akiva-surface-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">{definition.title}</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">{rows.length.toLocaleString()} records</p>
            </div>
            <label className="relative block w-full min-[900px]:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input
                className={`${inputClassName} pl-9`}
                placeholder={`Search ${definition.label.toLowerCase()}...`}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
          </div>

          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId={`purchases-payables-${activeTab}`}
              columns={columns}
              rows={filteredRows}
              rowKey={(row) => String(rowId(row))}
              loading={loading}
              loadingMessage="Loading purchases and payables setup..."
              emptyMessage={`No ${definition.label.toLowerCase()} found.`}
              initialPageSize={25}
            />
          </div>
        </section>
      </div>

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`${editingRow ? 'Edit' : 'Add'} ${definition.singularLabel}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="purchases-payables-setup-form" disabled={saving}>
              <span className="inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </span>
            </Button>
          </>
        }
      >
        <form id="purchases-payables-setup-form" onSubmit={submitForm} className="grid gap-4 sm:grid-cols-2">
          {renderFormFields()}
        </form>
      </Modal>

      {confirmationDialog}
    </div>
  );
}
