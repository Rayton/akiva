import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Filter,
  Mail,
  MessageSquare,
  PackageCheck,
  PanelRightOpen,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { DatePicker } from '../components/common/DatePicker';
import { DateRangePicker, getDefaultDateRange, type DateRangeValue } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { fetchPurchasesPayablesSetup } from '../data/purchasesPayablesSetupApi';
import { fetchSystemParameters } from '../data/systemParametersApi';
import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { PoAuthorisationLevel } from '../types/purchasesPayablesSetup';

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
type OfferDecision = 'accept' | 'reject' | 'defer';

interface AuthorisationDecision {
  canReview: boolean;
  canAuthorise: boolean;
  reviewReason: string;
  authoriseReason: string;
  level: PoAuthorisationLevel | null;
}

interface PoNotificationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  loaded: boolean;
}

interface PoNotificationOptions {
  email: boolean;
  sms: boolean;
}

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

interface SupplierOffer {
  id: string;
  tenderId: string;
  supplierCode: string;
  supplierName: string;
  currency: PurchaseOrder['currency'];
  itemCode: string;
  description: string;
  quantity: number;
  units: string;
  price: number;
  expiryDate: string;
  category: string;
}

const inputClass =
  'h-11 min-w-0 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

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

const initialOffers: SupplierOffer[] = [
  {
    id: 'OFF-1012',
    tenderId: 'TEN-2407',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    currency: 'TZS',
    itemCode: 'ACCESORY016',
    description: 'GREASE',
    quantity: 12,
    units: 'kgs',
    price: 8800,
    expiryDate: '2026-05-24',
    category: 'Equipment Spares',
  },
  {
    id: 'OFF-1013',
    tenderId: 'TEN-2407',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    currency: 'TZS',
    itemCode: 'ACCESORY018',
    description: 'ELECTRODE CABLE',
    quantity: 8,
    units: 'each',
    price: 17500,
    expiryDate: '2026-05-24',
    category: 'Medical Consumables',
  },
  {
    id: 'OFF-1018',
    tenderId: 'TEN-2411',
    supplierCode: 'SUPPLIER',
    supplierName: 'PRIMECARE MEDICAL EQUIPMENT SUPPLY',
    currency: 'TZS',
    itemCode: 'PHARM-221',
    description: 'Ceftriaxone injection 1g',
    quantity: 320,
    units: 'vial',
    price: 2150,
    expiryDate: '2026-05-21',
    category: 'Pharmacy',
  },
  {
    id: 'OFF-1021',
    tenderId: 'TEN-2415',
    supplierCode: 'SUPPLIER 2',
    supplierName: 'MSD MEDICAL STORE DEPARTMENT',
    currency: 'TZS',
    itemCode: 'OFFICE-041',
    description: 'A4 printing paper ream',
    quantity: 40,
    units: 'ream',
    price: 11800,
    expiryDate: '2026-05-28',
    category: 'Administration',
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

function offerTotal(offer: SupplierOffer) {
  return offer.quantity * offer.price;
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

function currentPurchaseRoute() {
  if (typeof window === 'undefined') return '';
  return window.location.pathname.toLowerCase();
}

function navigateTo(path: string) {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new Event('akiva:navigation'));
}

function initialTabForRoute(pathname: string): WorkbenchTab {
  if (pathname.includes('offersreceived')) return 'outstanding';
  if (pathname.includes('authorise') || pathname.includes('review')) return 'approvals';
  if (pathname.includes('outstanding-grns') || pathname.includes('suppinvgrns')) return 'billMatch';
  if (pathname.includes('goods-received') || pathname.includes('receive')) return 'receiving';
  return 'outstanding';
}

function titleForRoute(pathname: string) {
  if (pathname.includes('offersreceived')) return 'Supplier Tenders and Offers';
  if (pathname.includes('po-header')) return 'New Purchase Order';
  if (pathname.includes('po-selectospurchorder')) return 'Select Purchase Order';
  if (pathname.includes('po-authorisemyorders')) return 'Purchase Order Approvals';
  if (pathname.includes('outstanding-grns') || pathname.includes('suppinvgrns')) return 'GRN Bill Matching';
  return 'Purchase Orders';
}

function descriptionForRoute(pathname: string) {
  if (pathname.includes('offersreceived')) {
    return 'Review outstanding supplier offer lines, accept the best values into a purchase order, reject unsuitable lines, or defer offers for later.';
  }
  if (pathname.includes('po-header')) {
    return 'Start a supplier purchase order with delivery details, stock location, item lines, GL coding, and review-ready totals on one page.';
  }
  if (pathname.includes('po-selectospurchorder')) {
    return 'Find the right purchase order quickly, then print, receive, review, or inspect the order without losing the queue context.';
  }
  if (pathname.includes('po-authorisemyorders')) {
    return 'Review pending purchase orders, confirm budget and GL coding, then authorise supplier-visible orders.';
  }
  if (pathname.includes('outstanding-grns') || pathname.includes('suppinvgrns')) {
    return 'Follow received goods that still need supplier invoice matching and GRN accrual clearing.';
  }
  return 'Create purchase commitments, route them through review and authorisation, print or send authorised orders, receive goods into stock, and hold GRNs for supplier bill matching.';
}

function receiptBalance(line: PoLine) {
  return Math.max(line.quantityOrdered - line.quantityReceived, 0);
}

function daysUntil(value: string) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const date = new Date(`${value}T00:00:00`);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function authProfileLabel(level: PoAuthorisationLevel) {
  return `${level.userName || level.userId} (${level.userId}) · ${level.currencyCode} · limit ${money(level.authLevel, level.currencyCode as PurchaseOrder['currency'])}`;
}

function authProfileMatches(level: PoAuthorisationLevel, user: { id: string; name: string; email: string }) {
  const candidates = [user.id, user.name, user.email.split('@')[0], user.email].map((value) => value.trim().toLowerCase()).filter(Boolean);
  return candidates.includes(level.userId.toLowerCase()) || candidates.includes(level.userName.toLowerCase());
}

function authorisationForOrder(order: PurchaseOrder, level: PoAuthorisationLevel | null): AuthorisationDecision {
  if (!level) {
    return {
      canReview: true,
      canAuthorise: true,
      reviewReason: 'Approve review or reject with a reason. Admin is assumed for now.',
      authoriseReason: 'Authorise or reject with a reason. Admin is assumed for now.',
      level: null,
    };
  }

  if (level.currencyCode !== order.currency) {
    return {
      canReview: true,
      canAuthorise: true,
      reviewReason: `Approve review or reject with a reason. Configured profile is for ${level.currencyCode}; PO is in ${order.currency}.`,
      authoriseReason: `Authorise or reject with a reason. Configured profile is for ${level.currencyCode}; PO is in ${order.currency}.`,
      level,
    };
  }

  const total = orderTotal(order);
  const withinLimit = level.authLevel >= total;

  return {
    canReview: true,
    canAuthorise: true,
    reviewReason: `Approve review or reject with a reason.${level.canReview ? '' : ' Configured review flag is off; admin override is active for now.'}`,
    authoriseReason: withinLimit
      ? `Authorise or reject with a reason. Limit covers ${money(total, order.currency)}.`
      : `Authorise or reject with a reason. Configured limit ${money(level.authLevel, order.currency)} is below ${money(total, order.currency)}; admin override is active for now.`,
    level,
  };
}

function booleanParameter(value: string | undefined) {
  return ['1', 'yes', 'y', 'true', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

function toPurchaseLine(line: DraftLine): PoLine {
  return {
    id: line.id,
    itemCode: line.itemCode,
    supplierItem: line.supplierItem,
    description: line.description,
    category: line.category,
    supplierUnits: line.supplierUnits,
    receivingUnits: line.receivingUnits,
    conversionFactor: line.conversionFactor,
    quantityOrdered: line.quantityOrdered,
    quantityReceived: line.quantityReceived,
    quantityInvoiced: line.quantityInvoiced,
    deliveryDate: line.deliveryDate,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    glCode: line.glCode,
    controlled: line.controlled,
    completed: line.completed,
  };
}

export function PurchaseOrders() {
  const authUser = useMemo(
    () => ({ id: 'admin', name: 'ADMIN', email: 'admin@akiva.local' }),
    []
  );
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>(() => initialTabForRoute(currentPurchaseRoute()));
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('outstanding');
  const [locationFilter, setLocationFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showLineDetails, setShowLineDetails] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(() => currentPurchaseRoute().includes('po-selectospurchorder'));
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>(getDefaultDateRange());
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [purchaseOrdersReady, setPurchaseOrdersReady] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [lookupSuppliers, setLookupSuppliers] = useState<SupplierLookup[]>(suppliers);
  const [lookupLocations, setLookupLocations] = useState<LookupOption[]>(locations);
  const [lookupCategories, setLookupCategories] = useState<LookupOption[]>(categoryOptions.filter((option) => option.value !== 'All'));
  const [offers, setOffers] = useState<SupplierOffer[]>(initialOffers);
  const [offerSupplier, setOfferSupplier] = useState(initialOffers[0]?.supplierCode ?? '');
  const [offerDecisions, setOfferDecisions] = useState<Record<string, OfferDecision>>({});
  const [offerMessage, setOfferMessage] = useState('');
  const [poAuthLevels, setPoAuthLevels] = useState<PoAuthorisationLevel[]>([]);
  const [selectedAuthId, setSelectedAuthId] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [notificationSettings, setNotificationSettings] = useState<PoNotificationSettings>({ emailEnabled: false, smsEnabled: false, loaded: false });
  const [notificationOptions, setNotificationOptions] = useState<PoNotificationOptions>({ email: false, sms: false });
  const [authMessage, setAuthMessage] = useState('');
  const [rejectDraft, setRejectDraft] = useState<{ order: PurchaseOrder; comment: string } | null>(null);
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplierReference, setSupplierReference] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [receiptQty, setReceiptQty] = useState<Record<string, number>>({});
  const [completedLines, setCompletedLines] = useState<Record<string, boolean>>({});
  const [draftSupplier, setDraftSupplier] = useState('AFRI D10');
  const [draftLocation, setDraftLocation] = useState('ADMINISTRATION');
  const [draftDeliveryDate, setDraftDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [draftRequisition, setDraftRequisition] = useState('REQ-0521');
  const [draftComments, setDraftComments] = useState('Purchase order created in Akiva.');
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
  const routePath = currentPurchaseRoute();
  const pageTitle = titleForRoute(routePath);
  const pageDescription = descriptionForRoute(routePath);
  const isCreatePoRoute = routePath.includes('po-header');
  const isOffersRoute = routePath.includes('offersreceived');
  const isAuthoriseRoute = routePath.includes('po-authorisemyorders');

  const offerSupplierOptions = useMemo(() => {
    const bySupplier = new Map<string, LookupOption>();
    offers.forEach((offer) => {
      bySupplier.set(offer.supplierCode, { value: offer.supplierCode, label: offer.supplierName });
    });
    return [...bySupplier.values()];
  }, [offers]);

  useEffect(() => {
    let cancelled = false;

    async function loadPurchaseOrders() {
      setLoadingOrders(true);
      setLoadError('');

      try {
        const response = await apiFetch(buildApiUrl('/api/purchases/orders?limit=500'));
        if (!response.ok) {
          throw new Error('Purchase orders are temporarily unavailable.');
        }

        const payload = (await response.json()) as PurchaseOrdersApiResponse;
        const rows = Array.isArray(payload.data) ? payload.data : [];

        if (cancelled) return;

        setOrders(rows);
        setPurchaseOrdersReady(true);
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
          setDraftSupplier((current) => (payload.lookups?.suppliers?.some((supplier) => supplier.value === current) ? current : payload.lookups?.suppliers?.[0]?.value ?? current));
        }
        if (payload.lookups?.locations?.length) {
          setLookupLocations(payload.lookups.locations);
          setDraftLocation((current) => (payload.lookups?.locations?.some((location) => location.value === current) ? current : payload.lookups?.locations?.[0]?.value ?? current));
        }
        if (payload.lookups?.categories?.length) {
          setLookupCategories(payload.lookups.categories);
        }
      } catch (error) {
        if (cancelled) return;
        setOrders([]);
        setPurchaseOrdersReady(false);
        setLoadError(error instanceof Error ? error.message : 'Purchase orders are temporarily unavailable.');
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }

    loadPurchaseOrders();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuthorisationLevels() {
      setAuthLoading(true);
      setAuthError('');
      try {
        const setup = await fetchPurchasesPayablesSetup();
        if (cancelled) return;
        const levels = setup.poAuthorisationLevels;
        setPoAuthLevels(levels);
        setSelectedAuthId((current) => {
          if (current && levels.some((level) => level.id === current)) return current;
          return levels.find((level) => authProfileMatches(level, authUser))?.id ?? levels.find((level) => level.canReview)?.id ?? levels[0]?.id ?? '';
        });
      } catch (error) {
        if (cancelled) return;
        setPoAuthLevels([]);
        setAuthError(error instanceof Error ? error.message : 'PO authorisation setup could not be loaded.');
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }

    loadAuthorisationLevels();

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationSettings() {
      try {
        const payload = await fetchSystemParameters();
        if (cancelled) return;
        const emailEnabled = booleanParameter(payload.parameters.SendPOEmailNotification);
        const smsEnabled = booleanParameter(payload.parameters.SendPOSMSNotification);
        setNotificationSettings({ emailEnabled, smsEnabled, loaded: true });
        setNotificationOptions({ email: emailEnabled, sms: smsEnabled });
      } catch {
        if (cancelled) return;
        setNotificationSettings({ emailEnabled: false, smsEnabled: false, loaded: true });
        setNotificationOptions({ email: false, sms: false });
      }
    }

    loadNotificationSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (offerSupplierOptions.length === 0) {
      setOfferSupplier('');
      return;
    }
    if (!offerSupplierOptions.some((option) => option.value === offerSupplier)) {
      setOfferSupplier(offerSupplierOptions[0].value);
    }
  }, [offerSupplier, offerSupplierOptions]);

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

  const tabCounts = useMemo<Record<WorkbenchTab, number>>(() => {
    return {
      outstanding: orders.filter((order) => !['Completed', 'Cancelled', 'Rejected'].includes(order.status)).length,
      approvals: orders.filter((order) => ['Pending Review', 'Reviewed'].includes(order.status)).length,
      receiving: orders.filter(canReceive).length,
      billMatch: orders.filter((order) => order.status === 'Received').length,
      all: orders.length,
    };
  }, [orders]);

  const nextActionOrders = useMemo(
    () =>
      orders
        .filter((order) => ['Pending Review', 'Reviewed', 'Printed', 'Part Received', 'Received'].includes(order.status))
        .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)),
    [orders]
  );

  const primaryQueueOrder = nextActionOrders[0] ?? null;
  const selectedAuthLevel = useMemo(() => poAuthLevels.find((level) => level.id === selectedAuthId) ?? null, [poAuthLevels, selectedAuthId]);
  const approvalOrders = useMemo(
    () => orders.filter((order) => ['Pending Review', 'Reviewed'].includes(order.status)).sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [orders]
  );
  const authCurrencyCoverage = useMemo(() => {
    const currencies = new Set(poAuthLevels.map((level) => level.currencyCode));
    return [...currencies].sort();
  }, [poAuthLevels]);
  const authorisableApprovalOrders = useMemo(
    () => approvalOrders.filter((order) => order.status === 'Reviewed').length,
    [approvalOrders]
  );

  const receiptValidation = useMemo(() => {
    if (drawerMode !== 'receive') return { hasQuantity: false, hasOverQuantity: false, canPost: false };
    const quantities = selectedOrder.lines.map((line) => {
      const qty = Math.max(0, Number(receiptQty[line.id] ?? 0));
      return { qty, balance: receiptBalance(line) };
    });
    const hasQuantity = quantities.some((line) => line.qty > 0);
    const hasOverQuantity = quantities.some((line) => line.qty > line.balance);
    return { hasQuantity, hasOverQuantity, canPost: hasQuantity && !hasOverQuantity };
  }, [drawerMode, receiptQty, selectedOrder]);

  const selectedSupplierOffers = useMemo(() => offers.filter((offer) => offer.supplierCode === offerSupplier), [offerSupplier, offers]);

  const offerSummary = useMemo(() => {
    const expiringSoon = selectedSupplierOffers.filter((offer) => daysUntil(offer.expiryDate) <= 7).length;
    return {
      lineCount: selectedSupplierOffers.length,
      totalValue: selectedSupplierOffers.reduce((sum, offer) => sum + offerTotal(offer), 0),
      acceptedCount: selectedSupplierOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'accept').length,
      rejectedCount: selectedSupplierOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'reject').length,
      expiringSoon,
      currency: selectedSupplierOffers[0]?.currency ?? 'TZS',
    };
  }, [offerDecisions, selectedSupplierOffers]);

  const columns: AdvancedTableColumn<PurchaseOrder>[] = [
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
      ...(showLineDetails
        ? [
            {
              id: 'items',
              header: 'Items',
              accessor: (order) => order.lines.map((line) => `${line.itemCode} ${line.description}`).join(' '),
              cell: (order) => (
                <div className="min-w-0 space-y-1">
                  {order.lines.slice(0, 2).map((line) => (
                    <p key={line.id} className="truncate text-xs text-akiva-text-muted">
                      <span className="font-mono font-semibold text-akiva-text">{line.itemCode}</span>
                      <span className="mx-1 text-akiva-text-muted">·</span>
                      {line.description}
                    </p>
                  ))}
                  {order.lines.length > 2 ? (
                    <p className="text-xs font-semibold text-akiva-accent">+{order.lines.length - 2} more item{order.lines.length - 2 === 1 ? '' : 's'}</p>
                  ) : null}
                </div>
              ),
              exportValue: (order) => order.lines.map((line) => `${line.itemCode} - ${line.description}`).join('; '),
              width: 260,
            } satisfies AdvancedTableColumn<PurchaseOrder>,
          ]
        : []),
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
            <Button
              size="sm"
              variant={canReceive(order) ? 'success' : 'secondary'}
              onClick={() => primaryAction(order)}
              className="min-h-8 whitespace-nowrap rounded-md px-2.5 py-1 text-xs"
            >
              {actionForStatus(order.status)}
            </Button>
          </div>
        ),
        align: 'right',
        width: 140,
      },
    ];

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

  function actionActor() {
    return selectedAuthLevel?.userName || selectedAuthLevel?.userId || 'ADMIN';
  }

  function notificationEvents(order: PurchaseOrder, action: 'review-approved' | 'authorised' | 'rejected'): StatusEvent[] {
    const recipient =
      action === 'review-approved'
        ? 'final purchase order authorisers'
        : action === 'authorised'
          ? `${order.initiatedBy}, stores, and supplier follow-up`
          : `${order.initiatedBy} and procurement`;
    const events: StatusEvent[] = [];
    if (notificationOptions.email && notificationSettings.emailEnabled) {
      events.push({ label: `Email notification queued to ${recipient}`, by: 'System', at: 'Today' });
    }
    if (notificationOptions.sms && notificationSettings.smsEnabled) {
      events.push({ label: `SMS notification queued to ${recipient}`, by: 'System', at: 'Today' });
    }
    return events;
  }

  function transitionOrder(orderId: string, status: PoStatus, eventLabel: string, extraEvents: StatusEvent[] = []) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status,
              allowPrint: status === 'Authorised' || status === 'Printed' || order.allowPrint,
              events: [{ label: eventLabel, by: actionActor(), at: 'Today' }, ...extraEvents, ...order.events],
            }
          : order
      )
    );
  }

  function approveReview(order: PurchaseOrder) {
    transitionOrder(order.id, 'Reviewed', `Review approved by ${actionActor()}`, notificationEvents(order, 'review-approved'));
    setAuthMessage(`PO ${order.orderNumber} review approved. ${notificationSummary()}`);
  }

  function authoriseOrder(order: PurchaseOrder) {
    transitionOrder(order.id, 'Authorised', `Authorised by ${actionActor()}`, notificationEvents(order, 'authorised'));
    setAuthMessage(`PO ${order.orderNumber} authorised. ${notificationSummary()}`);
  }

  function requestRejectOrder(order: PurchaseOrder) {
    setRejectDraft({ order, comment: '' });
  }

  function rejectOrder() {
    if (!rejectDraft) return;
    const comment = rejectDraft.comment.trim();
    if (!comment) {
      setAuthMessage('Enter a rejection comment before rejecting the purchase order.');
      return;
    }
    transitionOrder(rejectDraft.order.id, 'Rejected', `Rejected by ${actionActor()}: ${comment}`, notificationEvents(rejectDraft.order, 'rejected'));
    setAuthMessage(`PO ${rejectDraft.order.orderNumber} rejected with comment. ${notificationSummary()}`);
    setRejectDraft(null);
    if (drawerMode === 'review') setDrawerMode(null);
  }

  function notificationSummary() {
    const sent = [
      notificationOptions.email && notificationSettings.emailEnabled ? 'email queued' : '',
      notificationOptions.sms && notificationSettings.smsEnabled ? 'SMS queued' : '',
    ].filter(Boolean);
    return sent.length > 0 ? sent.join(' and ') : 'No notifications queued by current settings.';
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
      lines: draftLines.map(toPurchaseLine),
      events: [{ label: status === 'Draft' ? 'Draft created' : 'Submitted for review', by: 'John Doe', at: 'Today' }],
    };
    setOrders((current) => [order, ...current]);
    setSelectedId(order.id);
    setDrawerMode('view');
  }

  function processSupplierOffers() {
    const accepted = selectedSupplierOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'accept');
    const rejected = selectedSupplierOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'reject');
    const deferred = selectedSupplierOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'defer');

    if (accepted.length === 0 && rejected.length === 0) {
      setOfferMessage('Choose at least one offer to accept or reject. Deferred lines remain outstanding.');
      return;
    }

    if (accepted.length > 0) {
      const supplier = lookupSuppliers.find((item) => item.value === offerSupplier);
      const order: PurchaseOrder = {
        id: `po-offer-${Date.now()}`,
        orderNumber: String(621 + orders.length),
        realOrderNumber: `PO-2026-${String(621 + orders.length).padStart(5, '0')}`,
        supplierCode: offerSupplier,
        supplierName: supplier?.label ?? accepted[0].supplierName,
        supplierAddress: supplier?.address ?? '',
        currency: accepted[0].currency,
        exchangeRate: 1,
        orderDate: new Date().toISOString().slice(0, 10),
        deliveryDate: new Date().toISOString().slice(0, 10),
        initiatedBy: 'John Doe',
        reviewer: 'Procurement Lead',
        location: draftLocation,
        requisitionNo: accepted[0].tenderId,
        paymentTerms: '30 days',
        deliveryBy: 'Supplier',
        comments: 'Automatically generated from accepted supplier offers.',
        status: 'Pending Review',
        allowPrint: false,
        lines: accepted.map((offer) => ({
          id: offer.id,
          itemCode: offer.itemCode,
          supplierItem: offer.itemCode,
          description: offer.description,
          category: offer.category,
          supplierUnits: offer.units,
          receivingUnits: offer.units,
          conversionFactor: 1,
          quantityOrdered: offer.quantity,
          quantityReceived: 0,
          quantityInvoiced: 0,
          deliveryDate: new Date().toISOString().slice(0, 10),
          unitPrice: offer.price,
          taxRate: 0,
          glCode: '5500',
          completed: false,
        })),
        events: [{ label: 'Created from accepted supplier offers', by: 'John Doe', at: 'Today' }],
      };
      setOrders((current) => [order, ...current]);
      setSelectedId(order.id);
    }

    const processedIds = new Set([...accepted, ...rejected].map((offer) => offer.id));
    setOffers((current) => current.filter((offer) => !processedIds.has(offer.id)));
    setOfferDecisions((current) => {
      const next = { ...current };
      processedIds.forEach((id) => delete next[id]);
      return next;
    });
    setOfferMessage(
      `${accepted.length} accepted, ${rejected.length} rejected, ${deferred.length} deferred. ${
        accepted.length > 0 ? 'A pending-review purchase order was created.' : 'Rejected offers were removed.'
      }`
    );
  }

  function postReceipt() {
    if (!receiptValidation.canPost) return;
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

  const closePoDialog = () => setDrawerMode(null);
  const poDialogSize = drawerMode === 'create' ? 'lg' : '2xl';
  const selectedOrderAuthDecision = authorisationForOrder(selectedOrder, selectedAuthLevel);
  const poDialogFooter = (
    <>
      <Button variant="secondary" onClick={closePoDialog}>Cancel</Button>
      {drawerMode === 'create' ? (
        <>
          <Button variant="secondary" onClick={() => saveDraftOrder('Draft')}>Save draft</Button>
          <Button onClick={() => saveDraftOrder('Pending Review')}>
            <Send className="mr-2 h-4 w-4" />
            Submit for review
          </Button>
        </>
      ) : null}
      {drawerMode === 'receive' ? (
        <Button variant="success" onClick={postReceipt} disabled={!receiptValidation.canPost}>
          <PackageCheck className="mr-2 h-4 w-4" />
          Process goods received
        </Button>
      ) : null}
      {drawerMode === 'review' ? (
        <>
          <Button
            variant="danger"
            onClick={() => requestRejectOrder(selectedOrder)}
          >
            Reject
          </Button>
          {selectedOrder.status === 'Pending Review' ? (
            <Button onClick={() => approveReview(selectedOrder)}>
              <>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Approve review
              </>
            </Button>
          ) : (
            <Button onClick={() => authoriseOrder(selectedOrder)}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Authorise
            </Button>
          )}
        </>
      ) : null}
      {drawerMode === 'view' ? (
        <>
          <Button variant="secondary" disabled={!canPrint(selectedOrder)}>
            <Printer className="mr-2 h-4 w-4" />
            Print / PDF
          </Button>
          <Button onClick={() => primaryAction(selectedOrder)}>{actionForStatus(selectedOrder.status)}</Button>
        </>
      ) : null}
    </>
  );

  const createPurchaseOrderPanel = (
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
    />
  );

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <header className="border-b border-akiva-border px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap gap-2">
                  <Chip icon={PackageCheck}>Purchasing</Chip>
                  <Chip icon={isCreatePoRoute ? Plus : isOffersRoute ? ClipboardCheck : isAuthoriseRoute ? ShieldCheck : FileText}>
                    {isCreatePoRoute ? 'New PO' : isOffersRoute ? 'Supplier offers' : isAuthoriseRoute ? 'Authorise POs' : 'Purchase orders'}
                  </Chip>
                  <Chip icon={ShieldCheck}>Receiving and bill matching</Chip>
                  <Chip icon={purchaseOrdersReady ? CheckCircle2 : AlertTriangle}>
                    {loadingOrders ? 'Updating purchase orders' : purchaseOrdersReady ? `${orders.length} purchase orders` : 'Purchase orders unavailable'}
                  </Chip>
                </div>
                <h1 className="mt-3 text-lg font-bold text-akiva-text sm:text-2xl">
                  {pageTitle}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                  {pageDescription}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <IconButton icon={RefreshCw} label="Refresh purchase orders" onClick={() => setReloadKey((value) => value + 1)} />
                {isOffersRoute ? (
                  <Button onClick={processSupplierOffers} disabled={selectedSupplierOffers.length === 0}>
                    <Check className="mr-2 h-4 w-4" />
                    Process offers
                  </Button>
                ) : isCreatePoRoute ? (
                  <>
                    <Button variant="secondary" onClick={() => saveDraftOrder('Draft')}>Save draft</Button>
                    <Button onClick={() => saveDraftOrder('Pending Review')}>
                      <Send className="mr-2 h-4 w-4" />
                      Submit for review
                    </Button>
                  </>
                ) : isAuthoriseRoute ? (
                  <Button variant="secondary" onClick={() => navigateTo('/configuration/purchases-payables/setup/po-authorisation-levels')}>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Setup levels
                  </Button>
                ) : (
                  <>
                    <IconButton
                      icon={PanelRightOpen}
                      label={sidePanelOpen ? 'Hide purchase order panel' : 'Show purchase order panel'}
                      onClick={() => setSidePanelOpen((open) => !open)}
                      active={sidePanelOpen}
                    />
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
                  </>
                )}
              </div>
            </div>
          </header>

          {!isCreatePoRoute && !isOffersRoute && !isAuthoriseRoute && filtersOpen ? (
            <div className="border-b border-akiva-border bg-akiva-surface/70 px-4 py-3 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2 md:grid-cols-4 2xl:grid-cols-[180px_180px_minmax(220px,1fr)_190px_minmax(210px,0.8fr)]">
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
                <label className="group flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-sm shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-akiva-text">Item lines</span>
                    <span className="block truncate text-xs text-akiva-text-muted">Codes and descriptions</span>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="Show item line details in the purchase order table"
                    checked={showLineDetails}
                    onChange={(event) => setShowLineDetails(event.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-akiva-border bg-akiva-surface-raised text-transparent shadow-sm transition peer-checked:border-akiva-accent peer-checked:bg-akiva-accent peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-akiva-accent">
                    <Check className="h-4 w-4 stroke-[3]" />
                  </span>
                </label>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
            <main className="space-y-4 lg:col-span-12">
              {isOffersRoute ? (
                <OffersReceivedPanel
                  offers={offers}
                  selectedSupplier={offerSupplier}
                  supplierOptions={offerSupplierOptions}
                  selectedOffers={selectedSupplierOffers}
                  decisions={offerDecisions}
                  summary={offerSummary}
                  message={offerMessage}
                  onSupplierChange={setOfferSupplier}
                  onDecisionChange={(offerId, decision) => {
                    setOfferMessage('');
                    setOfferDecisions((current) => ({ ...current, [offerId]: decision }));
                  }}
                  onProcess={processSupplierOffers}
                />
              ) : isCreatePoRoute ? (
                <>
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">{createPurchaseOrderPanel}</div>
                    <aside className="space-y-4">
                      <PanelSection title="PO safeguards">
                        <div className="space-y-2.5">
                          <ChecklistRow checked title="Supplier selected" description="Supplier currency and address are carried onto the purchase order." />
                          <ChecklistRow checked title="Delivery location set" description="Receipts will post stock or expenses into the selected location." />
                          <ChecklistRow checked={draftLines.length > 0} title="Item lines ready" description="Each line should carry quantity, unit price, tax, and GL coding." />
                          <ChecklistRow checked={false} title="Review required" description="Submitted purchase orders still need review and authorisation before printing." />
                        </div>
                      </PanelSection>
                      <PanelSection title="Draft totals">
                        <Totals
                          order={{
                            id: 'draft-summary',
                            orderNumber: 'Draft',
                            realOrderNumber: 'Draft',
                            supplierCode: draftSupplier,
                            supplierName: lookupSuppliers.find((supplier) => supplier.value === draftSupplier)?.label ?? draftSupplier,
                            supplierAddress: '',
                            currency: lookupSuppliers.find((supplier) => supplier.value === draftSupplier)?.currency ?? 'TZS',
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
                            status: 'Draft',
                            allowPrint: false,
                            lines: draftLines.map(toPurchaseLine),
                            events: [],
                          }}
                        />
                      </PanelSection>
                    </aside>
                  </div>
                </>
              ) : isAuthoriseRoute ? (
                <AuthorisePurchaseOrdersPanel
                  orders={approvalOrders}
                  authLevels={poAuthLevels}
                  selectedAuthId={selectedAuthId}
                  selectedAuthLevel={selectedAuthLevel}
                  loading={authLoading}
                  error={authError}
                  message={authMessage}
                  currencies={authCurrencyCoverage}
                  authorisableCount={authorisableApprovalOrders}
                  notificationSettings={notificationSettings}
                  notificationOptions={notificationOptions}
                  onAuthChange={setSelectedAuthId}
                  onOpen={(order) => openDrawer(order, 'review')}
                  onReview={approveReview}
                  onAuthorise={authoriseOrder}
                  onReject={requestRejectOrder}
                  onNotificationChange={(patch) => setNotificationOptions((current) => ({ ...current, ...patch }))}
                  onSetupLevels={() => navigateTo('/configuration/purchases-payables/setup/po-authorisation-levels')}
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard label="Open commitments" value={money(metrics.openCommitment, 'TZS')} detail="Unclosed POs still reserving budget." icon={FileText} />
                    <MetricCard label="Waiting approval" value={String(metrics.waitingApproval)} detail="Review or authorise before print." icon={ShieldCheck} />
                    <MetricCard label="Ready to receive" value={String(metrics.readyToReceive)} detail="Printed POs that can post GRNs." icon={Truck} />
                    <MetricCard label="GRN accrual" value={money(metrics.grnAccrual, 'TZS')} detail="Received goods awaiting supplier invoice." icon={FileCheck2} />
                  </div>

                  <section className="grid gap-3 rounded-2xl border border-akiva-border bg-gradient-to-r from-white via-sky-50/60 to-amber-50/60 p-3 shadow-sm dark:from-slate-950/90 dark:via-slate-900/70 dark:to-slate-900/80 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Selection queue</p>
                      <h2 className="mt-1 truncate text-base font-semibold text-akiva-text">
                        {primaryQueueOrder ? `${actionForStatus(primaryQueueOrder.status)} PO ${primaryQueueOrder.orderNumber} for ${primaryQueueOrder.supplierName}` : 'No urgent purchase orders waiting for action'}
                      </h2>
                      <p className="mt-1 text-sm leading-5 text-akiva-text-muted">
                        {primaryQueueOrder
                          ? `${formatDate(primaryQueueOrder.deliveryDate)} delivery into ${primaryQueueOrder.location} · ${money(orderTotal(primaryQueueOrder), primaryQueueOrder.currency)}`
                          : 'The current filters have no approval, receiving, or bill-match work queued.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setFiltersOpen(true)}>
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Refine
                      </Button>
                      {primaryQueueOrder ? (
                        <Button size="sm" onClick={() => primaryAction(primaryQueueOrder)}>
                          {actionForStatus(primaryQueueOrder.status)}
                        </Button>
                      ) : null}
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                    <div className="border-b border-akiva-border px-4 py-3">
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
                                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20 text-white' : 'bg-akiva-surface-muted text-akiva-text-muted'}`}>
                                  {tabCounts[tab.id]}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="relative w-full xl:max-w-md">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                          <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className={`${inputClass} pl-10`}
                            placeholder="Search PO, supplier, requisition, item"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <AdvancedTable
                        tableId={showLineDetails ? 'purchase-orders-with-items' : 'purchase-orders'}
                        columns={columns}
                        rows={filteredOrders}
                        rowKey={(order) => order.id}
                        loading={loadingOrders}
                        loadingMessage="Preparing purchase orders..."
                        emptyMessage={loadError ? `Purchase orders could not be loaded: ${loadError}` : 'No purchase orders match these filters.'}
                        initialPageSize={10}
                      />
                    </div>
                  </section>
                </>
              )}
            </main>

          </div>
        </section>
      </div>

      {sidePanelOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close purchase order panel"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]"
            onClick={() => setSidePanelOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 flex w-screen max-w-md flex-col border-l border-akiva-border bg-akiva-surface-raised text-akiva-text shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-akiva-border px-4 py-3">
              <div>
                <h2 className="text-base font-semibold">Purchase order panel</h2>
                    <p className="mt-0.5 text-xs text-akiva-text-muted">Approvals, receiving, and selected order details.</p>
              </div>
              <button
                type="button"
                aria-label="Close purchase order panel"
                onClick={() => setSidePanelOpen(false)}
                className="rounded-lg p-2 text-akiva-text-muted transition hover:bg-akiva-accent-soft hover:text-akiva-accent-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-akiva-text">Next best actions</h3>
                    <p className="mt-1 text-sm leading-5 text-akiva-text-muted">Work that needs review, receiving, or supplier bill matching.</p>
                  </div>
                  <Clock3 className="h-5 w-5 text-akiva-accent" />
                </div>
                <div className="mt-4 space-y-2.5">
                  {nextActionOrders.slice(0, 5).map((order) => (
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
                    <h3 className="text-sm font-semibold text-akiva-text">Purchase safeguards</h3>
                    <p className="mt-1 text-sm leading-5 text-akiva-text-muted">Checks that keep purchase orders, receipts, and supplier bills aligned.</p>
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
                <h3 className="text-sm font-semibold text-akiva-text">Selected PO</h3>
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
            </div>
          </aside>
        </div>
      ) : null}

      <Modal
        isOpen={drawerMode !== null}
        onClose={closePoDialog}
        title={drawerTitle(drawerMode, selectedOrder)}
        size={poDialogSize}
        footer={poDialogFooter}
      >
        {drawerMode === 'create' ? createPurchaseOrderPanel : null}

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
          />
        ) : null}

        {drawerMode === 'review' ? (
          <ReviewPurchaseOrderPanel
            order={selectedOrder}
            decision={selectedOrderAuthDecision}
            selectedAuthLevel={selectedAuthLevel}
          />
        ) : null}

        {drawerMode === 'view' ? <PurchaseOrderDetailPanel order={selectedOrder} /> : null}
      </Modal>

      <Modal
        isOpen={rejectDraft !== null}
        onClose={() => setRejectDraft(null)}
        title={rejectDraft ? `Reject PO ${rejectDraft.order.orderNumber}` : 'Reject purchase order'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectDraft(null)}>Cancel</Button>
            <Button variant="danger" onClick={rejectOrder} disabled={!rejectDraft?.comment.trim()}>
              Reject PO
            </Button>
          </>
        }
      >
        {rejectDraft ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-sm">
              <p className="font-semibold text-akiva-text">{rejectDraft.order.supplierName}</p>
              <p className="mt-1 text-akiva-text-muted">
                {money(orderTotal(rejectDraft.order), rejectDraft.order.currency)} · {rejectDraft.order.status}
              </p>
            </div>
            <Field label="Rejection comment">
              <textarea
                value={rejectDraft.comment}
                onChange={(event) => setRejectDraft((current) => (current ? { ...current, comment: event.target.value } : current))}
                rows={4}
                className={`${inputClass} h-auto min-h-28 py-3`}
                placeholder="Enter why this purchase order is being rejected"
                autoFocus
              />
            </Field>
            <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-sm text-akiva-text-muted">
              The comment will be saved in the PO audit trail. Enabled email/SMS notifications will be queued from the current System Parameters settings.
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function OffersReceivedPanel({
  offers,
  selectedSupplier,
  supplierOptions,
  selectedOffers,
  decisions,
  summary,
  message,
  onSupplierChange,
  onDecisionChange,
  onProcess,
}: {
  offers: SupplierOffer[];
  selectedSupplier: string;
  supplierOptions: LookupOption[];
  selectedOffers: SupplierOffer[];
  decisions: Record<string, OfferDecision>;
  summary: {
    lineCount: number;
    totalValue: number;
    acceptedCount: number;
    rejectedCount: number;
    expiringSoon: number;
    currency: PurchaseOrder['currency'];
  };
  message: string;
  onSupplierChange: (value: string) => void;
  onDecisionChange: (offerId: string, decision: OfferDecision) => void;
  onProcess: () => void;
}) {
  if (offers.length === 0) {
    return (
      <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold text-akiva-text">No outstanding supplier offers</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-akiva-text-muted">
          Accepted and rejected offers have been cleared. Deferred offers will appear here when suppliers still have active tender lines.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100">
          {message}
        </div>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-akiva-border bg-gradient-to-r from-white via-violet-50/60 to-cyan-50/70 p-3 shadow-sm dark:from-slate-950/90 dark:via-slate-900/70 dark:to-slate-900/80 lg:grid-cols-[minmax(240px,360px)_1fr_auto] lg:items-center">
        <Field label="Supplier with outstanding offers">
          <SearchableSelect
            value={selectedSupplier}
            onChange={onSupplierChange}
            options={supplierOptions}
            inputClassName={inputClass}
            placeholder="Select supplier"
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-4">
          <InfoTile label="Offer lines" value={String(summary.lineCount)} />
          <InfoTile label="Offer value" value={money(summary.totalValue, summary.currency)} />
          <InfoTile label="Accepted" value={String(summary.acceptedCount)} />
          <InfoTile label="Expiring soon" value={String(summary.expiringSoon)} />
        </div>
        <Button onClick={onProcess} disabled={selectedOffers.length === 0}>
          <Check className="mr-2 h-4 w-4" />
          Process
        </Button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
        <div className="border-b border-akiva-border px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-akiva-text">Offer lines from selected supplier</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">Accept converts lines into a pending-review PO, reject clears them, defer leaves them outstanding.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">Accept</span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900">Reject</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">Defer</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed">
            <thead className="bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-text-muted">
              <tr>
                <th className="w-28 px-4 py-3 text-left">Offer ID</th>
                <th className="w-28 px-4 py-3 text-left">Tender</th>
                <th className="w-64 px-4 py-3 text-left">Item</th>
                <th className="w-28 px-4 py-3 text-right">Quantity</th>
                <th className="w-32 px-4 py-3 text-right">Price</th>
                <th className="w-32 px-4 py-3 text-right">Total</th>
                <th className="w-32 px-4 py-3 text-left">Expires</th>
                <th className="w-72 px-4 py-3 text-left">Decision</th>
              </tr>
            </thead>
            <tbody>
              {selectedOffers.map((offer) => {
                const decision = decisions[offer.id] ?? 'defer';
                const days = daysUntil(offer.expiryDate);
                return (
                  <tr key={offer.id} className="border-t border-akiva-border">
                    <td className="px-4 py-3 font-mono text-sm font-semibold text-akiva-text">{offer.id}</td>
                    <td className="px-4 py-3 font-mono text-sm text-akiva-text-muted">{offer.tenderId}</td>
                    <td className="px-4 py-3">
                      <p className="truncate text-sm font-semibold text-akiva-text">{offer.description}</p>
                      <p className="mt-1 truncate text-xs text-akiva-text-muted">{offer.itemCode} · {offer.category}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">{offer.quantity} {offer.units}</td>
                    <td className="px-4 py-3 text-right text-sm">{money(offer.price, offer.currency)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold">{money(offerTotal(offer), offer.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                        days <= 3
                          ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900'
                          : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900'
                      }`}>
                        {formatDate(offer.expiryDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['accept', 'reject', 'defer'] as OfferDecision[]).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => onDecisionChange(offer.id, option)}
                            className={`h-9 rounded-md border px-2 text-xs font-semibold capitalize transition ${
                              decision === option
                                ? option === 'accept'
                                  ? 'border-emerald-500 bg-emerald-600 text-white'
                                  : option === 'reject'
                                    ? 'border-rose-500 bg-rose-600 text-white'
                                    : 'border-slate-500 bg-slate-700 text-white'
                                : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function AuthorisePurchaseOrdersPanel({
  orders,
  authLevels,
  selectedAuthId,
  selectedAuthLevel,
  loading,
  error,
  message,
  currencies,
  authorisableCount,
  notificationSettings,
  notificationOptions,
  onAuthChange,
  onOpen,
  onReview,
  onAuthorise,
  onReject,
  onNotificationChange,
  onSetupLevels,
}: {
  orders: PurchaseOrder[];
  authLevels: PoAuthorisationLevel[];
  selectedAuthId: string;
  selectedAuthLevel: PoAuthorisationLevel | null;
  loading: boolean;
  error: string;
  message: string;
  currencies: string[];
  authorisableCount: number;
  notificationSettings: PoNotificationSettings;
  notificationOptions: PoNotificationOptions;
  onAuthChange: (value: string) => void;
  onOpen: (order: PurchaseOrder) => void;
  onReview: (order: PurchaseOrder) => void;
  onAuthorise: (order: PurchaseOrder) => void;
  onReject: (order: PurchaseOrder) => void;
  onNotificationChange: (patch: Partial<PoNotificationOptions>) => void;
  onSetupLevels: () => void;
}) {
  const profileOptions = authLevels.map((level) => ({ value: level.id, label: authProfileLabel(level) }));
  const reviewCount = orders.filter((order) => order.status === 'Pending Review').length;
  const finalCount = orders.filter((order) => order.status === 'Reviewed').length;

  if (!loading && authLevels.length === 0) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-amber-950 dark:text-amber-100">Purchase order authorisation levels are not configured</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900 dark:text-amber-100">
              Add at least one user and currency authorisation level before reviewing or authorising purchase orders.
            </p>
            {error ? <p className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-200">{error}</p> : null}
          </div>
          <Button onClick={onSetupLevels}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Configure levels
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-akiva-border bg-gradient-to-r from-white via-emerald-50/60 to-violet-50/70 p-3 shadow-sm dark:from-slate-950/90 dark:via-slate-900/70 dark:to-slate-900/80 xl:grid-cols-[minmax(280px,520px)_1fr_auto] xl:items-end">
        <Field label="Authorising profile">
          <SearchableSelect
            value={selectedAuthId}
            onChange={onAuthChange}
            options={profileOptions}
            inputClassName={inputClass}
            placeholder={loading ? 'Loading authorisation levels...' : 'Select configured level'}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-4">
          <InfoTile label="Review queue" value={String(reviewCount)} />
          <InfoTile label="Final approval" value={String(finalCount)} />
          <InfoTile label="Ready to authorise" value={String(authorisableCount)} />
          <InfoTile label="Currencies" value={currencies.length > 0 ? currencies.join(', ') : 'None'} />
        </div>
        <Button variant="secondary" onClick={onSetupLevels}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Levels
        </Button>
      </section>

      {selectedAuthLevel ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Action user" value={selectedAuthLevel.userName || selectedAuthLevel.userId} detail="Admin is assumed for now; user validation will be added later." icon={ClipboardCheck} />
          <MetricCard label="Review action" value="Approve / reject" detail="Pending-review orders can be approved to final authorisation or rejected with a comment." icon={FileText} />
          <MetricCard label="Authorise action" value={money(selectedAuthLevel.authLevel, selectedAuthLevel.currencyCode as PurchaseOrder['currency'])} detail="Reviewed orders can be authorised or rejected with a comment." icon={ShieldCheck} />
          <MetricCard
            label="Currency"
            value={selectedAuthLevel.currencyCode}
            detail={selectedAuthLevel.currencyName || 'Purchase order currency context.'}
            icon={CheckCircle2}
          />
        </section>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-3 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-akiva-text">Action notifications</h2>
          <p className="mt-1 text-sm leading-6 text-akiva-text-muted">
            Email and SMS queueing follows the purchase order notification settings in System Parameters.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToggleChip
            icon={Mail}
            label="Email"
            checked={notificationOptions.email && notificationSettings.emailEnabled}
            disabled={!notificationSettings.emailEnabled}
            note={notificationSettings.emailEnabled ? 'Enabled' : notificationSettings.loaded ? 'Off in settings' : 'Loading'}
            onChange={(checked) => onNotificationChange({ email: checked })}
          />
          <ToggleChip
            icon={MessageSquare}
            label="SMS"
            checked={notificationOptions.sms && notificationSettings.smsEnabled}
            disabled={!notificationSettings.smsEnabled}
            note={notificationSettings.smsEnabled ? 'Enabled' : notificationSettings.loaded ? 'Off in settings' : 'Loading'}
            onChange={(checked) => onNotificationChange({ sms: checked })}
          />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
        <div className="border-b border-akiva-border px-4 py-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-akiva-text">Orders waiting for approval</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                Pending-review orders can be approved or rejected. Reviewed orders can be authorised or rejected.
              </p>
            </div>
            {loading ? (
              <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900">
                Loading setup
              </span>
            ) : null}
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h3 className="mt-3 text-base font-semibold text-akiva-text">No purchase orders need authorisation</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-akiva-text-muted">
              Pending-review and reviewed orders will appear here as they move through the purchase order workflow.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed">
              <thead className="bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-text-muted">
                <tr>
                  <th className="w-32 px-4 py-3 text-left">Order</th>
                  <th className="w-72 px-4 py-3 text-left">Supplier</th>
                  <th className="w-36 px-4 py-3 text-left">Requested</th>
                  <th className="w-36 px-4 py-3 text-left">Status</th>
                  <th className="w-40 px-4 py-3 text-right">Total</th>
                  <th className="w-72 px-4 py-3 text-left">Action needed</th>
                  <th className="w-80 px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const decision = authorisationForOrder(order, selectedAuthLevel);
                  const isPendingReview = order.status === 'Pending Review';
                  return (
                    <tr key={order.id} className="border-t border-akiva-border align-top">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onOpen(order)}
                          className="text-left font-mono text-sm font-semibold text-akiva-accent hover:text-akiva-accent-text"
                        >
                          {order.orderNumber}
                          <span className="block font-sans text-xs font-medium text-akiva-text-muted">{order.realOrderNumber}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate text-sm font-semibold text-akiva-text">{order.supplierName}</p>
                        <p className="mt-1 truncate text-xs text-akiva-text-muted">{order.supplierCode} · {order.location}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="block">{formatDate(order.orderDate)}</span>
                        <span className="mt-1 block text-xs text-akiva-text-muted">{order.initiatedBy}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">{money(orderTotal(order), order.currency)}</td>
                      <td className="px-4 py-3">
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100">
                          <p className="font-semibold">{isPendingReview ? 'Approve review or reject' : 'Authorise or reject'}</p>
                          <p className="mt-1 opacity-80">{isPendingReview ? 'Approve sends this PO to final authorisation.' : decision.authoriseReason}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => onOpen(order)} className="min-h-8 rounded-md px-2.5 py-1 text-xs">
                            Open
                          </Button>
                          {isPendingReview ? (
                            <Button size="sm" onClick={() => onReview(order)} className="min-h-8 rounded-md px-2.5 py-1 text-xs">
                              <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                              Approve
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => onAuthorise(order)} className="min-h-8 rounded-md px-2.5 py-1 text-xs">
                              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                              Authorise
                            </Button>
                          )}
                          <Button variant="danger" size="sm" onClick={() => onReject(order)} className="min-h-8 rounded-md px-2.5 py-1 text-xs">
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3">
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
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[760px] space-y-2">
              {lines.map((line) => (
                <DraftLineEditor key={line.draftId} line={line} currency={selectedSupplier.currency ?? 'TZS'} onChange={(patch) => onLineChange(line.draftId, patch)} />
              ))}
            </div>
          </div>
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
    </div>
  );
}

function DraftLineEditor({ line, currency, onChange }: { line: DraftLine; currency: PurchaseOrder['currency']; onChange: (patch: Partial<DraftLine>) => void }) {
  return (
    <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm">
      <div className="grid grid-cols-[minmax(260px,1fr)_90px_130px_120px_120px] items-end gap-3">
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
        <div className="min-w-0 pb-2 text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Value</p>
          <p className="mt-1 truncate text-sm font-semibold text-akiva-text">{money(lineTotal(line), currency)}</p>
        </div>
      </div>
      <div className="mt-2 truncate text-xs text-akiva-text-muted">
        {line.description} · supplier unit {line.supplierUnits} · receiving unit {line.receivingUnits}
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
}) {
  const receiptValue = order.lines.reduce((sum, line) => sum + Math.max(0, Number(receiptQty[line.id] ?? 0)) * line.unitPrice, 0);
  const hasQuantity = order.lines.some((line) => Math.max(0, Number(receiptQty[line.id] ?? 0)) > 0);
  const hasOverQuantity = order.lines.some((line) => Math.max(0, Number(receiptQty[line.id] ?? 0)) > receiptBalance(line));
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
        {!hasQuantity || hasOverQuantity ? (
          <div
            className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
              hasOverQuantity
                ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100'
            }`}
          >
            {hasOverQuantity
              ? 'One or more received quantities are above the remaining purchase order balance.'
              : 'Enter at least one received quantity before posting the GRN.'}
          </div>
        ) : null}
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
                const balance = receiptBalance(line);
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
                      <label className="inline-flex cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={completedLines[line.id] ?? line.completed ?? false}
                          onChange={(event) => onCompleteChange(line.id, event.target.checked)}
                          className="peer sr-only"
                        />
                        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-akiva-border bg-akiva-surface-raised text-transparent shadow-sm transition peer-checked:border-akiva-accent peer-checked:bg-akiva-accent peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-akiva-accent">
                          <Check className="h-4 w-4 stroke-[3]" />
                        </span>
                      </label>
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
    </div>
  );
}

function ReviewPurchaseOrderPanel({
  order,
  decision,
  selectedAuthLevel,
}: {
  order: PurchaseOrder;
  decision: AuthorisationDecision;
  selectedAuthLevel: PoAuthorisationLevel | null;
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
      <PanelSection title="Configured authorisation">
        <div className="grid gap-3 sm:grid-cols-3">
          <InfoTile label="Profile" value={selectedAuthLevel ? selectedAuthLevel.userName || selectedAuthLevel.userId : 'Not configured'} />
          <InfoTile label="Currency" value={selectedAuthLevel ? selectedAuthLevel.currencyCode : order.currency} />
          <InfoTile
            label="Limit"
            value={selectedAuthLevel ? money(selectedAuthLevel.authLevel, selectedAuthLevel.currencyCode as PurchaseOrder['currency']) : 'No limit'}
          />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              decision.canReview
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100'
            }`}
          >
            <span className="font-semibold">Review action: </span>
            {decision.reviewReason}
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              decision.canAuthorise
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100'
            }`}
          >
            <span className="font-semibold">Final action: </span>
            {decision.authoriseReason}
          </div>
        </div>
      </PanelSection>
      <PurchaseOrderLines order={order} />
      <PanelSection title="Approval action">
        <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-sm text-akiva-text-muted">
          Approving review confirms supplier, budget, GL coding and quantities. Authorising permits print/send. Rejection requires a comment saved to the audit trail.
        </div>
      </PanelSection>
    </div>
  );
}

function PurchaseOrderDetailPanel({ order }: { order: PurchaseOrder }) {
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

function Chip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
      <Icon className="h-3.5 w-3.5 text-akiva-accent" />
      {children}
    </span>
  );
}

function ToggleChip({
  icon: Icon,
  label,
  note,
  checked,
  disabled,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  note: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition ${
        disabled
          ? 'cursor-not-allowed border-akiva-border bg-akiva-surface-muted text-akiva-text-muted opacity-70'
          : checked
            ? 'cursor-pointer border-akiva-accent bg-akiva-accent text-white'
            : 'cursor-pointer border-akiva-border bg-akiva-surface-raised text-akiva-text hover:bg-akiva-surface-muted'
      }`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs ${checked && !disabled ? 'bg-white/20 text-white' : 'bg-akiva-surface text-akiva-text-muted'}`}>
        {note}
      </span>
    </label>
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
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</span>
      {children}
    </label>
  );
}

function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="max-w-full overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-3 shadow-sm sm:p-4">
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
