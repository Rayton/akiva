import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Filter,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DatePicker } from '../components/common/DatePicker';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { RightDrawer } from '../components/ui/RightDrawer';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';

type PoStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Reviewed'
  | 'Authorised'
  | 'Printed'
  | 'Part Received'
  | 'Received'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

type WorkbenchTab = 'outstanding' | 'approvals' | 'receiving' | 'billMatch' | 'all';
type DrawerMode = 'view' | 'create' | 'receive' | 'review' | null;

interface PoLine {
  id: string;
  itemCode: string;
  supplierItem: string;
  description: string;
  category: string;
  supplierUnits: string;
  receivingUnits: string;
  conversionFactor: number;
  quantityOrdered: number;
  quantityReceived: number;
  quantityInvoiced: number;
  deliveryDate: string;
  unitPrice: number;
  taxRate: number;
  glCode: string;
  controlled?: boolean;
  completed?: boolean;
}

interface StatusEvent {
  label: string;
  by: string;
  at: string;
}

interface PurchaseOrder {
  id: string;
  orderNumber: string;
  realOrderNumber: string;
  supplierCode: string;
  supplierName: string;
  supplierAddress: string;
  currency: 'TZS' | 'USD';
  exchangeRate: number;
  orderDate: string;
  deliveryDate: string;
  initiatedBy: string;
  reviewer: string;
  location: string;
  requisitionNo: string;
  paymentTerms: string;
  deliveryBy: string;
  comments: string;
  status: PoStatus;
  allowPrint: boolean;
  supplierReference?: string;
  deliveryNote?: string;
  lines: PoLine[];
  events: StatusEvent[];
  source?: 'database' | 'sample';
}

interface DraftLine extends PoLine {
  draftId: string;
}

interface SupplierLookup {
  value: string;
  label: string;
  address?: string;
  currency?: PurchaseOrder['currency'];
}

interface LookupOption {
  value: string;
  label: string;
}

interface PurchaseOrdersApiResponse {
  success: boolean;
  data: PurchaseOrder[];
  lookups?: {
    suppliers?: SupplierLookup[];
    locations?: LookupOption[];
    categories?: LookupOption[];
  };
}

const inputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const suppliers = [
  {
    value: 'AFRI D10',
    label: 'AFRI DENTAL PRODUCTS',
    address: 'MAGOMENI, DSM, P.O.BOX 70122',
    currency: 'TZS' as const,
  },
  {
    value: 'SUPPLIER',
    label: 'PRIMECARE MEDICAL EQUIPMENT SUPPLY',
    address: 'P.O.BOX, DSM',
    currency: 'TZS' as const,
  },
  {
    value: 'SUPPLIER 1',
    label: "ZEEPY'I PHARMACEUTICALS LTD",
    address: 'MASASI ST, KARIAKOO, DSM',
    currency: 'TZS' as const,
  },
  {
    value: 'SUPPLIER 2',
    label: 'MSD MEDICAL STORE DEPARTMENT',
    address: 'BANDARI, MTWARA',
    currency: 'TZS' as const,
  },
  {
    value: 'SUPPLIER 3',
    label: 'ANUDHA LTD',
    address: 'P.O.BOX 5982, KISUTU, DSM',
    currency: 'TZS' as const,
  },
  {
    value: 'SUPPLIER 4',
    label: 'ACTION MEDEOR',
    address: 'MASASI, DSM',
    currency: 'TZS' as const,
  },
];

const locations = [
  { value: 'ADMINISTRATION', label: 'ADMINISTRATION' },
  { value: 'CENTRAL STORE', label: 'CENTRAL STORE' },
  { value: 'PHARMACY', label: 'PHARMACY' },
  { value: 'THEATRE STORE', label: 'THEATRE STORE' },
];

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'outstanding', label: 'Pending and Authorised' },
  { value: 'Draft', label: 'Draft' },
  { value: 'Pending Review', label: 'Pending Review' },
  { value: 'Reviewed', label: 'Reviewed' },
  { value: 'Authorised', label: 'Authorised' },
  { value: 'Printed', label: 'Printed / sent' },
  { value: 'Part Received', label: 'Part received' },
  { value: 'Received', label: 'Received, bill pending' },
  { value: 'Completed', label: 'Completed' },
];

const categoryOptions = [
  { value: 'All', label: 'All categories' },
  { value: 'Medical Consumables', label: 'Medical Consumables' },
  { value: 'Equipment Spares', label: 'Equipment Spares' },
  { value: 'Pharmacy', label: 'Pharmacy' },
  { value: 'Administration', label: 'Administration' },
];

const catalog: Array<Omit<PoLine, 'id' | 'quantityOrdered' | 'quantityReceived' | 'quantityInvoiced' | 'deliveryDate' | 'completed'>> = [
  {
    itemCode: 'ACCESORY016',
    supplierItem: 'GREASE-1KG',
    description: 'GREASE',
    category: 'Equipment Spares',
    supplierUnits: 'kgs',
    receivingUnits: 'kgs',
    conversionFactor: 1,
    unitPrice: 10000,
    taxRate: 0,
    glCode: '5500',
  },
  {
    itemCode: 'ACCESORY018',
    supplierItem: 'ECABLE',
    description: 'ELECTRODE CABLE',
    category: 'Medical Consumables',
    supplierUnits: 'each',
    receivingUnits: 'each',
    conversionFactor: 1,
    unitPrice: 20000,
    taxRate: 0,
    glCode: '5500',
    controlled: true,
  },
  {
    itemCode: 'PHARM-221',
    supplierItem: 'CEF-1G',
    description: 'Ceftriaxone injection 1g',
    category: 'Pharmacy',
    supplierUnits: 'vial',
    receivingUnits: 'vial',
    conversionFactor: 1,
    unitPrice: 2400,
    taxRate: 0,
    glCode: '5600',
    controlled: true,
  },
  {
    itemCode: 'OFFICE-041',
    supplierItem: 'A4-REAM',
    description: 'A4 printing paper ream',
    category: 'Administration',
    supplierUnits: 'ream',
    receivingUnits: 'ream',
    conversionFactor: 1,
    unitPrice: 12500,
    taxRate: 18,
    glCode: '6300',
  },
];

const initialOrders: PurchaseOrder[] = [
  {
    id: 'po-500',
    orderNumber: '500',
    realOrderNumber: 'PO-2025-00500',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    supplierAddress: 'MAGOMENI, DSM, P.O.BOX 70122',
    currency: 'TZS',
    exchangeRate: 1,
    orderDate: '2026-05-09',
    deliveryDate: '2026-05-09',
    initiatedBy: 'Israel Pascal',
    reviewer: 'Procurement Lead',
    location: 'ADMINISTRATION',
    requisitionNo: 'REQ-0500',
    paymentTerms: '30 days',
    deliveryBy: 'Supplier',
    comments: 'Dental supplies, still editable before review.',
    status: 'Draft',
    allowPrint: false,
    lines: [
      makeLine('l1', catalog[0], 5, 0, 0, '2026-05-09'),
      makeLine('l2', catalog[1], 2, 0, 0, '2026-05-09'),
    ],
    events: [
      { label: 'Draft created', by: 'Israel Pascal', at: '09 May 2026 08:14' },
    ],
  },
  {
    id: 'po-501',
    orderNumber: '501',
    realOrderNumber: 'PO-2025-00501',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    supplierAddress: 'MAGOMENI, DSM, P.O.BOX 70122',
    currency: 'TZS',
    exchangeRate: 1,
    orderDate: '2026-05-12',
    deliveryDate: '2026-05-12',
    initiatedBy: 'Israel Pascal',
    reviewer: 'Medical Superintendent',
    location: 'ADMINISTRATION',
    requisitionNo: 'REQ-0501',
    paymentTerms: '30 days',
    deliveryBy: 'Supplier',
    comments: 'Large order awaiting budget review.',
    status: 'Pending Review',
    allowPrint: false,
    lines: [
      makeLine('l1', catalog[1], 50, 0, 0, '2026-05-12'),
      makeLine('l2', catalog[2], 200, 0, 0, '2026-05-12'),
    ],
    events: [
      { label: 'Submitted for review', by: 'Israel Pascal', at: '12 May 2026 10:12' },
      { label: 'Draft created', by: 'Israel Pascal', at: '12 May 2026 09:57' },
    ],
  },
  {
    id: 'po-504',
    orderNumber: '504',
    realOrderNumber: 'PO-2025-00504',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    supplierAddress: 'MAGOMENI, DSM, P.O.BOX 70122',
    currency: 'TZS',
    exchangeRate: 1,
    orderDate: '2026-05-12',
    deliveryDate: '2026-05-12',
    initiatedBy: 'Israel Pascal',
    reviewer: 'Procurement Lead',
    location: 'ADMINISTRATION',
    requisitionNo: 'REQ-0504',
    paymentTerms: '30 days',
    deliveryBy: 'Supplier',
    comments: 'Printed PO, ready for GRN posting.',
    status: 'Printed',
    allowPrint: true,
    lines: [
      makeLine('l1', catalog[0], 30, 10, 0, '2026-05-12'),
      makeLine('l2', catalog[1], 20, 0, 0, '2026-05-12'),
    ],
    events: [
      { label: 'Printed and sent to supplier', by: 'Israel Pascal', at: '12 May 2026 14:04' },
      { label: 'Authorised', by: 'Procurement Lead', at: '12 May 2026 13:28' },
      { label: 'Reviewed', by: 'Medical Superintendent', at: '12 May 2026 12:10' },
    ],
  },
  {
    id: 'po-506',
    orderNumber: '506',
    realOrderNumber: 'PO-2025-00506',
    supplierCode: 'SUPPLIER',
    supplierName: 'PRIMECARE MEDICAL EQUIPMENT SUPPLY',
    supplierAddress: 'P.O.BOX, DSM',
    currency: 'TZS',
    exchangeRate: 1,
    orderDate: '2026-05-12',
    deliveryDate: '2026-05-12',
    initiatedBy: 'Israel Pascal',
    reviewer: 'Medical Superintendent',
    location: 'CENTRAL STORE',
    requisitionNo: 'REQ-0506',
    paymentTerms: '45 days',
    deliveryBy: 'Courier',
    comments: 'Reviewed and waiting final authorisation.',
    status: 'Reviewed',
    allowPrint: false,
    lines: [
      makeLine('l1', catalog[1], 12, 0, 0, '2026-05-12'),
      makeLine('l2', catalog[3], 20, 0, 0, '2026-05-15'),
    ],
    events: [
      { label: 'Reviewed', by: 'Medical Superintendent', at: '12 May 2026 16:10' },
      { label: 'Submitted for review', by: 'Israel Pascal', at: '12 May 2026 14:22' },
    ],
  },
  {
    id: 'po-519',
    orderNumber: '519',
    realOrderNumber: 'PO-2025-00519',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    supplierAddress: 'MAGOMENI, DSM, P.O.BOX 70122',
    currency: 'TZS',
    exchangeRate: 1,
    orderDate: '2026-05-16',
    deliveryDate: '2026-05-16',
    initiatedBy: 'Israel Pascal',
    reviewer: 'Procurement Lead',
    location: 'ADMINISTRATION',
    requisitionNo: 'REQ-0519',
    paymentTerms: '30 days',
    deliveryBy: 'Supplier',
    comments: 'Part received, open balance remains.',
    status: 'Part Received',
    allowPrint: true,
    supplierReference: 'DN-7781',
    deliveryNote: 'GRN-003019',
    lines: [
      makeLine('l1', catalog[0], 5, 3, 0, '2026-05-16'),
      makeLine('l2', catalog[1], 2, 0, 0, '2026-05-16'),
    ],
    events: [
      { label: 'GRN posted for partial receipt', by: 'Stores Clerk', at: '16 May 2026 11:18' },
      { label: 'Printed and sent to supplier', by: 'Israel Pascal', at: '16 May 2026 09:30' },
    ],
  },
  {
    id: 'po-520',
    orderNumber: '520',
    realOrderNumber: 'PO-2025-00520',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    supplierAddress: 'MAGOMENI, DSM, P.O.BOX 70122',
    currency: 'TZS',
    exchangeRate: 1,
    orderDate: '2026-05-16',
    deliveryDate: '2026-05-16',
    initiatedBy: 'Israel Pascal',
    reviewer: 'Procurement Lead',
    location: 'ADMINISTRATION',
    requisitionNo: 'REQ-0520',
    paymentTerms: '30 days',
    deliveryBy: 'Supplier',
    comments: 'Fully received, supplier invoice not yet matched.',
    status: 'Received',
    allowPrint: true,
    supplierReference: 'INV-PENDING',
    deliveryNote: 'GRN-003024',
    lines: [
      makeLine('l1', catalog[2], 10, 10, 0, '2026-05-16'),
      makeLine('l2', catalog[3], 12, 12, 0, '2026-05-16'),
    ],
    events: [
      { label: 'Goods received and GRN accrual created', by: 'Stores Clerk', at: '16 May 2026 15:24' },
      { label: 'Printed and sent to supplier', by: 'Israel Pascal', at: '16 May 2026 10:01' },
    ],
  },
];

function makeLine(
  id: string,
  template: Omit<PoLine, 'id' | 'quantityOrdered' | 'quantityReceived' | 'quantityInvoiced' | 'deliveryDate' | 'completed'>,
  quantityOrdered: number,
  quantityReceived: number,
  quantityInvoiced: number,
  deliveryDate: string
): PoLine {
  return {
    id,
    ...template,
    quantityOrdered,
    quantityReceived,
    quantityInvoiced,
    deliveryDate,
    completed: quantityReceived >= quantityOrdered,
  };
}

const tabs: Array<{ id: WorkbenchTab; label: string; icon: LucideIcon }> = [
  { id: 'outstanding', label: 'Outstanding', icon: FileText },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck },
  { id: 'receiving', label: 'Receiving', icon: Truck },
  { id: 'billMatch', label: 'Bill match', icon: FileCheck2 },
  { id: 'all', label: 'All', icon: Filter },
];

function money(value: number, currency: PurchaseOrder['currency']) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'TZS' ? 0 : 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function lineTotal(line: PoLine) {
  return line.quantityOrdered * line.unitPrice;
}

function subtotal(order: PurchaseOrder) {
  return order.lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

function taxTotal(order: PurchaseOrder) {
  return order.lines.reduce((sum, line) => sum + lineTotal(line) * (line.taxRate / 100), 0);
}

function orderTotal(order: PurchaseOrder) {
  return subtotal(order) + taxTotal(order);
}

function orderBalance(order: PurchaseOrder) {
  return order.lines.reduce((sum, line) => sum + Math.max(line.quantityOrdered - line.quantityReceived, 0), 0);
}

function receivedPercent(order: PurchaseOrder) {
  const ordered = order.lines.reduce((sum, line) => sum + line.quantityOrdered, 0);
  const received = order.lines.reduce((sum, line) => sum + line.quantityReceived, 0);
  if (!ordered) return 0;
  return Math.round((received / ordered) * 100);
}

function statusTone(status: PoStatus) {
  if (status === 'Draft') return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
  if (status === 'Pending Review' || status === 'Reviewed') {
    return 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900';
  }
  if (status === 'Authorised') {
    return 'bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900';
  }
  if (status === 'Printed' || status === 'Part Received') {
    return 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900';
  }
  if (status === 'Received' || status === 'Completed') {
    return 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900';
  }
  return 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900';
}

function actionForStatus(status: PoStatus) {
  if (status === 'Draft') return 'Modify PO';
  if (status === 'Pending Review') return 'Review';
  if (status === 'Reviewed') return 'Authorise';
  if (status === 'Authorised') return 'Print';
  if (status === 'Printed' || status === 'Part Received') return 'Receive';
  if (status === 'Received') return 'Match bill';
  return 'View';
}

function canReceive(order: PurchaseOrder) {
  return order.status === 'Printed' || order.status === 'Part Received';
}

function canPrint(order: PurchaseOrder) {
  return order.status === 'Authorised' || order.allowPrint;
}

export function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('outstanding');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('outstanding');
  const [locationFilter, setLocationFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showDetails, setShowDetails] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadedFromDatabase, setLoadedFromDatabase] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [lookupSuppliers, setLookupSuppliers] = useState<SupplierLookup[]>(suppliers);
  const [lookupLocations, setLookupLocations] = useState<LookupOption[]>(locations);
  const [lookupCategories, setLookupCategories] = useState<LookupOption[]>(categoryOptions.filter((option) => option.value !== 'All'));
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierReference, setSupplierReference] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [receiptQty, setReceiptQty] = useState<Record<string, number>>({});
  const [completedLines, setCompletedLines] = useState<Record<string, boolean>>({});
  const [draftSupplier, setDraftSupplier] = useState('AFRI D10');
  const [draftLocation, setDraftLocation] = useState('ADMINISTRATION');
  const [draftDeliveryDate, setDraftDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftRequisition, setDraftRequisition] = useState('REQ-0521');
  const [draftComments, setDraftComments] = useState('Created from Akiva purchase order workbench.');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    {
      draftId: 'draft-1',
      id: 'draft-1',
      ...catalog[0],
      quantityOrdered: 1,
      quantityReceived: 0,
      quantityInvoiced: 0,
      deliveryDate: new Date().toISOString().slice(0, 10),
      completed: false,
    },
  ]);

  const selectedOrder = orders.find((order) => order.id === selectedId) ?? orders[0] ?? initialOrders[0];

  useEffect(() => {
    let cancelled = false;

    async function loadPurchaseOrders() {
      setLoadingOrders(true);
      setLoadError('');

      try {
        const response = await apiFetch(buildApiUrl('/api/purchases/orders?limit=500'));
        if (!response.ok) {
          throw new Error(`Purchase order API returned ${response.status}`);
        }

        const payload = (await response.json()) as PurchaseOrdersApiResponse;
        const rows = Array.isArray(payload.data) ? payload.data : [];

        if (cancelled) return;

        setOrders(rows);
        setLoadedFromDatabase(true);
        if (rows.length > 0) {
          setSelectedId(rows[0].id);
          const sortedDates = rows.map((order) => order.orderDate).filter(Boolean).sort();
          setDateRange({
            from: sortedDates[0],
            to: sortedDates[sortedDates.length - 1],
            preset: 'custom',
          });
        }

        if (payload.lookups?.suppliers?.length) {
          setLookupSuppliers(payload.lookups.suppliers);
          const currentSupplierStillExists = payload.lookups.suppliers.some((supplier) => supplier.value === draftSupplier);
          if (!currentSupplierStillExists) setDraftSupplier(payload.lookups.suppliers[0].value);
        }
        if (payload.lookups?.locations?.length) {
          setLookupLocations(payload.lookups.locations);
          const currentLocationStillExists = payload.lookups.locations.some((location) => location.value === draftLocation);
          if (!currentLocationStillExists) setDraftLocation(payload.lookups.locations[0].value);
        }
        if (payload.lookups?.categories?.length) {
          setLookupCategories(payload.lookups.categories);
        }
      } catch (error) {
        if (cancelled) return;
        setOrders([]);
        setLoadedFromDatabase(false);
        setLoadError(error instanceof Error ? error.message : 'Could not load purchase orders.');
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }

    loadPurchaseOrders();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      const tabMatch =
        activeTab === 'all' ||
        (activeTab === 'outstanding' && !['Completed', 'Cancelled', 'Rejected'].includes(order.status)) ||
        (activeTab === 'approvals' && ['Pending Review', 'Reviewed'].includes(order.status)) ||
        (activeTab === 'receiving' && canReceive(order)) ||
        (activeTab === 'billMatch' && order.status === 'Received');
      const statusMatch =
        statusFilter === 'all' ||
        (statusFilter === 'outstanding' && !['Completed', 'Cancelled', 'Rejected'].includes(order.status)) ||
        order.status === statusFilter;
      const locationMatch = locationFilter === 'All' || order.location === locationFilter;
      const categoryMatch = categoryFilter === 'All' || order.lines.some((line) => line.category === categoryFilter);
      const searchMatch =
        !needle ||
        order.orderNumber.toLowerCase().includes(needle) ||
        order.realOrderNumber.toLowerCase().includes(needle) ||
        order.supplierName.toLowerCase().includes(needle) ||
        order.supplierCode.toLowerCase().includes(needle) ||
        order.requisitionNo.toLowerCase().includes(needle) ||
        order.lines.some((line) => `${line.itemCode} ${line.description} ${line.supplierItem}`.toLowerCase().includes(needle));
      const fromMatch = !dateRange.from || order.orderDate >= dateRange.from;
      const toMatch = !dateRange.to || order.orderDate <= dateRange.to;
      return tabMatch && statusMatch && locationMatch && categoryMatch && searchMatch && fromMatch && toMatch;
    });
  }, [activeTab, categoryFilter, dateRange.from, dateRange.to, locationFilter, orders, query, statusFilter]);

  const metrics = useMemo(() => {
    const open = orders.filter((order) => !['Completed', 'Cancelled', 'Rejected'].includes(order.status));
    const receiveQueue = orders.filter(canReceive);
    const billQueue = orders.filter((order) => order.status === 'Received');
    return {
      openCommitment: open.reduce((sum, order) => sum + orderTotal(order), 0),
      waitingApproval: orders.filter((order) => ['Pending Review', 'Reviewed'].includes(order.status)).length,
      readyToReceive: receiveQueue.length,
      grnAccrual: billQueue.reduce((sum, order) => sum + orderTotal(order), 0),
    };
  }, [orders]);

  const columns = useMemo<AdvancedTableColumn<PurchaseOrder>[]>(
    () => [
      {
        id: 'order',
        header: 'Order #',
        accessor: (order) => `${order.orderNumber} ${order.realOrderNumber}`,
        cell: (order) => (
          <button
            type="button"
            onClick={() => openDrawer(order, 'view')}
            className="text-left font-mono text-sm font-semibold text-akiva-accent hover:underline"
          >
            {order.orderNumber}
            <span className="block font-sans text-xs font-medium text-akiva-text-muted">{order.realOrderNumber}</span>
          </button>
        ),
        exportValue: (order) => order.orderNumber,
        width: 126,
      },
      {
        id: 'supplier',
        header: 'Supplier',
        accessor: (order) => `${order.supplierName} ${order.supplierCode}`,
        cell: (order) => (
          <div className="min-w-0">
            <p className="truncate font-semibold">{order.supplierName}</p>
            <p className="truncate text-xs text-akiva-text-muted">{order.supplierCode}</p>
          </div>
        ),
        width: 280,
      },
      {
        id: 'orderDate',
        header: 'Order Date',
        accessor: (order) => order.orderDate,
        cell: (order) => formatDate(order.orderDate),
        sortValue: (order) => order.orderDate,
        width: 140,
      },
      {
        id: 'deliveryDate',
        header: 'Delivery Date',
        accessor: (order) => order.deliveryDate,
        cell: (order) => formatDate(order.deliveryDate),
        sortValue: (order) => order.deliveryDate,
        width: 150,
      },
      {
        id: 'initiatedBy',
        header: 'Initiated By',
        accessor: (order) => order.initiatedBy,
        width: 150,
      },
      {
        id: 'location',
        header: 'Into Stock',
        accessor: (order) => order.location,
        width: 150,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (order) => order.status,
        cell: (order) => <StatusPill status={order.status} />,
        width: 150,
      },
      {
        id: 'received',
        header: 'Received',
        accessor: (order) => receivedPercent(order),
        cell: (order) => <ProgressCell percent={receivedPercent(order)} balance={orderBalance(order)} />,
        exportValue: (order) => `${receivedPercent(order)}%`,
        align: 'right',
        width: 160,
      },
      {
        id: 'total',
        header: 'Order Total',
        accessor: (order) => orderTotal(order),
        cell: (order) => <span className="font-semibold">{money(orderTotal(order), order.currency)}</span>,
        align: 'right',
        width: 160,
      },
      {
        id: 'action',
        header: 'Action',
        accessor: (order) => actionForStatus(order.status),
        filterable: false,
        sortable: false,
        cell: (order) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant={canReceive(order) ? 'success' : 'secondary'} onClick={() => primaryAction(order)}>
              {actionForStatus(order.status)}
            </Button>
          </div>
        ),
        align: 'right',
        width: 170,
      },
    ],
    [orders]
  );

  function openDrawer(order: PurchaseOrder, mode: Exclude<DrawerMode, null>) {
    setSelectedId(order.id);
    if (mode === 'receive') {
      setSupplierReference(order.supplierReference ?? '');
      setDeliveryNote(order.deliveryNote ?? '');
      setReceiptQty({});
      setCompletedLines({});
    }
    setDrawerMode(mode);
  }

  function primaryAction(order: PurchaseOrder) {
    if (order.status === 'Draft') {
      openDrawer(order, 'create');
      return;
    }
    if (order.status === 'Pending Review' || order.status === 'Reviewed') {
      openDrawer(order, 'review');
      return;
    }
    if (order.status === 'Authorised') {
      transitionOrder(order.id, 'Printed', 'Printed and marked ready to receive');
      return;
    }
    if (canReceive(order)) {
      openDrawer(order, 'receive');
      return;
    }
    openDrawer(order, 'view');
  }

  function transitionOrder(orderId: string, status: PoStatus, eventLabel: string) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status,
              allowPrint: status === 'Authorised' || status === 'Printed' || order.allowPrint,
              events: [{ label: eventLabel, by: 'John Doe', at: 'Today' }, ...order.events],
            }
          : order
      )
    );
  }

  function addDraftLine() {
    const item = catalog[draftLines.length % catalog.length];
    setDraftLines((current) => [
      ...current,
      {
        draftId: `draft-${current.length + 1}`,
        id: `draft-${current.length + 1}`,
        ...item,
        quantityOrdered: 1,
        quantityReceived: 0,
        quantityInvoiced: 0,
        deliveryDate: draftDeliveryDate,
        completed: false,
      },
    ]);
  }

  function saveDraftOrder(status: PoStatus) {
    const supplier = lookupSuppliers.find((item) => item.value === draftSupplier) ?? lookupSuppliers[0] ?? suppliers[0];
    const order: PurchaseOrder = {
      id: `po-${Date.now()}`,
      orderNumber: String(521 + orders.length),
      realOrderNumber: `PO-2026-${String(521 + orders.length).padStart(5, '0')}`,
      supplierCode: supplier.value,
      supplierName: supplier.label,
      supplierAddress: supplier.address ?? '',
      currency: supplier.currency ?? 'TZS',
      exchangeRate: 1,
      orderDate: new Date().toISOString().slice(0, 10),
      deliveryDate: draftDeliveryDate,
      initiatedBy: 'John Doe',
      reviewer: 'Procurement Lead',
      location: draftLocation,
      requisitionNo: draftRequisition,
      paymentTerms: '30 days',
      deliveryBy: 'Supplier',
      comments: draftComments,
      status,
      allowPrint: false,
      lines: draftLines.map(({ draftId, ...line }) => line),
      events: [{ label: status === 'Draft' ? 'Draft created' : 'Submitted for review', by: 'John Doe', at: 'Today' }],
    };
    setOrders((current) => [order, ...current]);
    setSelectedId(order.id);
    setDrawerMode('view');
  }

  function postReceipt() {
    setOrders((current) =>
      current.map((order) => {
        if (order.id !== selectedOrder.id) return order;
        const lines = order.lines.map((line) => {
          const postedQty = Math.max(0, Number(receiptQty[line.id] ?? 0));
          const nextReceived = Math.min(line.quantityOrdered, line.quantityReceived + postedQty);
          return {
            ...line,
            quantityReceived: nextReceived,
            completed: completedLines[line.id] ?? nextReceived >= line.quantityOrdered,
          };
        });
        const allReceived = lines.every((line) => line.quantityReceived >= line.quantityOrdered || line.completed);
        const anyReceived = lines.some((line) => line.quantityReceived > 0);
        return {
          ...order,
          lines,
          status: allReceived ? 'Received' : anyReceived ? 'Part Received' : order.status,
          supplierReference,
          deliveryNote,
          events: [
            {
              label: `GRN posted on ${formatDate(receiveDate)}${supplierReference ? `, supplier ref ${supplierReference}` : ''}`,
              by: 'Stores Clerk',
              at: 'Today',
            },
            ...order.events,
          ],
        };
      })
    );
    setDrawerMode('view');
  }

  const openQueuedOrders = orders.filter((order) => ['Pending Review', 'Reviewed', 'Printed', 'Part Received', 'Received'].includes(order.status));

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Chip icon={PackageCheck}>Inventory transactions</Chip>
                  <Chip icon={FileText}>PO_SelectOSPurchOrder</Chip>
                  <Chip icon={ShieldCheck}>PO to GRN to AP match</Chip>
                  <Chip icon={loadedFromDatabase ? CheckCircle2 : AlertTriangle}>
                    {loadingOrders ? 'Loading live POs' : loadedFromDatabase ? `Live database · ${orders.length} POs` : 'Database not loaded'}
                  </Chip>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                  Purchase Orders
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  Create purchase commitments, route them through review and authorisation, print or send authorised orders, receive goods into stock, and hold GRNs for supplier bill matching.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <IconButton icon={RefreshCw} label="Refresh purchase orders" onClick={() => setReloadKey((value) => value + 1)} />
                <IconButton icon={Download} label="Export purchase order queue" />
                <IconButton
                  icon={SlidersHorizontal}
                  label={filtersOpen ? 'Hide filters' : 'Show filters'}
                  onClick={() => setFiltersOpen((open) => !open)}
                  active={filtersOpen}
                />
                <Button onClick={() => setDrawerMode('create')}>
                  <Plus className="mr-2 h-4 w-4" />
                  New PO
                </Button>
              </div>
            </div>
          </header>

          {filtersOpen ? (
            <div className="border-b border-akiva-border bg-akiva-surface/70 px-4 py-3 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 md:grid-cols-4 2xl:grid-cols-[minmax(240px,1.2fr)_180px_180px_minmax(220px,1fr)_190px_150px]">
                <div className="relative min-[520px]:col-span-2 md:col-span-2 2xl:col-span-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className={`${inputClass} pl-10`}
                    placeholder="Search PO, supplier, requisition, item"
                  />
                </div>
                <SearchableSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  inputClassName={inputClass}
                  placeholder="Order status"
                />
                <SearchableSelect
                  value={locationFilter}
                  onChange={setLocationFilter}
                  options={[{ value: 'All', label: 'All locations' }, ...lookupLocations]}
                  inputClassName={inputClass}
                  placeholder="Stock location"
                />
                <DateRangePicker value={dateRange} onChange={setDateRange} className="min-[520px]:col-span-2 md:col-span-2 2xl:col-span-1" />
                <SearchableSelect
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  options={[{ value: 'All', label: 'All categories' }, ...lookupCategories]}
                  inputClassName={inputClass}
                  placeholder="Stock category"
                />
                <label className="flex h-11 items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm shadow-sm">
                  <span className="text-akiva-text-muted">Details</span>
                  <input
                    type="checkbox"
                    checked={showDetails}
                    onChange={(event) => setShowDetails(event.target.checked)}
                    className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
            <main className="space-y-4 lg:col-span-8">
              <GuidedActionPanel
                order={openQueuedOrders[0] ?? filteredOrders[0]}
                loading={loadingOrders}
                live={loadedFromDatabase}
                error={loadError}
                onAction={(order) => primaryAction(order)}
                onRefresh={() => setReloadKey((value) => value + 1)}
              />

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Open commitments" value={money(metrics.openCommitment, 'TZS')} detail="Unclosed POs still reserving budget." icon={FileText} />
                <MetricCard label="Waiting approval" value={String(metrics.waitingApproval)} detail="Review or authorise before print." icon={ShieldCheck} />
                <MetricCard label="Ready to receive" value={String(metrics.readyToReceive)} detail="Printed POs that can post GRNs." icon={Truck} />
                <MetricCard label="GRN accrual" value={money(metrics.grnAccrual, 'TZS')} detail="Received goods awaiting supplier invoice." icon={FileCheck2} />
              </div>

              <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                <div className="border-b border-akiva-border px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                            active
                              ? 'border-akiva-accent bg-akiva-accent text-white shadow-sm'
                              : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="p-4">
                  <AdvancedTable
                    tableId="purchase-order-workbench"
                    columns={columns}
                    rows={filteredOrders}
                    rowKey={(order) => order.id}
                    loading={loadingOrders}
                    loadingMessage="Loading purchase orders from webERP tables..."
                    emptyMessage={loadError ? `Could not load live purchase orders: ${loadError}` : 'No purchase orders match these filters.'}
                    initialPageSize={10}
                  />
                </div>
              </section>
            </main>

            <aside className="space-y-4 lg:col-span-4">
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Next best actions</h2>
                    <p className="mt-1 text-sm leading-5 text-akiva-text-muted">The queue is ordered by accounting risk and user action.</p>
                  </div>
                  <Clock3 className="h-5 w-5 text-akiva-accent" />
                </div>
                <div className="mt-4 space-y-2.5">
                  {openQueuedOrders.slice(0, 5).map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => primaryAction(order)}
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-akiva-text">{actionForStatus(order.status)} PO {order.orderNumber}</span>
                        <span className="mt-1 block truncate text-xs text-akiva-text-muted">{order.supplierName}</span>
                      </span>
                      <StatusPill status={order.status} />
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-akiva-text">Accounting controls</h2>
                    <p className="mt-1 text-sm leading-5 text-akiva-text-muted">Controls required for clean PO, GRN and AP matching.</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-akiva-accent" />
                </div>
                <div className="mt-4 space-y-2.5">
                  <ChecklistRow checked title="Authorise before sending" description="Only authorised POs can be printed or sent to suppliers." />
                  <ChecklistRow checked title="Receive only printed orders" description="GRNs are posted only against supplier-visible purchase orders." />
                  <ChecklistRow checked title="Post GRN accrual" description="Inventory or expense is debited while GRN suspense is credited." />
                  <ChecklistRow checked={false} title="Invoice match pending" description="Supplier invoices should match PO price and GRN quantity before AP posting." />
                </div>
              </section>

              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-akiva-text">Selected PO</h2>
                <div className="mt-4 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-semibold text-akiva-accent">PO {selectedOrder.orderNumber}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-akiva-text">{selectedOrder.supplierName}</p>
                    </div>
                    <StatusPill status={selectedOrder.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <InfoTile label="Value" value={money(orderTotal(selectedOrder), selectedOrder.currency)} />
                    <InfoTile label="Received" value={`${receivedPercent(selectedOrder)}%`} />
                    <InfoTile label="Location" value={selectedOrder.location} />
                    <InfoTile label="Due" value={formatDate(selectedOrder.deliveryDate)} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button variant="secondary" size="sm" onClick={() => setDrawerMode('view')}>Open</Button>
                    <Button size="sm" onClick={() => primaryAction(selectedOrder)}>{actionForStatus(selectedOrder.status)}</Button>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>

      <RightDrawer
        isOpen={drawerMode !== null}
        onClose={() => setDrawerMode(null)}
        title={drawerTitle(drawerMode, selectedOrder)}
        subtitle={drawerSubtitle(drawerMode, selectedOrder)}
      >
        {drawerMode === 'create' ? (
          <CreatePurchaseOrderPanel
            supplier={draftSupplier}
            location={draftLocation}
            supplierOptions={lookupSuppliers}
            locationOptions={lookupLocations}
            deliveryDate={draftDeliveryDate}
            requisition={draftRequisition}
            comments={draftComments}
            lines={draftLines}
            onSupplierChange={setDraftSupplier}
            onLocationChange={setDraftLocation}
            onDeliveryDateChange={setDraftDeliveryDate}
            onRequisitionChange={setDraftRequisition}
            onCommentsChange={setDraftComments}
            onLineChange={(draftId, patch) =>
              setDraftLines((current) => current.map((line) => (line.draftId === draftId ? { ...line, ...patch } : line)))
            }
            onAddLine={addDraftLine}
            onSaveDraft={() => saveDraftOrder('Draft')}
            onSubmit={() => saveDraftOrder('Pending Review')}
          />
        ) : null}

        {drawerMode === 'receive' ? (
          <ReceivePurchaseOrderPanel
            order={selectedOrder}
            receiveDate={receiveDate}
            supplierReference={supplierReference}
            deliveryNote={deliveryNote}
            receiptQty={receiptQty}
            completedLines={completedLines}
            onReceiveDateChange={setReceiveDate}
            onSupplierReferenceChange={setSupplierReference}
            onDeliveryNoteChange={setDeliveryNote}
            onQtyChange={(lineId, qty) => setReceiptQty((current) => ({ ...current, [lineId]: qty }))}
            onCompleteChange={(lineId, checked) => setCompletedLines((current) => ({ ...current, [lineId]: checked }))}
            onPost={postReceipt}
          />
        ) : null}

        {drawerMode === 'review' ? (
          <ReviewPurchaseOrderPanel
            order={selectedOrder}
            onReview={() => transitionOrder(selectedOrder.id, 'Reviewed', 'Reviewed by John Doe')}
            onAuthorise={() => transitionOrder(selectedOrder.id, 'Authorised', 'Authorised by John Doe')}
            onReject={() => transitionOrder(selectedOrder.id, 'Rejected', 'Rejected by John Doe')}
          />
        ) : null}

        {drawerMode === 'view' ? <PurchaseOrderDetailPanel order={selectedOrder} onAction={() => primaryAction(selectedOrder)} /> : null}
      </RightDrawer>
    </div>
  );
}

function drawerTitle(mode: DrawerMode, order: PurchaseOrder) {
  if (mode === 'create') return 'Create Purchase Order';
  if (mode === 'receive') return `Receive PO ${order.orderNumber}`;
  if (mode === 'review') return `Review PO ${order.orderNumber}`;
  if (mode === 'view') return `Purchase Order ${order.orderNumber}`;
  return 'Purchase Order';
}

function drawerSubtitle(mode: DrawerMode, order: PurchaseOrder) {
  if (mode === 'create') return 'Supplier, delivery, stock items and approval route';
  if (mode === 'receive') return `${order.supplierName} into ${order.location}`;
  if (mode === 'review') return `${money(orderTotal(order), order.currency)} requested by ${order.initiatedBy}`;
  if (mode === 'view') return `${order.supplierName} · ${order.requisitionNo}`;
  return undefined;
}

function CreatePurchaseOrderPanel({
  supplier,
  location,
  supplierOptions,
  locationOptions,
  deliveryDate,
  requisition,
  comments,
  lines,
  onSupplierChange,
  onLocationChange,
  onDeliveryDateChange,
  onRequisitionChange,
  onCommentsChange,
  onLineChange,
  onAddLine,
  onSaveDraft,
  onSubmit,
}: {
  supplier: string;
  location: string;
  supplierOptions: SupplierLookup[];
  locationOptions: LookupOption[];
  deliveryDate: string;
  requisition: string;
  comments: string;
  lines: DraftLine[];
  onSupplierChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onDeliveryDateChange: (value: string) => void;
  onRequisitionChange: (value: string) => void;
  onCommentsChange: (value: string) => void;
  onLineChange: (draftId: string, patch: Partial<DraftLine>) => void;
  onAddLine: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
}) {
  const selectedSupplier = supplierOptions.find((item) => item.value === supplier) ?? supplierOptions[0] ?? suppliers[0];
  const previewOrder: PurchaseOrder = {
    id: 'preview',
    orderNumber: 'Preview',
    realOrderNumber: 'Preview',
    supplierCode: selectedSupplier.value,
    supplierName: selectedSupplier.label,
    supplierAddress: selectedSupplier.address ?? '',
    currency: selectedSupplier.currency ?? 'TZS',
    exchangeRate: 1,
    orderDate: new Date().toISOString().slice(0, 10),
    deliveryDate,
    initiatedBy: 'John Doe',
    reviewer: 'Procurement Lead',
    location,
    requisitionNo: requisition,
    paymentTerms: '30 days',
    deliveryBy: 'Supplier',
    comments,
    status: 'Draft',
    allowPrint: false,
    lines,
    events: [],
  };

  return (
    <div className="space-y-4">
      <PanelSection title="Supplier and delivery">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supplier name or code">
            <SearchableSelect value={supplier} onChange={onSupplierChange} options={supplierOptions} inputClassName={inputClass} />
          </Field>
          <Field label="Into stock location">
            <SearchableSelect value={location} onChange={onLocationChange} options={locationOptions} inputClassName={inputClass} />
          </Field>
          <Field label="Required delivery date">
            <DatePicker value={deliveryDate} onChange={onDeliveryDateChange} />
          </Field>
          <Field label="Requisition number">
            <input className={inputClass} value={requisition} onChange={(event) => onRequisitionChange(event.target.value)} />
          </Field>
        </div>
        <Field label="Comments">
          <textarea
            rows={3}
            className={`${inputClass} h-auto min-h-24 py-3`}
            value={comments}
            onChange={(event) => onCommentsChange(event.target.value)}
          />
        </Field>
      </PanelSection>

      <PanelSection title="Order items">
        <div className="space-y-3">
          {lines.map((line) => (
            <DraftLineEditor key={line.draftId} line={line} currency={selectedSupplier.currency} onChange={(patch) => onLineChange(line.draftId, patch)} />
          ))}
          <Button variant="secondary" onClick={onAddLine}>
            <Plus className="mr-2 h-4 w-4" />
            Add item
          </Button>
        </div>
      </PanelSection>

      <PanelSection title="Review and submit">
        <Totals order={previewOrder} />
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
          Submitting starts the review path. Authorised orders can be printed, then goods can be received against a GRN.
        </div>
      </PanelSection>
      <DrawerActionBar
        secondaryLabel="Save draft"
        onSecondary={onSaveDraft}
        primaryLabel="Submit for review"
        primaryIcon={Send}
        onPrimary={onSubmit}
      />
    </div>
  );
}

function DraftLineEditor({ line, currency, onChange }: { line: DraftLine; currency: PurchaseOrder['currency']; onChange: (patch: Partial<DraftLine>) => void }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_110px_130px_120px]">
        <Field label="Item">
          <SearchableSelect
            value={line.itemCode}
            onChange={(value) => {
              const item = catalog.find((candidate) => candidate.itemCode === value);
              if (item) onChange({ ...item });
            }}
            options={catalog.map((item) => ({ value: item.itemCode, label: `${item.itemCode} - ${item.description}` }))}
            inputClassName={inputClass}
          />
        </Field>
        <Field label="Qty">
          <input
            className={`${inputClass} text-right`}
            type="number"
            min={1}
            value={line.quantityOrdered}
            onChange={(event) => onChange({ quantityOrdered: Number(event.target.value) })}
          />
        </Field>
        <Field label="Unit price">
          <input
            className={`${inputClass} text-right`}
            type="number"
            min={0}
            value={line.unitPrice}
            onChange={(event) => onChange({ unitPrice: Number(event.target.value) })}
          />
        </Field>
        <Field label="GL code">
          <input className={inputClass} value={line.glCode} onChange={(event) => onChange({ glCode: event.target.value })} />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-akiva-text-muted">
          {line.description} · supplier unit {line.supplierUnits} · receiving unit {line.receivingUnits}
        </span>
        <span className="font-semibold">{money(lineTotal(line), currency)}</span>
      </div>
    </div>
  );
}

function ReceivePurchaseOrderPanel({
  order,
  receiveDate,
  supplierReference,
  deliveryNote,
  receiptQty,
  completedLines,
  onReceiveDateChange,
  onSupplierReferenceChange,
  onDeliveryNoteChange,
  onQtyChange,
  onCompleteChange,
  onPost,
}: {
  order: PurchaseOrder;
  receiveDate: string;
  supplierReference: string;
  deliveryNote: string;
  receiptQty: Record<string, number>;
  completedLines: Record<string, boolean>;
  onReceiveDateChange: (value: string) => void;
  onSupplierReferenceChange: (value: string) => void;
  onDeliveryNoteChange: (value: string) => void;
  onQtyChange: (lineId: string, qty: number) => void;
  onCompleteChange: (lineId: string, checked: boolean) => void;
  onPost: () => void;
}) {
  const receiptValue = order.lines.reduce((sum, line) => sum + Math.max(0, Number(receiptQty[line.id] ?? 0)) * line.unitPrice, 0);
  return (
    <div className="space-y-4">
      <PanelSection title="Receipt header">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Goods/service received">
            <DatePicker value={receiveDate} onChange={onReceiveDateChange} />
          </Field>
          <Field label="Supplier reference">
            <input className={inputClass} value={supplierReference} onChange={(event) => onSupplierReferenceChange(event.target.value)} />
          </Field>
          <Field label="Delivery note">
            <input className={inputClass} value={deliveryNote} onChange={(event) => onDeliveryNoteChange(event.target.value)} />
          </Field>
        </div>
      </PanelSection>

      <PanelSection title="Receive quantities">
        <div className="overflow-x-auto rounded-lg border border-akiva-border">
          <table className="w-full min-w-[860px] table-fixed">
            <thead className="bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-text-muted">
              <tr>
                <th className="w-32 px-3 py-2 text-left">Item Code</th>
                <th className="w-64 px-3 py-2 text-left">Description</th>
                <th className="w-24 px-3 py-2 text-right">Ordered</th>
                <th className="w-28 px-3 py-2 text-right">Received</th>
                <th className="w-32 px-3 py-2 text-right">This Delivery</th>
                <th className="w-28 px-3 py-2 text-center">Complete</th>
                <th className="w-28 px-3 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => {
                const balance = Math.max(line.quantityOrdered - line.quantityReceived, 0);
                const qty = Math.max(0, Number(receiptQty[line.id] ?? 0));
                const over = qty > balance;
                return (
                  <tr key={line.id} className="border-t border-akiva-border">
                    <td className="px-3 py-2 font-mono text-sm font-semibold">{line.itemCode}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className="font-semibold">{line.description}</span>
                      <span className="block text-xs text-akiva-text-muted">Supplier item {line.supplierItem} · conversion {line.conversionFactor}</span>
                      {line.controlled ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
                          <AlertTriangle className="h-3 w-3" />
                          batch or serial required
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-sm">{line.quantityOrdered} {line.supplierUnits}</td>
                    <td className="px-3 py-2 text-right text-sm">{line.quantityReceived} {line.receivingUnits}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        className={`${inputClass} text-right ${over ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500' : ''}`}
                        type="number"
                        min={0}
                        max={balance}
                        value={receiptQty[line.id] ?? ''}
                        onChange={(event) => onQtyChange(line.id, Number(event.target.value))}
                        placeholder="0"
                      />
                      {over ? <span className="mt-1 block text-xs text-rose-600">Above balance {balance}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={completedLines[line.id] ?? line.completed ?? false}
                        onChange={(event) => onCompleteChange(line.id, event.target.checked)}
                        className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-sm font-semibold">{money(qty * line.unitPrice, order.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-akiva-text">GRN accounting impact</p>
            <p className="mt-1 text-xs text-akiva-text-muted">Debit inventory or expense GL, credit GRN suspense until the supplier invoice is matched.</p>
          </div>
          <p className="text-xl font-semibold">{money(receiptValue, order.currency)}</p>
        </div>
      </PanelSection>
      <DrawerActionBar
        primaryLabel="Process goods received"
        primaryIcon={PackageCheck}
        onPrimary={onPost}
        primaryVariant="success"
      />
    </div>
  );
}

function ReviewPurchaseOrderPanel({
  order,
  onReview,
  onAuthorise,
  onReject,
}: {
  order: PurchaseOrder;
  onReview: () => void;
  onAuthorise: () => void;
  onReject: () => void;
}) {
  return (
    <div className="space-y-4">
      <PanelSection title="Approval summary">
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoTile label="Supplier" value={order.supplierName} />
          <InfoTile label="Requested by" value={order.initiatedBy} />
          <InfoTile label="Order value" value={money(orderTotal(order), order.currency)} />
          <InfoTile label="Delivery date" value={formatDate(order.deliveryDate)} />
        </div>
      </PanelSection>
      <PurchaseOrderLines order={order} />
      <PanelSection title="Approval action">
        <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-sm text-akiva-text-muted">
          Reviewing confirms supplier, budget, GL coding and quantities. Authorising permits print/send. Changes after authorisation should return the PO to review.
        </div>
      </PanelSection>
      <DrawerActionBar
        secondaryLabel={order.status === 'Pending Review' ? 'Mark reviewed' : 'Reject'}
        secondaryIcon={order.status === 'Pending Review' ? ClipboardCheck : undefined}
        secondaryVariant={order.status === 'Pending Review' ? 'secondary' : 'danger'}
        onSecondary={order.status === 'Pending Review' ? onReview : onReject}
        primaryLabel="Authorise"
        primaryIcon={ShieldCheck}
        onPrimary={onAuthorise}
        primaryDisabled={order.status === 'Pending Review'}
      />
    </div>
  );
}

function PurchaseOrderDetailPanel({ order, onAction }: { order: PurchaseOrder; onAction: () => void }) {
  return (
    <div className="space-y-4">
      <PanelSection>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <StatusPill status={order.status} />
            <h2 className="mt-3 text-lg font-semibold text-akiva-text">{order.supplierName}</h2>
            <p className="mt-1 text-sm leading-6 text-akiva-text-muted">{order.comments}</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Order total</p>
            <p className="mt-1 text-2xl font-semibold">{money(orderTotal(order), order.currency)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <InfoTile label="Location" value={order.location} />
          <InfoTile label="Delivery" value={formatDate(order.deliveryDate)} />
          <InfoTile label="Terms" value={order.paymentTerms} />
          <InfoTile label="Requisition" value={order.requisitionNo} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={onAction}>{actionForStatus(order.status)}</Button>
          <Button variant="secondary" disabled={!canPrint(order)}>
            <Printer className="mr-2 h-4 w-4" />
            Print / PDF
          </Button>
          <Button variant="secondary" disabled={order.status !== 'Received'}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            Match supplier bill
          </Button>
        </div>
      </PanelSection>
      <PurchaseOrderLines order={order} />
      <PanelSection title="Three-way match">
        <div className="grid gap-3 sm:grid-cols-3">
          <MatchTile label="Ordered" value={order.lines.reduce((sum, line) => sum + line.quantityOrdered, 0)} icon={FileText} />
          <MatchTile label="Received" value={order.lines.reduce((sum, line) => sum + line.quantityReceived, 0)} icon={Truck} />
          <MatchTile label="Invoiced" value={order.lines.reduce((sum, line) => sum + line.quantityInvoiced, 0)} icon={ClipboardCheck} />
        </div>
      </PanelSection>
      <PanelSection title="Audit trail">
        <div className="space-y-2">
          {order.events.map((event) => (
            <div key={`${event.label}-${event.at}`} className="flex items-start gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 shadow-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-akiva-accent" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-akiva-text">{event.label}</p>
                <p className="mt-0.5 text-xs text-akiva-text-muted">{event.by} · {event.at}</p>
              </div>
            </div>
          ))}
        </div>
      </PanelSection>
      <DrawerActionBar
        secondaryLabel="Print / PDF"
        secondaryIcon={Printer}
        secondaryDisabled={!canPrint(order)}
        onSecondary={() => undefined}
        primaryLabel={actionForStatus(order.status)}
        onPrimary={onAction}
      />
    </div>
  );
}

function PurchaseOrderLines({ order }: { order: PurchaseOrder }) {
  return (
    <PanelSection title="Purchase order lines">
      <div className="overflow-x-auto rounded-lg border border-akiva-border">
        <table className="w-full min-w-[840px] table-fixed">
          <thead className="bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-text-muted">
            <tr>
              <th className="w-32 px-3 py-2 text-left">Item Code</th>
              <th className="w-64 px-3 py-2 text-left">Description</th>
              <th className="w-28 px-3 py-2 text-right">Ordered</th>
              <th className="w-28 px-3 py-2 text-right">Received</th>
              <th className="w-28 px-3 py-2 text-right">Invoiced</th>
              <th className="w-28 px-3 py-2 text-right">Unit price</th>
              <th className="w-32 px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id} className="border-t border-akiva-border">
                <td className="px-3 py-2 font-mono text-sm font-semibold">{line.itemCode}</td>
                <td className="px-3 py-2 text-sm">
                  <span className="font-semibold">{line.description}</span>
                  <span className="block text-xs text-akiva-text-muted">{line.category} · supplier item {line.supplierItem}</span>
                </td>
                <td className="px-3 py-2 text-right text-sm">{line.quantityOrdered} {line.supplierUnits}</td>
                <td className="px-3 py-2 text-right text-sm">{line.quantityReceived} {line.receivingUnits}</td>
                <td className="px-3 py-2 text-right text-sm">{line.quantityInvoiced}</td>
                <td className="px-3 py-2 text-right text-sm">{money(line.unitPrice, order.currency)}</td>
                <td className="px-3 py-2 text-right text-sm font-semibold">{money(lineTotal(line), order.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Totals order={order} />
      </div>
    </PanelSection>
  );
}

function GuidedActionPanel({
  order,
  loading,
  live,
  error,
  onAction,
  onRefresh,
}: {
  order?: PurchaseOrder;
  loading: boolean;
  live: boolean;
  error: string;
  onAction: (order: PurchaseOrder) => void;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-akiva-accent" />
          <div>
            <h2 className="text-sm font-semibold text-akiva-text">Loading live purchase orders</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">Reading webERP purchase order, supplier, location and line tables.</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !order) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
            <div>
              <h2 className="text-sm font-semibold">{error ? 'Live purchase orders did not load' : 'No purchase orders found'}</h2>
              <p className="mt-1 text-sm leading-5 opacity-80">
                {error || 'The database endpoint is working, but no purchase orders matched the current company data.'}
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-akiva-accent/30 bg-akiva-accent-soft/60 p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-akiva-accent-text shadow-sm dark:bg-slate-900/70">
              Start here
            </span>
            <span className="text-xs font-semibold text-akiva-text-muted">{live ? 'Live database' : 'Local changes'}</span>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-akiva-text">
            {actionForStatus(order.status)} purchase order {order.orderNumber}
          </h2>
          <p className="mt-1 truncate text-sm text-akiva-text-muted">
            {order.supplierName} · {money(orderTotal(order), order.currency)} · {receivedPercent(order)}% received
          </p>
        </div>
        <Button onClick={() => onAction(order)} className="shrink-0">
          {actionForStatus(order.status)}
        </Button>
      </div>
    </section>
  );
}

function DrawerActionBar({
  primaryLabel,
  onPrimary,
  primaryIcon: PrimaryIcon,
  primaryVariant = 'primary',
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
  secondaryIcon: SecondaryIcon,
  secondaryVariant = 'secondary',
  secondaryDisabled = false,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  primaryIcon?: LucideIcon;
  primaryVariant?: 'primary' | 'secondary' | 'danger' | 'success';
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryIcon?: LucideIcon;
  secondaryVariant?: 'primary' | 'secondary' | 'danger' | 'success';
  secondaryDisabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 border-t border-akiva-border bg-akiva-surface-raised/95 px-4 py-3 shadow-[0_-12px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:-mx-5 sm:px-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {secondaryLabel && onSecondary ? (
          <Button variant={secondaryVariant} onClick={onSecondary} disabled={secondaryDisabled}>
            {SecondaryIcon ? <SecondaryIcon className="mr-2 h-4 w-4" /> : null}
            {secondaryLabel}
          </Button>
        ) : (
          <span />
        )}
        <Button variant={primaryVariant} onClick={onPrimary} disabled={primaryDisabled}>
          {PrimaryIcon ? <PrimaryIcon className="mr-2 h-4 w-4" /> : null}
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}

function Chip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <Icon className="h-3.5 w-3.5 text-akiva-accent" />
      {children}
    </span>
  );
}

function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition ${
        active
          ? 'border-akiva-accent bg-akiva-accent text-white'
          : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <article className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-akiva-surface-muted text-akiva-text">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-sm leading-5 text-akiva-text-muted">{detail}</p>
    </article>
  );
}

function ChecklistRow({ checked, title, description }: { checked: boolean; title: string; description: string }) {
  return (
    <label className="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-akiva-text">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{description}</span>
      </span>
      <input type="checkbox" checked={checked} readOnly className="peer sr-only" />
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border shadow-sm ${
          checked ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-transparent'
        }`}
      >
        <Check className="h-4 w-4 stroke-[3]" />
      </span>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</span>
      {children}
    </label>
  );
}

function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      {title ? <h3 className="mb-3 text-sm font-semibold text-akiva-text">{title}</h3> : null}
      {children}
    </section>
  );
}

function StatusPill({ status }: { status: PoStatus }) {
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusTone(status)}`}>{status}</span>;
}

function ProgressCell({ percent, balance }: { percent: number; balance: number }) {
  return (
    <div className="ml-auto w-32">
      <div className="flex items-center justify-between text-xs text-akiva-text-muted">
        <span>{percent}%</span>
        <span>Bal {balance}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-akiva-surface-muted">
        <div className="h-2 rounded-full bg-akiva-accent" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-akiva-text">{value}</p>
    </div>
  );
}

function MatchTile({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm">
      <Icon className="h-4 w-4 text-akiva-accent" />
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-akiva-text">{value}</p>
    </div>
  );
}

function Totals({ order }: { order: PurchaseOrder }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between gap-4">
        <span className="text-akiva-text-muted">Subtotal</span>
        <span className="font-semibold">{money(subtotal(order), order.currency)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-akiva-text-muted">Tax</span>
        <span className="font-semibold">{money(taxTotal(order), order.currency)}</span>
      </div>
      <div className="flex justify-between gap-4 border-t border-akiva-border pt-2 text-base">
        <span className="font-semibold">Total commitment</span>
        <span className="font-semibold">{money(orderTotal(order), order.currency)}</span>
      </div>
    </div>
  );
}
