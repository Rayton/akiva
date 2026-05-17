import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Bell,
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
import { useApp } from '../contexts/AppContext';
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
type TenderStatus = 'Draft' | 'Published' | 'Supplier Invited' | 'Offers Received' | 'Evaluation' | 'Award Recommended' | 'Approved' | 'PO Created' | 'Closed' | 'Cancelled';
type TenderInvitationStatus = 'Invited' | 'Viewed' | 'Responded' | 'Declined' | 'Expired';
type OfferComplianceStatus = 'Compliant' | 'Clarification' | 'Non-compliant';
type TenderRiskLevel = 'Low' | 'Moderate' | 'High';
type TenderProcessStep = 'dossier' | 'responses' | 'evaluation' | 'award' | 'conversion';

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
  userEnabled: boolean;
  loaded: boolean;
}

interface PoNotificationOptions {
  email: boolean;
  sms: boolean;
  user: boolean;
}

type ApprovalDecisionAction = 'review' | 'authorise';

interface ApprovalDecisionDraft {
  order: PurchaseOrder;
  action: ApprovalDecisionAction;
  comment: string;
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
  shipmentReference?: number;
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

interface PurchaseShipmentsApiResponse {
  success: boolean;
  data?: ShipmentRecord[];
  message?: string;
  meta?: {
    source?: string;
    dedicatedShipmentTable?: boolean;
    usesPurchaseOrders?: boolean;
    usesGoodsReceivedNotes?: boolean;
    usesShipmentCharges?: boolean;
    generatedAt?: string;
  };
}

interface SupplierOffer {
  id: string;
  tenderId: string;
  lineId: string;
  supplierCode: string;
  supplierName: string;
  currency: PurchaseOrder['currency'];
  itemCode: string;
  description: string;
  quantity: number;
  units: string;
  price: number;
  leadTimeDays: number;
  complianceStatus: OfferComplianceStatus;
  technicalScore: number;
  supplierRating: number;
  paymentTerms: string;
  notes: string;
  expiryDate: string;
  category: string;
}

interface TenderEvaluationWeights {
  price: number;
  delivery: number;
  compliance: number;
  performance: number;
}

interface TenderLine {
  id: string;
  itemCode: string;
  description: string;
  category: string;
  quantity: number;
  units: string;
  requiredDate: string;
  technicalRequirement: string;
  glCode: string;
}

interface TenderSupplierInvitation {
  supplierCode: string;
  supplierName: string;
  status: TenderInvitationStatus;
  invitedAt: string;
  respondedAt?: string;
}

interface Tender {
  id: string;
  reference: string;
  title: string;
  status: TenderStatus;
  method: 'Open Tender' | 'Restricted Tender' | 'RFQ';
  category: string;
  location: string;
  currency: PurchaseOrder['currency'];
  requiredDate: string;
  submissionDeadline: string;
  estimatedValue: number;
  createdBy: string;
  evaluationWeights: TenderEvaluationWeights;
  lines: TenderLine[];
  suppliers: TenderSupplierInvitation[];
  auditEvents: StatusEvent[];
}

interface OfferEvaluation {
  score: number;
  priceScore: number;
  deliveryScore: number;
  complianceScore: number;
  performanceScore: number;
  rank: number;
  recommendation: 'Recommended' | 'Viable' | 'Review' | 'Reject';
}

interface TenderDraftState {
  title: string;
  method: Tender['method'];
  category: string;
  location: string;
  requiredDate: string;
  submissionDeadline: string;
  estimatedValue: number;
  itemCode: string;
  quantity: number;
  units: string;
  technicalRequirement: string;
  glCode: string;
  supplierCodes: string[];
  priceWeight: number;
  deliveryWeight: number;
  complianceWeight: number;
  performanceWeight: number;
}

interface VendorResponseDraftState {
  supplierCode: string;
  lineId: string;
  price: number;
  leadTimeDays: number;
  complianceStatus: OfferComplianceStatus;
  technicalScore: number;
  supplierRating: number;
  paymentTerms: string;
  expiryDate: string;
  notes: string;
}

const tenderProcessSteps: Array<{ id: TenderProcessStep; label: string; detail: string }> = [
  { id: 'dossier', label: 'Dossier', detail: 'Scope and lines' },
  { id: 'responses', label: 'Responses', detail: 'Vendor submissions' },
  { id: 'evaluation', label: 'Evaluation', detail: 'Score and risk' },
  { id: 'award', label: 'Award', detail: 'Approve winners' },
  { id: 'conversion', label: 'PO conversion', detail: 'Create POs' },
];

const tenderMethodOptions: Array<{ value: Tender['method']; label: string }> = [
  { value: 'RFQ', label: 'RFQ' },
  { value: 'Restricted Tender', label: 'Restricted Tender' },
  { value: 'Open Tender', label: 'Open Tender' },
];

const complianceOptions: Array<{ value: OfferComplianceStatus; label: string }> = [
  { value: 'Compliant', label: 'Compliant' },
  { value: 'Clarification', label: 'Clarification required' },
  { value: 'Non-compliant', label: 'Non-compliant' },
];

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

function createTenderDraftState(supplierOptions: SupplierLookup[] = suppliers): TenderDraftState {
  const item = catalog[0];
  const today = new Date().toISOString().slice(0, 10);
  return {
    title: '',
    method: 'RFQ',
    category: item.category,
    location: 'CENTRAL STORE',
    requiredDate: today,
    submissionDeadline: today,
    estimatedValue: item.unitPrice,
    itemCode: item.itemCode,
    quantity: 1,
    units: item.supplierUnits,
    technicalRequirement: item.description,
    glCode: item.glCode,
    supplierCodes: supplierOptions.slice(0, 3).map((supplier) => supplier.value),
    priceWeight: 45,
    deliveryWeight: 20,
    complianceWeight: 25,
    performanceWeight: 10,
  };
}

function createVendorResponseDraft(tender?: Tender | null, supplierCode?: string): VendorResponseDraftState {
  const line = tender?.lines[0];
  const supplier = supplierCode ?? tender?.suppliers[0]?.supplierCode ?? '';
  const expiryDate = tender?.submissionDeadline ?? new Date().toISOString().slice(0, 10);

  return {
    supplierCode: supplier,
    lineId: line?.id ?? '',
    price: 0,
    leadTimeDays: 7,
    complianceStatus: 'Compliant',
    technicalScore: 85,
    supplierRating: 80,
    paymentTerms: '30 days',
    expiryDate,
    notes: '',
  };
}

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
    lineId: 'TEN-2407-L1',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    currency: 'TZS',
    itemCode: 'ACCESORY016',
    description: 'GREASE',
    quantity: 12,
    units: 'kgs',
    price: 8800,
    leadTimeDays: 4,
    complianceStatus: 'Compliant',
    technicalScore: 92,
    supplierRating: 88,
    paymentTerms: '30 days',
    notes: 'Preferred local supplier with immediate stock confirmation.',
    expiryDate: '2026-05-24',
    category: 'Equipment Spares',
  },
  {
    id: 'OFF-1013',
    tenderId: 'TEN-2407',
    lineId: 'TEN-2407-L2',
    supplierCode: 'AFRI D10',
    supplierName: 'AFRI DENTAL PRODUCTS',
    currency: 'TZS',
    itemCode: 'ACCESORY018',
    description: 'ELECTRODE CABLE',
    quantity: 8,
    units: 'each',
    price: 17500,
    leadTimeDays: 5,
    complianceStatus: 'Compliant',
    technicalScore: 89,
    supplierRating: 88,
    paymentTerms: '30 days',
    notes: 'Meets equipment compatibility requirements.',
    expiryDate: '2026-05-24',
    category: 'Medical Consumables',
  },
  {
    id: 'OFF-1014',
    tenderId: 'TEN-2407',
    lineId: 'TEN-2407-L1',
    supplierCode: 'SUPPLIER 3',
    supplierName: 'ANUDHA LTD',
    currency: 'TZS',
    itemCode: 'ACCESORY016',
    description: 'GREASE',
    quantity: 12,
    units: 'kgs',
    price: 9200,
    leadTimeDays: 3,
    complianceStatus: 'Compliant',
    technicalScore: 87,
    supplierRating: 79,
    paymentTerms: '21 days',
    notes: 'Strong delivery date, slightly higher unit price.',
    expiryDate: '2026-05-23',
    category: 'Equipment Spares',
  },
  {
    id: 'OFF-1015',
    tenderId: 'TEN-2407',
    lineId: 'TEN-2407-L2',
    supplierCode: 'SUPPLIER 3',
    supplierName: 'ANUDHA LTD',
    currency: 'TZS',
    itemCode: 'ACCESORY018',
    description: 'ELECTRODE CABLE',
    quantity: 8,
    units: 'each',
    price: 16800,
    leadTimeDays: 8,
    complianceStatus: 'Clarification',
    technicalScore: 73,
    supplierRating: 79,
    paymentTerms: '21 days',
    notes: 'Lowest cable price, but compatibility confirmation is still pending.',
    expiryDate: '2026-05-23',
    category: 'Medical Consumables',
  },
  {
    id: 'OFF-1016',
    tenderId: 'TEN-2407',
    lineId: 'TEN-2407-L1',
    supplierCode: 'SUPPLIER 4',
    supplierName: 'ACTION MEDEOR',
    currency: 'TZS',
    itemCode: 'ACCESORY016',
    description: 'GREASE',
    quantity: 12,
    units: 'kgs',
    price: 8400,
    leadTimeDays: 9,
    complianceStatus: 'Clarification',
    technicalScore: 82,
    supplierRating: 76,
    paymentTerms: '45 days',
    notes: 'Best price and payment terms, delayed delivery window.',
    expiryDate: '2026-05-22',
    category: 'Equipment Spares',
  },
  {
    id: 'OFF-1017',
    tenderId: 'TEN-2407',
    lineId: 'TEN-2407-L2',
    supplierCode: 'SUPPLIER 4',
    supplierName: 'ACTION MEDEOR',
    currency: 'TZS',
    itemCode: 'ACCESORY018',
    description: 'ELECTRODE CABLE',
    quantity: 8,
    units: 'each',
    price: 19100,
    leadTimeDays: 4,
    complianceStatus: 'Compliant',
    technicalScore: 91,
    supplierRating: 76,
    paymentTerms: '45 days',
    notes: 'Fastest cable delivery with confirmed compatibility.',
    expiryDate: '2026-05-22',
    category: 'Medical Consumables',
  },
  {
    id: 'OFF-1018',
    tenderId: 'TEN-2411',
    lineId: 'TEN-2411-L1',
    supplierCode: 'SUPPLIER',
    supplierName: 'PRIMECARE MEDICAL EQUIPMENT SUPPLY',
    currency: 'TZS',
    itemCode: 'PHARM-221',
    description: 'Ceftriaxone injection 1g',
    quantity: 320,
    units: 'vial',
    price: 2150,
    leadTimeDays: 2,
    complianceStatus: 'Clarification',
    technicalScore: 84,
    supplierRating: 82,
    paymentTerms: '14 days',
    notes: 'Fastest delivery, pending batch certificate clarification.',
    expiryDate: '2026-05-21',
    category: 'Pharmacy',
  },
  {
    id: 'OFF-1019',
    tenderId: 'TEN-2411',
    lineId: 'TEN-2411-L1',
    supplierCode: 'SUPPLIER 2',
    supplierName: 'MSD MEDICAL STORE DEPARTMENT',
    currency: 'TZS',
    itemCode: 'PHARM-221',
    description: 'Ceftriaxone injection 1g',
    quantity: 320,
    units: 'vial',
    price: 2320,
    leadTimeDays: 1,
    complianceStatus: 'Compliant',
    technicalScore: 96,
    supplierRating: 91,
    paymentTerms: '30 days',
    notes: 'Compliant public supplier with fastest delivery and batch certificate attached.',
    expiryDate: '2026-05-21',
    category: 'Pharmacy',
  },
  {
    id: 'OFF-1021',
    tenderId: 'TEN-2415',
    lineId: 'TEN-2415-L1',
    supplierCode: 'SUPPLIER 2',
    supplierName: 'MSD MEDICAL STORE DEPARTMENT',
    currency: 'TZS',
    itemCode: 'OFFICE-041',
    description: 'A4 printing paper ream',
    quantity: 40,
    units: 'ream',
    price: 11800,
    leadTimeDays: 7,
    complianceStatus: 'Compliant',
    technicalScore: 95,
    supplierRating: 91,
    paymentTerms: '30 days',
    notes: 'Framework supplier; price includes delivery.',
    expiryDate: '2026-05-28',
    category: 'Administration',
  },
  {
    id: 'OFF-1022',
    tenderId: 'TEN-2415',
    lineId: 'TEN-2415-L1',
    supplierCode: 'SUPPLIER 1',
    supplierName: "ZEEPY'I PHARMACEUTICALS LTD",
    currency: 'TZS',
    itemCode: 'OFFICE-041',
    description: 'A4 printing paper ream',
    quantity: 40,
    units: 'ream',
    price: 12400,
    leadTimeDays: 3,
    complianceStatus: 'Compliant',
    technicalScore: 88,
    supplierRating: 80,
    paymentTerms: '14 days',
    notes: 'Shorter delivery cycle, higher unit price and tighter payment terms.',
    expiryDate: '2026-05-27',
    category: 'Administration',
  },
];

const initialTenders: Tender[] = [
  {
    id: 'tender-2407',
    reference: 'TEN-2407',
    title: 'Equipment spares and medical cable replenishment',
    status: 'Evaluation',
    method: 'RFQ',
    category: 'Medical Consumables',
    location: 'ADMINISTRATION',
    currency: 'TZS',
    requiredDate: '2026-05-29',
    submissionDeadline: '2026-05-24',
    estimatedValue: 310000,
    createdBy: 'Procurement Lead',
    evaluationWeights: { price: 45, delivery: 20, compliance: 25, performance: 10 },
    lines: [
      {
        id: 'TEN-2407-L1',
        itemCode: 'ACCESORY016',
        description: 'GREASE',
        category: 'Equipment Spares',
        quantity: 12,
        units: 'kgs',
        requiredDate: '2026-05-29',
        technicalRequirement: 'Medical equipment compatible lubricant.',
        glCode: '5500',
      },
      {
        id: 'TEN-2407-L2',
        itemCode: 'ACCESORY018',
        description: 'ELECTRODE CABLE',
        category: 'Medical Consumables',
        quantity: 8,
        units: 'each',
        requiredDate: '2026-05-29',
        technicalRequirement: 'Compatible with theatre monitoring equipment.',
        glCode: '5500',
      },
    ],
    suppliers: [
      { supplierCode: 'AFRI D10', supplierName: 'AFRI DENTAL PRODUCTS', status: 'Responded', invitedAt: '2026-05-16 09:12', respondedAt: '2026-05-17 11:25' },
      { supplierCode: 'SUPPLIER 3', supplierName: 'ANUDHA LTD', status: 'Responded', invitedAt: '2026-05-16 09:12', respondedAt: '2026-05-17 12:08' },
      { supplierCode: 'SUPPLIER 4', supplierName: 'ACTION MEDEOR', status: 'Responded', invitedAt: '2026-05-16 09:12', respondedAt: '2026-05-17 12:42' },
    ],
    auditEvents: [
      { label: 'Tender moved to evaluation after supplier response', by: 'Procurement Lead', at: 'Today 11:25' },
      { label: 'Suppliers invited for RFQ', by: 'Procurement Lead', at: '16 May 2026 09:12' },
    ],
  },
  {
    id: 'tender-2411',
    reference: 'TEN-2411',
    title: 'Urgent pharmacy antibiotic replenishment',
    status: 'Offers Received',
    method: 'Restricted Tender',
    category: 'Pharmacy',
    location: 'PHARMACY',
    currency: 'TZS',
    requiredDate: '2026-05-22',
    submissionDeadline: '2026-05-21',
    estimatedValue: 688000,
    createdBy: 'Stores Manager',
    evaluationWeights: { price: 35, delivery: 35, compliance: 20, performance: 10 },
    lines: [
      {
        id: 'TEN-2411-L1',
        itemCode: 'PHARM-221',
        description: 'Ceftriaxone injection 1g',
        category: 'Pharmacy',
        quantity: 320,
        units: 'vial',
        requiredDate: '2026-05-22',
        technicalRequirement: 'Batch certificate required before award.',
        glCode: '5500',
      },
    ],
    suppliers: [
      { supplierCode: 'SUPPLIER', supplierName: 'PRIMECARE MEDICAL EQUIPMENT SUPPLY', status: 'Responded', invitedAt: '2026-05-17 08:40', respondedAt: '2026-05-17 13:05' },
      { supplierCode: 'SUPPLIER 2', supplierName: 'MSD MEDICAL STORE DEPARTMENT', status: 'Responded', invitedAt: '2026-05-17 08:40', respondedAt: '2026-05-17 13:18' },
    ],
    auditEvents: [
      { label: 'Offer received with compliance clarification required', by: 'Procurement Lead', at: 'Today 13:05' },
      { label: 'Emergency restricted tender published', by: 'Stores Manager', at: 'Today 08:40' },
    ],
  },
  {
    id: 'tender-2415',
    reference: 'TEN-2415',
    title: 'Administration stationery framework order',
    status: 'Award Recommended',
    method: 'RFQ',
    category: 'Administration',
    location: 'ADMINISTRATION',
    currency: 'TZS',
    requiredDate: '2026-05-31',
    submissionDeadline: '2026-05-28',
    estimatedValue: 472000,
    createdBy: 'Administration',
    evaluationWeights: { price: 60, delivery: 10, compliance: 20, performance: 10 },
    lines: [
      {
        id: 'TEN-2415-L1',
        itemCode: 'OFFICE-041',
        description: 'A4 printing paper ream',
        category: 'Administration',
        quantity: 40,
        units: 'ream',
        requiredDate: '2026-05-31',
        technicalRequirement: '80 gsm white paper, boxed delivery.',
        glCode: '5500',
      },
    ],
    suppliers: [
      { supplierCode: 'SUPPLIER 2', supplierName: 'MSD MEDICAL STORE DEPARTMENT', status: 'Responded', invitedAt: '2026-05-15 10:20', respondedAt: '2026-05-16 14:15' },
      { supplierCode: 'SUPPLIER 1', supplierName: "ZEEPY'I PHARMACEUTICALS LTD", status: 'Responded', invitedAt: '2026-05-15 10:20', respondedAt: '2026-05-16 15:02' },
      { supplierCode: 'SUPPLIER 3', supplierName: 'ANUDHA LTD', status: 'Declined', invitedAt: '2026-05-15 10:20' },
    ],
    auditEvents: [
      { label: 'Award recommendation prepared for framework supplier', by: 'Procurement Lead', at: '16 May 2026 14:40' },
      { label: 'Supplier offers received', by: 'Administration', at: '16 May 2026 14:15' },
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

function offerTotal(offer: SupplierOffer) {
  return offer.quantity * offer.price;
}

function complianceScoreValue(offer: SupplierOffer) {
  if (offer.complianceStatus === 'Compliant') return offer.technicalScore;
  if (offer.complianceStatus === 'Clarification') return Math.min(78, offer.technicalScore);
  return Math.min(45, offer.technicalScore);
}

function weightedOfferScore(offer: SupplierOffer, tender: Tender, lineOffers: SupplierOffer[]) {
  const lowestPrice = Math.min(...lineOffers.map((candidate) => candidate.price));
  const fastestLead = Math.min(...lineOffers.map((candidate) => candidate.leadTimeDays));
  const priceScore = Math.round((lowestPrice / Math.max(offer.price, 1)) * 100);
  const deliveryScore = Math.round((fastestLead / Math.max(offer.leadTimeDays, 1)) * 100);
  const complianceScore = complianceScoreValue(offer);
  const performanceScore = offer.supplierRating;
  const weights = tender.evaluationWeights;
  const score = Math.round(
    (priceScore * weights.price +
      deliveryScore * weights.delivery +
      complianceScore * weights.compliance +
      performanceScore * weights.performance) /
      100
  );

  return { score, priceScore, deliveryScore, complianceScore, performanceScore };
}

function evaluationForOffer(offer: SupplierOffer, tender: Tender, lineOffers: SupplierOffer[], rank: number): OfferEvaluation {
  const score = weightedOfferScore(offer, tender, lineOffers);
  const recommendation =
    offer.complianceStatus === 'Non-compliant'
      ? 'Reject'
      : rank === 1 && offer.complianceStatus === 'Compliant'
        ? 'Recommended'
        : rank <= 2
          ? 'Viable'
          : 'Review';

  return { ...score, rank, recommendation };
}

function scoreTone(score: number) {
  if (score >= 86) return 'text-emerald-700 dark:text-emerald-200';
  if (score >= 72) return 'text-amber-700 dark:text-amber-200';
  return 'text-rose-700 dark:text-rose-200';
}

function tenderRiskTone(level: TenderRiskLevel) {
  if (level === 'Low') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (level === 'Moderate') return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100';
  return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100';
}

function tenderStatusTone(status: TenderStatus) {
  if (status === 'PO Created' || status === 'Closed' || status === 'Approved') return 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900';
  if (status === 'Award Recommended' || status === 'Evaluation') return 'bg-purple-50 text-purple-800 ring-purple-200 dark:bg-purple-950/40 dark:text-purple-100 dark:ring-purple-900';
  if (status === 'Offers Received' || status === 'Supplier Invited' || status === 'Published') return 'bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-900';
  if (status === 'Cancelled') return 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900';
  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
}

function complianceTone(status: OfferComplianceStatus) {
  if (status === 'Compliant') return 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900';
  if (status === 'Clarification') return 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900';
  return 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900';
}

function invitationTone(status: TenderInvitationStatus) {
  if (status === 'Responded') return 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900';
  if (status === 'Viewed') return 'bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:ring-blue-900';
  if (status === 'Declined' || status === 'Expired') return 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900';
  return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
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

function isShipmentOperationsRoute(pathname: string) {
  const key = pathname.toLowerCase().replace(/[^a-z0-9]/g, '');
  return key.includes('selectsupplier') || key.includes('shiptselect') || key.includes('shipments');
}

function titleForRoute(pathname: string) {
  if (pathname.includes('offersreceived')) return 'Supplier Tenders and Offers';
  if (isShipmentOperationsRoute(pathname)) return 'Shipment Operations Workspace';
  if (pathname.includes('po-header')) return 'New Purchase Order';
  if (pathname.includes('po-selectospurchorder')) return 'Select Purchase Order';
  if (pathname.includes('po-authorisemyorders')) return 'Purchase Order Approvals';
  if (pathname.includes('outstanding-grns') || pathname.includes('suppinvgrns')) return 'GRN Bill Matching';
  return 'Purchase Orders';
}

function descriptionForRoute(pathname: string) {
  if (pathname.includes('offersreceived')) {
    return 'Control tender dossiers, compare supplier responses, score commercial and technical risk, and convert approved award decisions into purchase orders.';
  }
  if (isShipmentOperationsRoute(pathname)) {
    return 'Monitor live shipment records, receiving priorities, delayed deliveries, GRN queues, supplier risks, and shipment costing actions from one logistics workspace.';
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
  const { currentUser } = useApp();
  const authUser = useMemo(
    () => ({ id: currentUser.id, name: currentUser.name, email: currentUser.email }),
    [currentUser.email, currentUser.id, currentUser.name]
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
  const [shipmentRecords, setShipmentRecords] = useState<ShipmentRecord[]>([]);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [shipmentsReady, setShipmentsReady] = useState(false);
  const [shipmentLoadError, setShipmentLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [lookupSuppliers, setLookupSuppliers] = useState<SupplierLookup[]>(suppliers);
  const [selectedSupplierCode, setSelectedSupplierCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('SupplierID') || params.get('SelectedSupplier') || '';
  });
  const [lookupLocations, setLookupLocations] = useState<LookupOption[]>(locations);
  const [lookupCategories, setLookupCategories] = useState<LookupOption[]>(categoryOptions.filter((option) => option.value !== 'All'));
  const [offers, setOffers] = useState<SupplierOffer[]>(initialOffers);
  const [tenders, setTenders] = useState<Tender[]>(initialTenders);
  const [selectedTenderId, setSelectedTenderId] = useState(initialTenders[0]?.id ?? '');
  const [offerDecisions, setOfferDecisions] = useState<Record<string, OfferDecision>>({});
  const [offerMessage, setOfferMessage] = useState('');
  const [tenderModalOpen, setTenderModalOpen] = useState(false);
  const [tenderDraft, setTenderDraft] = useState<TenderDraftState>(() => createTenderDraftState());
  const [tenderDraftError, setTenderDraftError] = useState('');
  const [poAuthLevels, setPoAuthLevels] = useState<PoAuthorisationLevel[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [notificationSettings, setNotificationSettings] = useState<PoNotificationSettings>({ emailEnabled: false, smsEnabled: false, userEnabled: false, loaded: false });
  const [notificationOptions, setNotificationOptions] = useState<PoNotificationOptions>({ email: false, sms: false, user: false });
  const [authMessage, setAuthMessage] = useState('');
  const [rejectDraft, setRejectDraft] = useState<{ order: PurchaseOrder; comment: string } | null>(null);
  const [approvalDraft, setApprovalDraft] = useState<ApprovalDecisionDraft | null>(null);
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
  const isSelectSupplierRoute = isShipmentOperationsRoute(routePath);
  const isOffersRoute = routePath.includes('offersreceived');
  const isAuthoriseRoute = routePath.includes('po-authorisemyorders');

  const tenderOptions = useMemo(() => tenders.map((tender) => ({ value: tender.id, label: `${tender.reference} · ${tender.title}` })), [tenders]);

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

    async function loadShipments() {
      setLoadingShipments(true);
      setShipmentLoadError('');

      try {
        const response = await apiFetch(buildApiUrl('/api/purchases/shipments?limit=500'));
        if (!response.ok) {
          throw new Error('Shipment operations are temporarily unavailable.');
        }

        const payload = (await response.json()) as PurchaseShipmentsApiResponse;
        const rows = Array.isArray(payload.data)
          ? payload.data.map(normalizeShipmentRecord).filter((shipment): shipment is ShipmentRecord => shipment !== null)
          : [];

        if (cancelled) return;

        setShipmentRecords(rows);
        setShipmentsReady(true);
      } catch (error) {
        if (cancelled) return;
        setShipmentRecords([]);
        setShipmentsReady(false);
        setShipmentLoadError(error instanceof Error ? error.message : 'Shipment operations are temporarily unavailable.');
      } finally {
        if (!cancelled) setLoadingShipments(false);
      }
    }

    loadShipments();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (!selectedSupplierCode) return;
    if (lookupSuppliers.some((supplier) => supplier.value === selectedSupplierCode)) return;
    setSelectedSupplierCode('');
  }, [lookupSuppliers, selectedSupplierCode]);

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
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationSettings() {
      try {
        const payload = await fetchSystemParameters();
        if (cancelled) return;
        const emailEnabled = booleanParameter(payload.parameters.SendPOEmailNotification);
        const smsEnabled = booleanParameter(payload.parameters.SendPOSMSNotification);
        const userEnabled = booleanParameter(payload.parameters.SendPOUserNotification);
        setNotificationSettings({ emailEnabled, smsEnabled, userEnabled, loaded: true });
        setNotificationOptions({ email: emailEnabled, sms: smsEnabled, user: userEnabled });
      } catch {
        if (cancelled) return;
        setNotificationSettings({ emailEnabled: false, smsEnabled: false, userEnabled: false, loaded: true });
        setNotificationOptions({ email: false, sms: false, user: false });
      }
    }

    loadNotificationSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tenderOptions.length === 0) {
      setSelectedTenderId('');
      return;
    }
    if (!tenderOptions.some((option) => option.value === selectedTenderId)) {
      setSelectedTenderId(tenderOptions[0].value);
    }
  }, [selectedTenderId, tenderOptions]);

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
  const selectedAuthLevel = useMemo(
    () => poAuthLevels.find((level) => authProfileMatches(level, authUser)) ?? poAuthLevels.find((level) => level.canReview) ?? poAuthLevels[0] ?? null,
    [poAuthLevels, authUser]
  );
  const approvalOrders = useMemo(
    () => orders.filter((order) => ['Pending Review', 'Reviewed'].includes(order.status)).sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    [orders]
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

  const selectedTender = useMemo(() => tenders.find((tender) => tender.id === selectedTenderId) ?? tenders[0] ?? null, [selectedTenderId, tenders]);
  const selectedTenderOffers = useMemo(() => (
    selectedTender ? offers.filter((offer) => offer.tenderId === selectedTender.reference) : []
  ), [offers, selectedTender]);

  const offerSummary = useMemo(() => {
    const expiringSoon = selectedTenderOffers.filter((offer) => daysUntil(offer.expiryDate) <= 7).length;
    const uniqueSuppliers = new Set(selectedTenderOffers.map((offer) => offer.supplierCode));
    return {
      lineCount: selectedTenderOffers.length,
      totalValue: selectedTenderOffers.reduce((sum, offer) => sum + offerTotal(offer), 0),
      acceptedCount: selectedTenderOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'accept').length,
      rejectedCount: selectedTenderOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'reject').length,
      expiringSoon,
      supplierCount: uniqueSuppliers.size,
      currency: selectedTender?.currency ?? selectedTenderOffers[0]?.currency ?? 'TZS',
    };
  }, [offerDecisions, selectedTender, selectedTenderOffers]);

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
        header: 'Actions',
        accessor: (order) => actionForStatus(order.status),
        filterable: false,
        sortable: false,
        alwaysVisible: true,
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
        sticky: 'right',
        width: 170,
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
    return selectedAuthLevel?.userName || selectedAuthLevel?.userId || currentUser.name || currentUser.id || 'Current user';
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
    if (notificationOptions.user && notificationSettings.userEnabled) {
      events.push({ label: `User notification queued to ${recipient}`, by: 'System', at: 'Today' });
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

  function requestApproveReview(order: PurchaseOrder) {
    setApprovalDraft({ order, action: 'review', comment: '' });
  }

  function requestAuthoriseOrder(order: PurchaseOrder) {
    setApprovalDraft({ order, action: 'authorise', comment: '' });
  }

  function approveReview(order: PurchaseOrder, reason: string) {
    transitionOrder(order.id, 'Reviewed', `Review approved by ${actionActor()}: ${reason}`, notificationEvents(order, 'review-approved'));
    setAuthMessage(`PO ${order.orderNumber} review approved. ${notificationSummary()}`);
  }

  function authoriseOrder(order: PurchaseOrder, reason: string) {
    transitionOrder(order.id, 'Authorised', `Authorised by ${actionActor()}: ${reason}`, notificationEvents(order, 'authorised'));
    setAuthMessage(`PO ${order.orderNumber} authorised. ${notificationSummary()}`);
  }

  function submitApprovalDecision() {
    if (!approvalDraft) return;
    const reason = approvalDraft.comment.trim();
    if (!reason) {
      setAuthMessage('Enter a reason before posting the approval action.');
      return;
    }

    if (approvalDraft.action === 'review') {
      approveReview(approvalDraft.order, reason);
    } else {
      authoriseOrder(approvalDraft.order, reason);
    }

    setApprovalDraft(null);
    if (drawerMode === 'review') setDrawerMode(null);
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
      notificationOptions.user && notificationSettings.userEnabled ? 'user notification queued' : '',
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

  function startPurchaseOrderForSupplier(supplierCode: string) {
    setDraftSupplier(supplierCode);
    navigateTo('/purchases/transactions/po-header');
  }

  function viewPurchaseOrdersForSupplier(supplier: SupplierLookup, status = 'outstanding') {
    setQuery(`${supplier.value} ${supplier.label}`);
    setActiveTab(status === 'all' ? 'all' : 'outstanding');
    setStatusFilter(status);
    setFiltersOpen(true);
    navigateTo(`/purchases/transactions/po-selectospurchorder?SelectedSupplier=${encodeURIComponent(supplier.value)}`);
  }

  function openTenderDossierModal() {
    setTenderDraft(createTenderDraftState(lookupSuppliers));
    setTenderDraftError('');
    setTenderModalOpen(true);
  }

  function toggleTenderDraftSupplier(supplierCode: string) {
    setTenderDraft((current) => {
      const selected = current.supplierCodes.includes(supplierCode);
      return {
        ...current,
        supplierCodes: selected
          ? current.supplierCodes.filter((code) => code !== supplierCode)
          : [...current.supplierCodes, supplierCode],
      };
    });
  }

  function createTenderDossier() {
    const title = tenderDraft.title.trim();
    const selectedSuppliers = lookupSuppliers.filter((supplier) => tenderDraft.supplierCodes.includes(supplier.value));
    const item = catalog.find((candidate) => candidate.itemCode === tenderDraft.itemCode) ?? catalog[0];
    const totalWeight = tenderDraft.priceWeight + tenderDraft.deliveryWeight + tenderDraft.complianceWeight + tenderDraft.performanceWeight;

    if (!title) {
      setTenderDraftError('Enter a tender title before creating the dossier.');
      return;
    }

    if (selectedSuppliers.length === 0) {
      setTenderDraftError('Select at least one supplier to invite.');
      return;
    }

    if (tenderDraft.quantity <= 0 || tenderDraft.estimatedValue <= 0) {
      setTenderDraftError('Quantity and estimated value must be greater than zero.');
      return;
    }

    if (totalWeight !== 100) {
      setTenderDraftError('Evaluation weights must total 100%.');
      return;
    }

    const reference = `TEN-${2500 + tenders.length + 1}`;
    const tender: Tender = {
      id: `tender-${Date.now()}`,
      reference,
      title,
      status: 'Supplier Invited',
      method: tenderDraft.method,
      category: tenderDraft.category,
      location: tenderDraft.location,
      currency: 'TZS',
      requiredDate: tenderDraft.requiredDate,
      submissionDeadline: tenderDraft.submissionDeadline,
      estimatedValue: tenderDraft.estimatedValue,
      createdBy: 'Procurement Lead',
      evaluationWeights: {
        price: tenderDraft.priceWeight,
        delivery: tenderDraft.deliveryWeight,
        compliance: tenderDraft.complianceWeight,
        performance: tenderDraft.performanceWeight,
      },
      lines: [
        {
          id: `${reference}-L1`,
          itemCode: item.itemCode,
          description: item.description,
          category: tenderDraft.category,
          quantity: tenderDraft.quantity,
          units: tenderDraft.units,
          requiredDate: tenderDraft.requiredDate,
          technicalRequirement: tenderDraft.technicalRequirement || item.description,
          glCode: tenderDraft.glCode,
        },
      ],
      suppliers: selectedSuppliers.map((supplier) => ({
        supplierCode: supplier.value,
        supplierName: supplier.label,
        status: 'Invited',
        invitedAt: 'Today',
      })),
      auditEvents: [
        { label: 'Tender dossier created and supplier invitations staged', by: 'Procurement Lead', at: 'Today' },
      ],
    };

    setTenders((current) => [tender, ...current]);
    setSelectedTenderId(tender.id);
    setOfferDecisions({});
    setOfferMessage(`Tender dossier ${reference} created. Add supplier responses from the Responses step when vendors submit offers.`);
    setTenderModalOpen(false);
  }

  function addVendorResponse(draft: VendorResponseDraftState) {
    if (!selectedTender) return;
    const line = selectedTender.lines.find((item) => item.id === draft.lineId);
    const supplier = selectedTender.suppliers.find((item) => item.supplierCode === draft.supplierCode);
    if (!line || !supplier) return;

    const offer: SupplierOffer = {
      id: `OFF-${1100 + offers.length + 1}`,
      tenderId: selectedTender.reference,
      lineId: line.id,
      supplierCode: supplier.supplierCode,
      supplierName: supplier.supplierName,
      currency: selectedTender.currency,
      itemCode: line.itemCode,
      description: line.description,
      quantity: line.quantity,
      units: line.units,
      price: draft.price,
      leadTimeDays: draft.leadTimeDays,
      complianceStatus: draft.complianceStatus,
      technicalScore: draft.technicalScore,
      supplierRating: draft.supplierRating,
      paymentTerms: draft.paymentTerms,
      notes: draft.notes || 'Vendor application captured from the tender response stage.',
      expiryDate: draft.expiryDate,
      category: line.category,
    };

    setOffers((current) => [offer, ...current]);
    setTenders((current) =>
      current.map((tender) => {
        if (tender.id !== selectedTender.id) return tender;
        return {
          ...tender,
          status: tender.status === 'Supplier Invited' || tender.status === 'Published' ? 'Offers Received' : tender.status,
          suppliers: tender.suppliers.map((item) =>
            item.supplierCode === supplier.supplierCode
              ? { ...item, status: 'Responded', respondedAt: item.respondedAt ?? 'Today' }
              : item
          ),
          auditEvents: [
            { label: `Vendor application received from ${supplier.supplierName}`, by: 'Procurement Lead', at: 'Today' },
            ...tender.auditEvents,
          ],
        };
      })
    );
    setOfferMessage(`Vendor application ${offer.id} from ${supplier.supplierName} was added to ${selectedTender.reference}.`);
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
    if (!selectedTender) {
      setOfferMessage('Select a tender before processing award decisions.');
      return;
    }

    const accepted = selectedTenderOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'accept');
    const rejected = selectedTenderOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'reject');
    const deferred = selectedTenderOffers.filter((offer) => (offerDecisions[offer.id] ?? 'defer') === 'defer');

    if (accepted.length === 0 && rejected.length === 0) {
      setOfferMessage('Choose at least one offer to accept or reject. Deferred lines remain outstanding.');
      return;
    }

    const duplicateAwards = selectedTender.lines.filter((line) => accepted.filter((offer) => offer.lineId === line.id).length > 1);
    if (duplicateAwards.length > 0) {
      setOfferMessage(`Only one supplier can be awarded per tender line. Review: ${duplicateAwards.map((line) => line.itemCode).join(', ')}.`);
      return;
    }

    const nonCompliantAwards = accepted.filter((offer) => offer.complianceStatus === 'Non-compliant');
    if (nonCompliantAwards.length > 0) {
      setOfferMessage(`Non-compliant offers cannot be awarded without an override workflow. Defer or reject: ${nonCompliantAwards.map((offer) => offer.id).join(', ')}.`);
      return;
    }

    if (accepted.length > 0) {
      const groups = accepted.reduce<Record<string, SupplierOffer[]>>((bySupplier, offer) => {
        bySupplier[offer.supplierCode] = [...(bySupplier[offer.supplierCode] ?? []), offer];
        return bySupplier;
      }, {});
      const baseOrderNumber = 621 + orders.length;
      const createdOrders = Object.entries(groups).map(([supplierCode, supplierOffers], index): PurchaseOrder => {
        const supplier = lookupSuppliers.find((item) => item.value === supplierCode);
        const firstOffer = supplierOffers[0];
        return {
          id: `po-${selectedTender.reference.toLowerCase()}-${supplierCode.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${index}`,
          orderNumber: String(baseOrderNumber + index),
          realOrderNumber: `PO-2026-${String(baseOrderNumber + index).padStart(5, '0')}`,
          supplierCode,
          supplierName: supplier?.label ?? firstOffer.supplierName,
          supplierAddress: supplier?.address ?? '',
          currency: firstOffer.currency,
          exchangeRate: 1,
          orderDate: new Date().toISOString().slice(0, 10),
          deliveryDate: selectedTender.requiredDate,
          initiatedBy: 'John Doe',
          reviewer: 'Procurement Lead',
          location: selectedTender.location,
          requisitionNo: selectedTender.reference,
          paymentTerms: firstOffer.paymentTerms,
          deliveryBy: 'Supplier',
          comments: `Created from tender ${selectedTender.reference}. Award rationale captured in tender evaluation.`,
          status: 'Pending Review',
          allowPrint: false,
          lines: supplierOffers.map((offer) => ({
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
            deliveryDate: selectedTender.requiredDate,
            unitPrice: offer.price,
            taxRate: 0,
            glCode: selectedTender.lines.find((line) => line.id === offer.lineId)?.glCode ?? '5500',
            completed: false,
          })),
          events: [
            { label: `Created from tender ${selectedTender.reference} award decision`, by: 'John Doe', at: 'Today' },
            { label: 'Tender evaluation and award recommendation attached', by: 'Procurement Lead', at: 'Today' },
          ],
        };
      });

      setOrders((current) => [...createdOrders, ...current]);
      setSelectedId(createdOrders[0]?.id ?? selectedId);
    }

    const processedIds = new Set([...accepted, ...rejected].map((offer) => offer.id));
    setOffers((current) => current.filter((offer) => !processedIds.has(offer.id)));
    setOfferDecisions((current) => {
      const next = { ...current };
      processedIds.forEach((id) => delete next[id]);
      return next;
    });
    setTenders((current) =>
      current.map((tender) => {
        if (tender.id !== selectedTender.id) return tender;
        const nextStatus: TenderStatus = accepted.length > 0 ? 'PO Created' : rejected.length > 0 && deferred.length === 0 ? 'Closed' : 'Evaluation';
        return {
          ...tender,
          status: nextStatus,
          auditEvents: [
            {
              label: `${accepted.length} offers accepted, ${rejected.length} rejected, ${deferred.length} deferred`,
              by: 'John Doe',
              at: 'Today',
            },
            ...tender.auditEvents,
          ],
        };
      })
    );
    setOfferMessage(
      `${accepted.length} accepted, ${rejected.length} rejected, ${deferred.length} deferred. ${
        accepted.length > 0 ? 'Pending-review purchase order(s) were created by supplier.' : 'Rejected offers were removed.'
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
            <Button onClick={() => requestApproveReview(selectedOrder)}>
              <>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Approve review
              </>
            </Button>
          ) : (
            <Button onClick={() => requestAuthoriseOrder(selectedOrder)}>
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
                  <Chip icon={isCreatePoRoute ? Plus : isSelectSupplierRoute ? Truck : isOffersRoute ? ClipboardCheck : isAuthoriseRoute ? ShieldCheck : FileText}>
                    {isCreatePoRoute ? 'New PO' : isSelectSupplierRoute ? 'Inbound logistics' : isOffersRoute ? 'Tender awards' : isAuthoriseRoute ? 'Authorise POs' : 'Purchase orders'}
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
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                {isCreatePoRoute ? (
                  <div className="grid w-full grid-cols-[2.75rem_minmax(0,1fr)] gap-2 sm:w-[300px]">
                    <button
                      type="button"
                      aria-label="Refresh purchase orders"
                      title="Refresh purchase orders"
                      onClick={() => setReloadKey((value) => value + 1)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text focus:outline-none focus:ring-2 focus:ring-akiva-accent focus:ring-offset-2 focus:ring-offset-akiva-bg"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <Button
                      variant="secondary"
                      onClick={() => saveDraftOrder('Draft')}
                      className="h-11 w-full rounded-xl px-4 text-sm"
                    >
                      Save draft
                    </Button>
                    <Button
                      onClick={() => saveDraftOrder('Pending Review')}
                      className="col-span-2 h-11 w-full rounded-xl px-4 text-sm shadow-sm shadow-violet-950/10"
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Submit for review
                    </Button>
                  </div>
                ) : isSelectSupplierRoute ? (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button
                      disabled={!selectedSupplierCode}
                      onClick={() => {
                        const supplier = lookupSuppliers.find((item) => item.value === selectedSupplierCode);
                        if (supplier) startPurchaseOrderForSupplier(supplier.value);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New PO
                    </Button>
                    <Button variant="secondary" onClick={() => navigateTo('/purchases/maintenance/supplier-maintenance')}>
                      <FileText className="mr-2 h-4 w-4" />
                      Add supplier
                    </Button>
                  </div>
                ) : isOffersRoute ? (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <Button onClick={openTenderDossierModal}>
                      <Plus className="mr-2 h-4 w-4" />
                      New tender dossier
                    </Button>
                    <Button variant="secondary" onClick={processSupplierOffers} disabled={selectedTenderOffers.length === 0}>
                      <Check className="mr-2 h-4 w-4" />
                      Process award
                    </Button>
                  </div>
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

          {!isCreatePoRoute && !isSelectSupplierRoute && !isOffersRoute && !isAuthoriseRoute && filtersOpen ? (
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
              {isSelectSupplierRoute ? (
                <SelectSupplierPanel
                  suppliers={lookupSuppliers}
                  orders={orders}
                  apiShipments={shipmentRecords}
                  shipmentsReady={shipmentsReady}
                  selectedSupplierCode={selectedSupplierCode}
                  loading={loadingOrders || loadingShipments}
                  shipmentLoadError={shipmentLoadError}
                  onSelect={setSelectedSupplierCode}
                  onNewPurchaseOrder={startPurchaseOrderForSupplier}
                  onViewPurchaseOrders={viewPurchaseOrdersForSupplier}
                  onNavigate={navigateTo}
                />
              ) : isOffersRoute ? (
                <OffersReceivedPanel
                  tenders={tenders}
                  selectedTender={selectedTender}
                  selectedTenderId={selectedTenderId}
                  tenderOptions={tenderOptions}
                  selectedOffers={selectedTenderOffers}
                  decisions={offerDecisions}
                  summary={offerSummary}
                  message={offerMessage}
                  onTenderChange={(tenderId) => {
                    setSelectedTenderId(tenderId);
                    setOfferMessage('');
                  }}
                  onDecisionChange={(offerId, decision) => {
                    setOfferMessage('');
                    setOfferDecisions((current) => ({ ...current, [offerId]: decision }));
                  }}
                  onAcceptRecommended={(offerIds) => {
                    setOfferMessage('');
                    setOfferDecisions((current) => {
                      const next = { ...current };
                      selectedTenderOffers.forEach((offer) => {
                        next[offer.id] = offerIds.includes(offer.id) ? 'accept' : 'defer';
                      });
                      return next;
                    });
                  }}
                  onAddVendorResponse={addVendorResponse}
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
                  selectedAuthLevel={selectedAuthLevel}
                  loading={authLoading}
                  error={authError}
                  message={authMessage}
                  notificationSettings={notificationSettings}
                  notificationOptions={notificationOptions}
                  onOpen={(order) => openDrawer(order, 'review')}
                  onReview={requestApproveReview}
                  onAuthorise={requestAuthoriseOrder}
                  onReject={requestRejectOrder}
                  onNotificationChange={(patch) => setNotificationOptions((current) => ({ ...current, ...patch }))}
                  onSetupLevels={() => navigateTo('/configuration/purchases-payables/setup/po-authorisation-levels')}
                  onOpenNotificationSettings={() => navigateTo('/configuration/system/system-parameters')}
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
                        initialScroll="right"
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
        isOpen={approvalDraft !== null}
        onClose={() => setApprovalDraft(null)}
        title={
          approvalDraft
            ? `${approvalDraft.action === 'review' ? 'Approve review' : 'Authorise'} PO ${approvalDraft.order.orderNumber}`
            : 'Post approval action'
        }
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApprovalDraft(null)}>Cancel</Button>
            <Button onClick={submitApprovalDecision} disabled={!approvalDraft?.comment.trim()}>
              {approvalDraft?.action === 'review' ? (
                <>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Approve review
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Authorise PO
                </>
              )}
            </Button>
          </>
        }
      >
        {approvalDraft ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-sm">
              <p className="font-semibold text-akiva-text">{approvalDraft.order.supplierName}</p>
              <p className="mt-1 text-akiva-text-muted">
                {money(orderTotal(approvalDraft.order), approvalDraft.order.currency)} · {approvalDraft.order.status}
              </p>
            </div>
            <Field label={approvalDraft.action === 'review' ? 'Review approval reason' : 'Authorisation reason'}>
              <textarea
                value={approvalDraft.comment}
                onChange={(event) => setApprovalDraft((current) => (current ? { ...current, comment: event.target.value } : current))}
                rows={4}
                className={`${inputClass} h-auto min-h-28 py-3`}
                placeholder={approvalDraft.action === 'review' ? 'Explain why this purchase order can move to final authorisation' : 'Explain why this purchase order can be authorised'}
                autoFocus
              />
            </Field>
            <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-sm text-akiva-text-muted">
              The reason will be saved in the PO audit trail. Enabled user, email, and SMS notifications will be queued from the current System Parameters settings.
            </div>
          </div>
        ) : null}
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
              The comment will be saved in the PO audit trail. Enabled user, email, and SMS notifications will be queued from the current System Parameters settings.
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={tenderModalOpen}
        onClose={() => setTenderModalOpen(false)}
        title="Create Tender Dossier"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTenderModalOpen(false)}>Cancel</Button>
            <Button onClick={createTenderDossier}>
              <Plus className="mr-2 h-4 w-4" />
              Create dossier
            </Button>
          </>
        }
      >
        <CreateTenderDossierPanel
          draft={tenderDraft}
          suppliers={lookupSuppliers}
          locations={lookupLocations}
          categories={lookupCategories}
          error={tenderDraftError}
          onChange={(patch) => {
            setTenderDraftError('');
            setTenderDraft((current) => ({ ...current, ...patch }));
          }}
          onToggleSupplier={toggleTenderDraftSupplier}
        />
      </Modal>
    </div>
  );
}

function CreateTenderDossierPanel({
  draft,
  suppliers: supplierOptions,
  locations: locationOptions,
  categories,
  error,
  onChange,
  onToggleSupplier,
}: {
  draft: TenderDraftState;
  suppliers: SupplierLookup[];
  locations: LookupOption[];
  categories: LookupOption[];
  error: string;
  onChange: (patch: Partial<TenderDraftState>) => void;
  onToggleSupplier: (supplierCode: string) => void;
}) {
  const [supplierSearch, setSupplierSearch] = useState('');
  const itemOptions = catalog.map((item) => ({ value: item.itemCode, label: `${item.itemCode} - ${item.description}` }));
  const selectedItem = catalog.find((item) => item.itemCode === draft.itemCode) ?? catalog[0];
  const totalWeight = draft.priceWeight + draft.deliveryWeight + draft.complianceWeight + draft.performanceWeight;
  const selectedSupplierCount = draft.supplierCodes.length;
  const supplierSearchTerm = supplierSearch.trim().toLowerCase();
  const filteredSuppliers = supplierSearchTerm
    ? supplierOptions.filter((supplier) =>
        `${supplier.label} ${supplier.value} ${supplier.address ?? ''}`.toLowerCase().includes(supplierSearchTerm)
      )
    : supplierOptions;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      <PanelSection title="Tender header">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Tender title">
            <input
              className={inputClass}
              value={draft.title}
              onChange={(event) => onChange({ title: event.target.value })}
              placeholder="Example: Pharmacy antibiotic replenishment"
            />
          </Field>
          <Field label="Procurement method">
            <SearchableSelect
              value={draft.method}
              onChange={(value) => onChange({ method: value as Tender['method'] })}
              options={tenderMethodOptions}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Category">
            <SearchableSelect
              value={draft.category}
              onChange={(value) => onChange({ category: value })}
              options={categories}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Required location">
            <SearchableSelect
              value={draft.location}
              onChange={(value) => onChange({ location: value })}
              options={locationOptions}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Submission deadline">
            <DatePicker value={draft.submissionDeadline} onChange={(value) => onChange({ submissionDeadline: value })} />
          </Field>
          <Field label="Required date">
            <DatePicker value={draft.requiredDate} onChange={(value) => onChange({ requiredDate: value })} />
          </Field>
        </div>
      </PanelSection>

      <PanelSection title="First tender line">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_130px_120px]">
          <Field label="Item">
            <SearchableSelect
              value={draft.itemCode}
              onChange={(value) => {
                const item = catalog.find((candidate) => candidate.itemCode === value) ?? selectedItem;
                onChange({
                  itemCode: item.itemCode,
                  category: item.category,
                  units: item.supplierUnits,
                  technicalRequirement: item.description,
                  glCode: item.glCode,
                  estimatedValue: Math.max(1, draft.quantity) * item.unitPrice,
                });
              }}
              options={itemOptions}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Quantity">
            <input
              className={`${inputClass} text-right`}
              type="number"
              min={1}
              value={draft.quantity}
              onChange={(event) => {
                const quantity = Math.max(1, Number(event.target.value));
                onChange({ quantity, estimatedValue: quantity * selectedItem.unitPrice });
              }}
            />
          </Field>
          <Field label="Units">
            <input className={inputClass} value={draft.units} onChange={(event) => onChange({ units: event.target.value })} />
          </Field>
          <Field label="GL code">
            <input className={inputClass} value={draft.glCode} onChange={(event) => onChange({ glCode: event.target.value })} />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
          <Field label="Technical requirement">
            <textarea
              rows={3}
              className={`${inputClass} h-auto min-h-24 py-3`}
              value={draft.technicalRequirement}
              onChange={(event) => onChange({ technicalRequirement: event.target.value })}
            />
          </Field>
          <Field label="Estimated value">
            <input
              className={`${inputClass} text-right`}
              type="number"
              min={1}
              value={draft.estimatedValue}
              onChange={(event) => onChange({ estimatedValue: Math.max(1, Number(event.target.value)) })}
            />
          </Field>
        </div>
      </PanelSection>

      <PanelSection title={`Supplier shortlist (${selectedSupplierCount} selected)`}>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
          <input
            className={`${inputClass} pl-10`}
            value={supplierSearch}
            onChange={(event) => setSupplierSearch(event.target.value)}
            placeholder="Search suppliers by name, code, or address"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {filteredSuppliers.map((supplier) => {
            const checked = draft.supplierCodes.includes(supplier.value);
            return (
              <label
                key={supplier.value}
                className={`flex cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-2 shadow-sm transition ${
                  checked
                    ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-text'
                    : 'border-akiva-border bg-akiva-surface-raised text-akiva-text hover:border-akiva-accent/60 hover:bg-akiva-surface-muted'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{supplier.label}</span>
                  <span className="mt-0.5 block text-xs text-akiva-text-muted">{supplier.value} · {supplier.currency ?? 'TZS'}</span>
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSupplier(supplier.value)}
                  className="peer sr-only"
                />
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border shadow-sm ${
                  checked ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface text-transparent'
                }`}>
                  <Check className="h-4 w-4 stroke-[3]" />
                </span>
              </label>
            );
          })}
          {filteredSuppliers.length === 0 ? (
            <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-sm text-akiva-text-muted sm:col-span-2">
              No suppliers match this search.
            </div>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="Evaluation weights">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Price %">
            <input className={`${inputClass} text-right`} type="number" min={0} max={100} value={draft.priceWeight} onChange={(event) => onChange({ priceWeight: Number(event.target.value) })} />
          </Field>
          <Field label="Delivery %">
            <input className={`${inputClass} text-right`} type="number" min={0} max={100} value={draft.deliveryWeight} onChange={(event) => onChange({ deliveryWeight: Number(event.target.value) })} />
          </Field>
          <Field label="Compliance %">
            <input className={`${inputClass} text-right`} type="number" min={0} max={100} value={draft.complianceWeight} onChange={(event) => onChange({ complianceWeight: Number(event.target.value) })} />
          </Field>
          <Field label="Performance %">
            <input className={`${inputClass} text-right`} type="number" min={0} max={100} value={draft.performanceWeight} onChange={(event) => onChange({ performanceWeight: Number(event.target.value) })} />
          </Field>
        </div>
        <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
          totalWeight === 100
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100'
            : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100'
        }`}>
          Weight total: {totalWeight}%
        </div>
      </PanelSection>
    </div>
  );
}

function VendorResponsePanel({
  tender,
  draft,
  error,
  onChange,
}: {
  tender: Tender;
  draft: VendorResponseDraftState;
  error: string;
  onChange: (patch: Partial<VendorResponseDraftState>) => void;
}) {
  const supplierOptions = tender.suppliers.map((supplier) => ({ value: supplier.supplierCode, label: supplier.supplierName }));
  const lineOptions = tender.lines.map((line) => ({ value: line.id, label: `${line.itemCode} - ${line.description}` }));
  const selectedLine = tender.lines.find((line) => line.id === draft.lineId) ?? tender.lines[0];
  const responseValue = selectedLine ? selectedLine.quantity * draft.price : 0;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      <PanelSection title="Vendor application header">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Vendor">
            <SearchableSelect
              value={draft.supplierCode}
              onChange={(value) => onChange({ supplierCode: value })}
              options={supplierOptions}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Tender line">
            <SearchableSelect
              value={draft.lineId}
              onChange={(value) => onChange({ lineId: value })}
              options={lineOptions}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Unit price">
            <input
              className={`${inputClass} text-right`}
              type="number"
              min={0}
              value={draft.price}
              onChange={(event) => onChange({ price: Number(event.target.value) })}
            />
          </Field>
          <Field label="Lead time days">
            <input
              className={`${inputClass} text-right`}
              type="number"
              min={1}
              value={draft.leadTimeDays}
              onChange={(event) => onChange({ leadTimeDays: Math.max(1, Number(event.target.value)) })}
            />
          </Field>
          <Field label="Payment terms">
            <input className={inputClass} value={draft.paymentTerms} onChange={(event) => onChange({ paymentTerms: event.target.value })} />
          </Field>
          <Field label="Offer valid until">
            <DatePicker value={draft.expiryDate} onChange={(value) => onChange({ expiryDate: value })} />
          </Field>
        </div>
      </PanelSection>

      <PanelSection title="Compliance and scoring">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Compliance">
            <SearchableSelect
              value={draft.complianceStatus}
              onChange={(value) => onChange({ complianceStatus: value as OfferComplianceStatus })}
              options={complianceOptions}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Technical score">
            <input
              className={`${inputClass} text-right`}
              type="number"
              min={0}
              max={100}
              value={draft.technicalScore}
              onChange={(event) => onChange({ technicalScore: Number(event.target.value) })}
            />
          </Field>
          <Field label="Supplier rating">
            <input
              className={`${inputClass} text-right`}
              type="number"
              min={0}
              max={100}
              value={draft.supplierRating}
              onChange={(event) => onChange({ supplierRating: Number(event.target.value) })}
            />
          </Field>
        </div>
        <Field label="Application notes">
          <textarea
            rows={3}
            className={`${inputClass} h-auto min-h-24 py-3`}
            value={draft.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="Capture commercial exceptions, attached certificates, delivery constraints, or clarification notes."
          />
        </Field>
      </PanelSection>

      <div className="grid gap-3 rounded-xl border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm sm:grid-cols-3">
        <InfoTile label="Tender" value={tender.reference} />
        <InfoTile label="Quantity" value={selectedLine ? `${selectedLine.quantity} ${selectedLine.units}` : 'No line'} />
        <InfoTile label="Response value" value={money(responseValue, tender.currency)} />
      </div>
    </div>
  );
}

type ShipmentRisk = 'Low' | 'Medium' | 'High';
type ShipmentStatus = 'Ordered' | 'In Transit' | 'Customs Hold' | 'Warehouse Receiving' | 'Awaiting GRN' | 'Partial Receipt' | 'Invoice Match' | 'Closed';
type OperationalWorkspaceTab = 'Overview' | 'Workflow' | 'Actions' | 'Intelligence' | 'Tracking';
type QueueDensity = 'Compact' | 'Comfortable';

interface ShipmentWorkspaceAction {
  label: string;
  detail: string;
  icon: LucideIcon;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface ShipmentRecord {
  id: string;
  order: PurchaseOrder;
  legacyShipmentRef?: number;
  vessel?: string;
  voyageRef?: string;
  closed?: boolean;
  supplierCode: string;
  supplierName: string;
  etaLabel: string;
  etaDays: number;
  status: ShipmentStatus;
  risk: ShipmentRisk;
  value: number;
  progress: number;
  containerCount: number;
  issue: string;
  priority: number;
  orderedQuantity?: number;
  receivedQuantity?: number;
  invoicedQuantity?: number;
  openQuantity?: number;
  grnCount?: number;
  lastGrnDate?: string;
  shipmentCharges?: number;
  shipmentChargeCount?: number;
  orderCount?: number;
  lineCount?: number;
  timeline?: ShipmentTimelineEvent[];
  source?: string;
}

interface ShipmentTimelineEvent {
  time: string;
  label: string;
  detail: string;
  tone: 'neutral' | 'warning' | 'critical' | 'success';
}

const shipmentStatuses: ShipmentStatus[] = ['Ordered', 'In Transit', 'Customs Hold', 'Warehouse Receiving', 'Awaiting GRN', 'Partial Receipt', 'Invoice Match', 'Closed'];
const shipmentRisks: ShipmentRisk[] = ['Low', 'Medium', 'High'];

function normalizeShipmentRecord(record: Partial<ShipmentRecord> | null | undefined): ShipmentRecord | null {
  const order = record?.order;
  if (!order?.orderNumber) return null;

  const etaDays = Number.isFinite(Number(record.etaDays)) ? Number(record.etaDays) : daysUntil(order.deliveryDate);
  const status = shipmentStatuses.includes(record.status as ShipmentStatus) ? record.status as ShipmentStatus : shipmentStatusFromOrder(order);
  const risk = shipmentRisks.includes(record.risk as ShipmentRisk) ? record.risk as ShipmentRisk : shipmentRiskFromOrder(order, status, etaDays);
  const value = Number.isFinite(Number(record.value)) ? Number(record.value) : orderTotal(order);
  const progress = Number.isFinite(Number(record.progress)) ? Number(record.progress) : shipmentProgressFromStatus(status);

  return {
    id: String(record.id ?? `PO-${order.orderNumber}`),
    order,
    legacyShipmentRef: Number.isFinite(Number(record.legacyShipmentRef)) ? Number(record.legacyShipmentRef) : undefined,
    vessel: record.vessel ? String(record.vessel) : undefined,
    voyageRef: record.voyageRef ? String(record.voyageRef) : undefined,
    closed: Boolean(record.closed),
    supplierCode: String(record.supplierCode ?? order.supplierCode),
    supplierName: String(record.supplierName ?? order.supplierName),
    etaLabel: String(record.etaLabel ?? etaLabel(etaDays)),
    etaDays,
    status,
    risk,
    value,
    progress,
    containerCount: Number.isFinite(Number(record.containerCount)) ? Number(record.containerCount) : 0,
    issue: String(record.issue ?? shipmentIssueFromOrder(order, status, etaDays)),
    priority: Number.isFinite(Number(record.priority)) ? Number(record.priority) : shipmentPriorityFromOrder(order, status, risk, etaDays, value),
    orderedQuantity: Number.isFinite(Number(record.orderedQuantity)) ? Number(record.orderedQuantity) : undefined,
    receivedQuantity: Number.isFinite(Number(record.receivedQuantity)) ? Number(record.receivedQuantity) : undefined,
    invoicedQuantity: Number.isFinite(Number(record.invoicedQuantity)) ? Number(record.invoicedQuantity) : undefined,
    openQuantity: Number.isFinite(Number(record.openQuantity)) ? Number(record.openQuantity) : undefined,
    grnCount: Number.isFinite(Number(record.grnCount)) ? Number(record.grnCount) : undefined,
    lastGrnDate: record.lastGrnDate,
    shipmentCharges: Number.isFinite(Number(record.shipmentCharges)) ? Number(record.shipmentCharges) : undefined,
    shipmentChargeCount: Number.isFinite(Number(record.shipmentChargeCount)) ? Number(record.shipmentChargeCount) : undefined,
    orderCount: Number.isFinite(Number(record.orderCount)) ? Number(record.orderCount) : undefined,
    lineCount: Number.isFinite(Number(record.lineCount)) ? Number(record.lineCount) : undefined,
    timeline: Array.isArray(record.timeline) && record.timeline.length > 0 ? record.timeline : shipmentTimelineFromOrder(order, status, record.issue),
    source: record.source ?? 'purchase_order_receiving',
  };
}

function deriveShipmentRecords(orders: PurchaseOrder[]) {
  return orders
    .filter((order) => !['Draft', 'Pending Review', 'Reviewed', 'Rejected', 'Cancelled', 'Completed'].includes(order.status))
    .map((order) => normalizeShipmentRecord({
      id: `PO-${order.orderNumber}`,
      order,
      status: shipmentStatusFromOrder(order),
      risk: shipmentRiskFromOrder(order, shipmentStatusFromOrder(order), daysUntil(order.deliveryDate)),
      source: 'purchase_order_fallback',
    }))
    .filter((shipment): shipment is ShipmentRecord => shipment !== null)
    .sort((a, b) => b.priority - a.priority);
}

function shipmentStatusFromOrder(order: PurchaseOrder): ShipmentStatus {
  const receivedQuantity = order.lines.reduce((sum, line) => sum + line.quantityReceived, 0);
  const invoicedQuantity = order.lines.reduce((sum, line) => sum + line.quantityInvoiced, 0);
  const openQuantity = order.lines.reduce((sum, line) => sum + Math.max(0, line.quantityOrdered - line.quantityReceived), 0);
  const etaDays = daysUntil(order.deliveryDate);
  const logisticsText = `${order.comments} ${order.deliveryBy} ${order.events.map((event) => event.label).join(' ')}`.toLowerCase();

  if (logisticsText.includes('customs') || logisticsText.includes('clearance') || logisticsText.includes('port hold')) return 'Customs Hold';
  if (receivedQuantity > 0 && openQuantity > 0) return 'Partial Receipt';
  if (receivedQuantity > 0 && receivedQuantity > invoicedQuantity) return 'Invoice Match';
  if (order.status === 'Printed') return etaDays <= 0 ? 'Warehouse Receiving' : 'In Transit';
  if (order.status === 'Part Received') return 'Partial Receipt';
  if (order.status === 'Received') return 'Invoice Match';
  return 'Ordered';
}

function shipmentRiskFromOrder(order: PurchaseOrder, status: ShipmentStatus, etaDays: number): ShipmentRisk {
  if (status === 'Closed') return 'Low';
  const openQuantity = order.lines.reduce((sum, line) => sum + Math.max(0, line.quantityOrdered - line.quantityReceived), 0);
  const value = orderTotal(order);
  if (status === 'Customs Hold' || (etaDays < -1 && openQuantity > 0) || (value >= 70000000 && openQuantity > 0)) return 'High';
  if (etaDays < 0 || status === 'Partial Receipt' || status === 'Invoice Match') return 'Medium';
  return 'Low';
}

function shipmentIssueFromOrder(order: PurchaseOrder, status: ShipmentStatus, etaDays: number) {
  if (status === 'Closed') return 'Shipment workflow is closed';
  if (status === 'Customs Hold') return 'Customs or clearance note found on purchase order';
  if (etaDays < 0) return `Delivery date missed by ${Math.abs(etaDays)} day${Math.abs(etaDays) === 1 ? '' : 's'}`;
  if (status === 'Partial Receipt') return 'Open balance remains after receiving';
  if (status === 'Invoice Match') return 'Received quantity awaiting invoice match';
  if (status === 'Warehouse Receiving') return 'Goods due for warehouse receiving and GRN';
  if (status === 'In Transit') return 'Supplier delivery is in transit';
  return 'Supplier order released, awaiting receiving activity';
}

function shipmentProgressFromStatus(status: ShipmentStatus) {
  if (status === 'Ordered') return 18;
  if (status === 'In Transit') return 42;
  if (status === 'Customs Hold') return 54;
  if (status === 'Warehouse Receiving') return 72;
  if (status === 'Partial Receipt') return 82;
  if (status === 'Awaiting GRN') return 88;
  if (status === 'Closed') return 100;
  return 96;
}

function shipmentPriorityFromOrder(order: PurchaseOrder, status: ShipmentStatus, risk: ShipmentRisk, etaDays: number, value: number) {
  const openQuantity = order.lines.reduce((sum, line) => sum + Math.max(0, line.quantityOrdered - line.quantityReceived), 0);
  let score = risk === 'High' ? 100 : risk === 'Medium' ? 55 : 15;
  score += Math.max(0, 7 - etaDays);
  score += Math.min(30, Math.ceil(value / 10000000));
  if (status === 'Customs Hold') score += 30;
  if (status === 'Warehouse Receiving') score += 20;
  if (status === 'Partial Receipt') score += 15;
  if (openQuantity <= 0) score -= 25;
  if (status === 'Closed') score -= 70;
  return Math.max(0, score);
}

function shipmentTimelineFromOrder(order: PurchaseOrder, status: ShipmentStatus, issue?: string): ShipmentTimelineEvent[] {
  const events: ShipmentTimelineEvent[] = [
    {
      time: order.orderDate,
      label: 'Purchase order created',
      detail: `PO ${order.orderNumber} opened for ${order.supplierName}.`,
      tone: 'neutral',
    },
    {
      time: order.deliveryDate,
      label: 'Required delivery date',
      detail: issue ?? shipmentIssueFromOrder(order, status, daysUntil(order.deliveryDate)),
      tone: status === 'Customs Hold' || status === 'Partial Receipt' ? 'warning' : 'neutral',
    },
  ];

  order.events.forEach((event) => {
    if (!event.label || event.label === 'Purchase order created') return;
    events.push({
      time: event.at,
      label: event.label,
      detail: `Recorded by ${event.by || 'System'}.`,
      tone: event.label.toLowerCase().includes('reject') ? 'critical' : 'neutral',
    });
  });

  return events.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8);
}

function etaLabel(etaDays: number) {
  if (etaDays < 0) return `${Math.abs(etaDays)}d late`;
  if (etaDays === 0) return 'Today';
  if (etaDays === 1) return 'Tomorrow';
  return `${etaDays}d`;
}

function SelectSupplierPanel({
  suppliers: supplierOptions,
  orders,
  apiShipments,
  shipmentsReady,
  selectedSupplierCode,
  loading,
  shipmentLoadError,
  onSelect,
  onNewPurchaseOrder,
  onViewPurchaseOrders,
  onNavigate,
}: {
  suppliers: SupplierLookup[];
  orders: PurchaseOrder[];
  apiShipments: ShipmentRecord[];
  shipmentsReady: boolean;
  selectedSupplierCode: string;
  loading: boolean;
  shipmentLoadError: string;
  onSelect: (supplierCode: string) => void;
  onNewPurchaseOrder: (supplierCode: string) => void;
  onViewPurchaseOrders: (supplier: SupplierLookup, status?: string) => void;
  onNavigate: (path: string) => void;
}) {
  const [supplierSearch, setSupplierSearch] = useState('');
  const [shipmentFilter, setShipmentFilter] = useState('All');
  const [workspaceTab, setWorkspaceTab] = useState<OperationalWorkspaceTab>('Overview');
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [queueDensity, setQueueDensity] = useState<QueueDensity>('Compact');
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [advancedInsightsOpen, setAdvancedInsightsOpen] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    const selectedShipment = params.get('SelectedShipment') || params.get('ShiptRef') || params.get('Shipment');
    const shipmentRef = selectedShipment ? selectedShipment.replace(/^SHP-/i, '') : '';
    const numericRef = Number(shipmentRef);
    return shipmentRef ? `SHP-${Number.isFinite(numericRef) ? numericRef : shipmentRef}` : '';
  });
  const selectedSupplier = supplierOptions.find((supplier) => supplier.value === selectedSupplierCode) ?? null;
  const supplierNeedle = supplierSearch.trim().toLowerCase();
  const filteredSuppliers = supplierNeedle
    ? supplierOptions.filter((supplier) =>
        `${supplier.value} ${supplier.label} ${supplier.address ?? ''}`.toLowerCase().includes(supplierNeedle)
      )
    : supplierOptions;

  const derivedShipments = useMemo(() => deriveShipmentRecords(orders), [orders]);
  const shipments = shipmentsReady ? apiShipments : derivedShipments;
  const legacyShipmentCount = shipments.filter((shipment) => shipment.source === 'legacy_shipment').length;
  const activeShipmentCount = shipments.filter((shipment) => shipment.status !== 'Closed').length;
  const shipmentSourceLabel = shipmentsReady
    ? legacyShipmentCount > 0
      ? 'Live ERP shipment register and receiving data'
      : 'Live ERP receiving data'
    : 'PO fallback data';

  const scopedShipments = selectedSupplier ? shipments.filter((shipment) => shipment.supplierCode === selectedSupplier.value) : shipments;
  const visibleShipments = scopedShipments.filter((shipment) => {
    if (shipmentFilter === 'All') return true;
    if (shipmentFilter === 'Today') return shipment.etaDays <= 0;
    if (shipmentFilter === 'Delayed') return shipment.etaDays < 0 || shipment.status === 'Customs Hold';
    if (shipmentFilter === 'Awaiting GRN') return ['Warehouse Receiving', 'Awaiting GRN'].includes(shipment.status);
    if (shipmentFilter === 'Partial') return shipment.status === 'Partial Receipt';
    if (shipmentFilter === 'Customs') return shipment.status === 'Customs Hold';
    if (shipmentFilter === 'Closed') return shipment.status === 'Closed';
    return true;
  });
  const selectedShipment = (
    selectedShipmentId
      ? visibleShipments.find((shipment) => shipment.id === selectedShipmentId)
        ?? scopedShipments.find((shipment) => shipment.id === selectedShipmentId)
      : null
  ) ?? null;
  const priorityShipment = selectedShipment ?? visibleShipments[0] ?? scopedShipments[0] ?? shipments[0] ?? null;
  const activeSupplier = selectedSupplier ?? supplierOptions.find((supplier) => supplier.value === priorityShipment?.supplierCode) ?? null;
  const activeSupplierParam = encodeURIComponent(activeSupplier?.value ?? '');
  const exposure = shipments.reduce((sum, shipment) => sum + shipment.value, 0);
  const awaitingGrnCount = shipments.filter((shipment) => ['Warehouse Receiving', 'Awaiting GRN'].includes(shipment.status)).length;
  const delayedCount = shipments.filter((shipment) => shipment.etaDays < 0 || shipment.status === 'Customs Hold').length;
  const partialCount = shipments.filter((shipment) => shipment.status === 'Partial Receipt').length;
  const customsCount = shipments.filter((shipment) => shipment.status === 'Customs Hold').length;
  const highRiskCount = shipments.filter((shipment) => shipment.risk === 'High').length;
  const containerCount = shipments.reduce((sum, shipment) => sum + shipment.containerCount, 0);
  const filterOptions = ['All', 'Today', 'Delayed', 'Awaiting GRN', 'Partial', 'Customs', 'Closed'];
  const filterPresets = [
    { label: 'Delayed only', value: 'Delayed', count: delayedCount },
    { label: 'Customs hold', value: 'Customs', count: customsCount },
    { label: 'Awaiting GRN', value: 'Awaiting GRN', count: awaitingGrnCount },
    { label: "Today's receiving", value: 'Today', count: shipments.filter((shipment) => shipment.etaDays <= 0).length },
  ];
  const compactQueue = queueDensity === 'Compact';
  const queueCellClass = compactQueue ? 'px-3 py-1.5' : 'px-3 py-2.5';
  const visibleTimelineEvents = priorityShipment?.timeline?.length ? priorityShipment.timeline : [];
  const priorityCarrierLabel = priorityShipment ? [priorityShipment.vessel, priorityShipment.voyageRef].filter(Boolean).join(' / ') : '';
  const priorityShipmentContext = priorityShipment?.source === 'legacy_shipment'
    ? `${priorityShipment.orderCount ?? 0} linked PO${(priorityShipment.orderCount ?? 0) === 1 ? '' : 's'}, ${priorityShipment.lineCount ?? 0} shipment line${(priorityShipment.lineCount ?? 0) === 1 ? '' : 's'}.`
    : `Linked to PO ${priorityShipment?.order.orderNumber ?? ''}.`;
  const prioritySupplierLookup = priorityShipment
    ? supplierOptions.find((supplier) => supplier.value === priorityShipment.supplierCode) ?? { value: priorityShipment.supplierCode, label: priorityShipment.supplierName }
    : null;
  const priorityShipmentRefParam = priorityShipment?.legacyShipmentRef ? encodeURIComponent(String(priorityShipment.legacyShipmentRef)) : '';
  const openPriorityShipment = () => {
    if (!priorityShipment || !prioritySupplierLookup) return;

    if (priorityShipment.legacyShipmentRef) {
      const supplierParam = encodeURIComponent(priorityShipment.supplierCode);
      onNavigate(`/purchases/transactions/shipt-select?SelectedShipment=${priorityShipmentRefParam}&SelectedSupplier=${supplierParam}`);
      return;
    }

    onViewPurchaseOrders(prioritySupplierLookup, 'outstanding');
  };
  const priorityActionLabel = priorityShipment?.status === 'Closed'
    ? 'Review shipment costing'
    : priorityShipment?.status === 'Warehouse Receiving' || priorityShipment?.status === 'Partial Receipt'
      ? 'Receive shipment'
      : 'Open priority shipment';

  const shipmentActions = [
    {
      label: priorityActionLabel,
      detail: priorityShipment ? `${priorityShipment.id} is next in queue.` : 'No shipment is ready to receive.',
      icon: PackageCheck,
      primary: true,
      disabled: !priorityShipment,
      onClick: openPriorityShipment,
    },
    {
      label: 'Create GRN',
      detail: 'Post goods received into warehouse stock.',
      icon: FileCheck2,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/transactions/po-selectospurchorder?SelectedSupplier=${activeSupplierParam}`),
    },
    {
      label: 'Record damages',
      detail: 'Log receiving discrepancy or damaged goods.',
      icon: AlertTriangle,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/transactions/suppliercredit?SupplierID=${activeSupplierParam}`),
    },
    {
      label: 'Match invoice',
      detail: 'Clear received shipment against supplier bill.',
      icon: ClipboardCheck,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/transactions/supplierinvoice?SupplierID=${activeSupplierParam}`),
    },
    {
      label: 'Reverse GRN',
      detail: 'Undo an incorrect receiving event.',
      icon: RefreshCw,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/transactions/reversegrn?SupplierID=${activeSupplierParam}`),
    },
  ];

  const monitoringActions = [
    {
      label: 'Track shipment',
      detail: 'Open shipment tracking and ETA details.',
      icon: Search,
      disabled: !activeSupplier && !priorityShipment,
      onClick: () => priorityShipment?.legacyShipmentRef
        ? onNavigate(`/purchases/transactions/shipt-select?SelectedShipment=${encodeURIComponent(String(priorityShipment.legacyShipmentRef))}&SelectedSupplier=${encodeURIComponent(priorityShipment.supplierCode)}`)
        : activeSupplier && onNavigate(`/purchases/transactions/shipt-select?SelectedSupplier=${activeSupplierParam}`),
    },
    {
      label: 'Shipment documents',
      detail: 'Review delivery notes, GRNs, and invoice evidence.',
      icon: FileText,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/inquiries-and-reports/suppliergrnandinvoiceinquiry?SelectedSupplier=${activeSupplierParam}`),
    },
    {
      label: 'Delivery exceptions',
      detail: 'Focus delayed, customs, and partial receipt issues.',
      icon: AlertTriangle,
      disabled: delayedCount === 0,
      onClick: () => setShipmentFilter('Delayed'),
    },
    {
      label: legacyShipmentCount > 0 ? 'Shipment register' : 'Container status',
      detail: legacyShipmentCount > 0
        ? `${legacyShipmentCount} registered shipment${legacyShipmentCount === 1 ? '' : 's'} from legacy ERP records.`
        : `${containerCount} container equivalent${containerCount === 1 ? '' : 's'} across inbound queue.`,
      icon: Truck,
      disabled: shipments.length === 0,
      onClick: () => setShipmentFilter('All'),
    },
  ];

  const supplierActions = [
    {
      label: 'Supplier account',
      detail: 'Balances, invoices, credits, and allocations.',
      icon: FileText,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/inquiries-and-reports/supplierinquiry?SupplierID=${activeSupplierParam}`),
    },
    {
      label: 'Create purchase order',
      detail: 'Start a new replenishment order.',
      icon: Plus,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNewPurchaseOrder(activeSupplier.value),
    },
    {
      label: 'Supplier contacts',
      detail: 'Escalate logistics or document issues.',
      icon: MessageSquare,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/maintenance/suppliercontacts?SupplierID=${activeSupplierParam}`),
    },
    {
      label: 'Supplier maintenance',
      detail: 'Update terms, address, and supplier controls.',
      icon: SlidersHorizontal,
      disabled: !activeSupplier,
      onClick: () => activeSupplier && onNavigate(`/purchases/maintenance/supplier-maintenance?SupplierID=${activeSupplierParam}`),
    },
  ];

  const aiInsights = [
    {
      label: 'Receiving priority',
      value: priorityShipment ? `${priorityShipment.id} - ${priorityShipment.status}` : 'No inbound priority',
      detail: priorityShipment ? `${priorityShipment.issue}. Risk ${priorityShipment.risk.toLowerCase()}, ETA ${priorityShipment.etaLabel}.` : 'No shipment is currently blocking operations.',
      tone: priorityShipment?.risk === 'High' ? 'critical' : priorityShipment?.risk === 'Medium' ? 'warning' : 'neutral',
    },
    {
      label: 'Delay prediction',
      value: delayedCount > 0 ? `${delayedCount} shipment${delayedCount === 1 ? '' : 's'} need escalation` : 'Low delay risk',
      detail: delayedCount > 0 ? 'Late ETA, customs hold, or missed warehouse receiving target detected.' : 'Current inbound queue is inside expected receiving tolerances.',
      tone: delayedCount > 0 ? 'warning' : 'neutral',
    },
    {
      label: 'Invoice mismatch probability',
      value: partialCount > 0 ? 'Elevated' : 'Controlled',
      detail: partialCount > 0 ? 'Partial receipts increase invoice variance risk during bill matching.' : 'No partial receipts are currently driving mismatch risk.',
      tone: partialCount > 0 ? 'warning' : 'neutral',
    },
  ];
  const topInsight = aiInsights[0];
  const workspaceTabs: OperationalWorkspaceTab[] = ['Overview', 'Workflow', 'Actions', 'Intelligence', 'Tracking'];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr_0.85fr]">
        <ShipmentKpiSection
          title="Critical risks"
          tone={delayedCount > 0 || customsCount > 0 || awaitingGrnCount > 0 ? 'critical' : 'neutral'}
          items={[
            ['Delayed', String(delayedCount)],
            ['Customs', String(customsCount)],
            ['Awaiting GRN', String(awaitingGrnCount)],
          ]}
        />
        <ShipmentKpiSection
          title="Operational throughput"
          tone="info"
          items={[
            ['Incoming', String(activeShipmentCount)],
            ['Registered', String(legacyShipmentCount)],
            ['Partial', String(partialCount)],
          ]}
        />
        <ShipmentKpiSection
          title="Financial exposure"
          tone={highRiskCount > 0 ? 'warning' : 'neutral'}
          items={[
            ['Exposure', money(exposure, 'TZS')],
            ['Supplier risk', String(highRiskCount)],
          ]}
        />
      </div>

      <div className={`grid gap-4 ${filtersCollapsed ? '2xl:grid-cols-[220px_minmax(0,1fr)_360px]' : '2xl:grid-cols-[300px_minmax(0,1fr)_360px]'}`}>
        <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-akiva-text">Operational filters</h2>
              <p className="mt-1 text-sm leading-5 text-akiva-text-muted">
                {filtersCollapsed ? `${shipmentFilter} · ${selectedSupplier?.label ?? 'All suppliers'}` : 'Supplier, ETA, GRN state, and exceptions.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiltersCollapsed((value) => !value)}
              aria-expanded={!filtersCollapsed}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-akiva-border bg-akiva-surface px-2.5 text-xs font-semibold text-akiva-text transition hover:bg-akiva-surface-muted"
            >
              {loading ? <RefreshCw className="h-4 w-4 animate-spin text-akiva-text-muted" /> : <Filter className="h-4 w-4 text-akiva-text-muted" />}
              {filtersCollapsed ? 'Show' : 'Compact'}
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            {filterPresets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setShipmentFilter(preset.value)}
                className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
                  shipmentFilter === preset.value
                    ? 'bg-akiva-accent-soft text-akiva-accent-text ring-1 ring-akiva-accent/60'
                    : 'bg-akiva-surface text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                }`}
              >
                <span>{preset.label}</span>
                <span className="font-mono">{preset.count}</span>
              </button>
            ))}
          </div>

          {!filtersCollapsed ? (
            <>
              <div className="relative mt-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                <input
                  value={supplierSearch}
                  onChange={(event) => setSupplierSearch(event.target.value)}
                  className={`${inputClass} pl-10`}
                  placeholder="Filter supplier"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {filterOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setShipmentFilter(option)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                      shipmentFilter === option
                        ? 'bg-akiva-accent text-white ring-akiva-accent'
                        : 'bg-akiva-surface text-akiva-text-muted ring-akiva-border hover:bg-akiva-surface-muted hover:text-akiva-text'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onSelect('')}
                className={`mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                  !selectedSupplier ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-accent-text' : 'border-akiva-border bg-akiva-surface text-akiva-text hover:bg-akiva-surface-muted'
                }`}
              >
                <span>All suppliers</span>
                <span className="text-xs">{shipments.length}</span>
              </button>

              <div className="mt-3 max-h-[500px] space-y-1.5 overflow-y-auto pr-1">
                <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3rem] gap-2 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-akiva-text-muted">
                  <span>Supplier</span>
                  <span className="text-center">Risk</span>
                  <span className="text-right">Open</span>
                </div>
                {filteredSuppliers.map((supplier) => {
                  const selected = supplier.value === selectedSupplier?.value;
                  const supplierShipments = shipments.filter((shipment) => shipment.supplierCode === supplier.value);
                  const supplierHighRisk = supplierShipments.filter((shipment) => shipment.risk === 'High').length;
                  const supplierMediumRisk = supplierShipments.filter((shipment) => shipment.risk === 'Medium').length;
                  const supplierRiskLabel = supplierHighRisk > 0 ? 'High' : supplierMediumRisk > 0 ? 'Med' : 'Low';
                  return (
                    <button
                      key={supplier.value}
                      type="button"
                      onClick={() => onSelect(supplier.value)}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_3.5rem_3rem] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                        selected
                          ? 'bg-akiva-accent-soft text-akiva-accent-text ring-1 ring-akiva-accent/70'
                          : 'text-akiva-text hover:bg-akiva-surface-muted'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-akiva-text">{supplier.label}</span>
                        <span className="block truncate font-mono text-[11px] text-akiva-text-muted">{supplier.value}</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ring-1 ${
                        supplierHighRisk > 0 ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900'
                          : supplierMediumRisk > 0 ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900'
                            : 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900'
                      }`}>
                        {supplierRiskLabel}
                      </span>
                      <span className="text-right text-xs font-semibold text-akiva-text-muted">{supplierShipments.length}</span>
                    </button>
                  );
                })}
                {filteredSuppliers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-akiva-border bg-akiva-surface px-3 py-8 text-center text-sm text-akiva-text-muted">
                    No supplier matches this filter.
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
          <div className="border-b border-akiva-border px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Inbound logistics queue</p>
                <h2 className="mt-1 text-lg font-semibold text-akiva-text">Shipment and receiving priorities</h2>
                <p className="mt-1 text-xs text-akiva-text-muted">
                  {shipmentSourceLabel}{shipmentLoadError ? ` · ${shipmentLoadError}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={openPriorityShipment}
                  disabled={!priorityShipment}
                >
                  <PackageCheck className="mr-2 h-4 w-4" />
                  {priorityShipment?.status === 'Closed' ? 'Review costing' : 'Receive priority'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setShipmentFilter('Delayed')}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Exceptions
                </Button>
                <div className="inline-flex rounded-lg border border-akiva-border bg-akiva-surface p-0.5 text-xs font-semibold">
                  {(['Compact', 'Comfortable'] as QueueDensity[]).map((density) => (
                    <button
                      key={density}
                      type="button"
                      onClick={() => setQueueDensity(density)}
                      className={`rounded-md px-2.5 py-1 transition ${
                        queueDensity === density ? 'bg-akiva-surface-raised text-akiva-text shadow-sm' : 'text-akiva-text-muted hover:text-akiva-text'
                      }`}
                    >
                      {density}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {visibleShipments.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <h3 className="mt-3 text-base font-semibold text-akiva-text">No shipments match these filters</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-akiva-text-muted">Clear supplier or exception filters to return to the active inbound queue.</p>
            </div>
          ) : (
            <div className="max-h-[680px] overflow-auto">
              <table className="w-full min-w-[980px] table-fixed">
                <thead className="sticky top-0 z-10 bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-table-header-text">
                  <tr>
                    <th className="w-32 px-3 py-2 text-left">Shipment</th>
                    <th className="w-24 px-3 py-2 text-left">ETA</th>
                    <th className="w-60 px-3 py-2 text-left">Supplier</th>
                    <th className="w-44 px-3 py-2 text-left">Status</th>
                    <th className="w-24 px-3 py-2 text-left">Risk</th>
                    <th className="w-36 px-3 py-2 text-right">Value</th>
                    <th className="w-32 px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleShipments.map((shipment) => {
                    const selected = shipment.id === priorityShipment?.id;
                    const carrierLabel = [shipment.vessel, shipment.voyageRef].filter(Boolean).join(' / ');
                    return (
                    <tr
                      key={shipment.id}
                      tabIndex={0}
                      onClick={() => setSelectedShipmentId(shipment.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedShipmentId(shipment.id);
                      }}
                      className={`cursor-pointer border-t border-akiva-border align-top outline-none transition focus-within:bg-akiva-accent-soft/50 focus:bg-akiva-accent-soft/50 ${
                        selected ? 'bg-akiva-accent-soft/45 ring-1 ring-inset ring-akiva-accent/40' : shipmentRowTone(shipment)
                      }`}
                    >
                      <td className={`${queueCellClass} border-l-4 ${shipmentSeverityBorder(shipment)}`}>
                        <p className="font-mono text-sm font-semibold text-akiva-text">{shipment.id}</p>
                        <p className="text-[11px] text-akiva-text-muted">
                          {shipment.source === 'legacy_shipment'
                            ? `${shipment.orderCount ?? 0} PO${(shipment.orderCount ?? 0) === 1 ? '' : 's'} · register`
                            : `PO ${shipment.order.orderNumber}`}
                        </p>
                      </td>
                      <td className={queueCellClass}>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${shipment.etaDays < 0 ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900' : shipment.etaDays <= 1 ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900' : 'bg-akiva-surface text-akiva-text-muted ring-akiva-border'}`}>
                          {shipment.etaLabel}
                        </span>
                      </td>
                      <td className={queueCellClass}>
                        <button type="button" onClick={() => onSelect(shipment.supplierCode)} className="max-w-full text-left">
                          <span className="block truncate text-sm font-semibold text-akiva-text hover:text-akiva-accent">{shipment.supplierName}</span>
                          <span className="block truncate font-mono text-[11px] text-akiva-text-muted">{shipment.supplierCode}</span>
                          {carrierLabel ? <span className="block truncate text-[11px] text-akiva-text-muted">{carrierLabel}</span> : null}
                          {!compactQueue ? <span className="block truncate text-[11px] text-akiva-text-muted">{shipment.issue}</span> : null}
                        </button>
                      </td>
                      <td className={queueCellClass}>
                        <ShipmentStatusBadge status={shipment.status} />
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-akiva-surface-muted">
                          <div className="h-full rounded-full bg-akiva-accent" style={{ width: `${shipment.progress}%` }} />
                        </div>
                      </td>
                      <td className={queueCellClass}><ShipmentRiskBadge risk={shipment.risk} /></td>
                      <td className={`${queueCellClass} text-right text-sm font-semibold text-akiva-text`}>{money(shipment.value, shipment.order.currency)}</td>
                      <td className={`${queueCellClass} text-right`}>
                        <Button
                          size="sm"
                          variant={shipment.status === 'Warehouse Receiving' || shipment.status === 'Partial Receipt' ? 'success' : shipment.risk === 'High' ? 'danger' : 'secondary'}
                          onClick={() => {
                            setSelectedShipmentId(shipment.id);
                            if (shipment.legacyShipmentRef) {
                              onNavigate(`/purchases/transactions/shipt-select?SelectedShipment=${encodeURIComponent(String(shipment.legacyShipmentRef))}&SelectedSupplier=${encodeURIComponent(shipment.supplierCode)}`);
                              return;
                            }

                            onViewPurchaseOrders(
                              supplierOptions.find((supplier) => supplier.value === shipment.supplierCode) ?? { value: shipment.supplierCode, label: shipment.supplierName },
                              'outstanding'
                            );
                          }}
                        >
                          {shipment.status === 'Closed' ? 'Costing' : shipment.status === 'Warehouse Receiving' || shipment.status === 'Partial Receipt' ? 'Receive' : shipment.risk === 'High' ? 'Escalate' : 'Track'}
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="self-start rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm 2xl:sticky 2xl:top-4">
          <div className="sticky top-4 z-20 -mx-4 -mt-4 border-b border-akiva-border bg-akiva-surface-raised/95 px-4 pb-3 pt-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-akiva-text">Operational workspace</h2>
                <p className="mt-1 truncate text-sm text-akiva-text-muted">
                  {priorityShipment ? `${priorityShipment.id} · ${priorityShipment.supplierName}` : 'No priority shipment'}
                </p>
              </div>
              {priorityShipment ? <ShipmentRiskBadge risk={priorityShipment.risk} /> : null}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-akiva-surface px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-akiva-text">{priorityShipment ? shipmentStageLabel(priorityShipment.status) : 'Queue clear'}</p>
                <p className="mt-0.5 truncate text-[11px] text-akiva-text-muted">
                  {priorityShipment ? `${priorityShipment.etaLabel} · ${priorityShipment.issue}` : 'No receiving action required'}
                </p>
              </div>
              <Button
                variant={workspaceTab === 'Actions' ? 'secondary' : 'primary'}
                size="sm"
                onClick={openPriorityShipment}
                disabled={!priorityShipment}
              >
                {priorityShipment?.status === 'Closed' ? 'Costing' : priorityShipment?.status === 'Warehouse Receiving' || priorityShipment?.status === 'Partial Receipt' ? 'Receive' : 'Open'}
              </Button>
            </div>
          </div>

          <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-akiva-border bg-akiva-surface p-1 text-xs font-semibold shadow-inner">
            {workspaceTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setWorkspaceTab(tab)}
                className={`min-w-fit flex-1 rounded-lg border px-2.5 py-2 transition ${
                  workspaceTab === tab ? 'border-akiva-accent/60 bg-akiva-accent-soft text-akiva-accent-text shadow-sm' : 'border-transparent text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {workspaceTab === 'Overview' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-akiva-text">
                    {priorityShipment ? `${priorityShipment.status}: ${priorityShipment.issue}` : 'Inbound queue is clear'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-akiva-text-muted">
                    {priorityShipment
                      ? `ETA ${priorityShipment.etaLabel}. ${priorityCarrierLabel ? `${priorityCarrierLabel}. ` : ''}${priorityShipmentContext}`
                      : 'No open shipment currently requires warehouse intervention.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InfoTile label="ETA" value={priorityShipment?.etaLabel ?? 'Clear'} />
                  <InfoTile label="Value" value={priorityShipment ? money(priorityShipment.value, priorityShipment.order.currency) : money(0, 'TZS')} />
                  <InfoTile label="Carrier" value={priorityCarrierLabel || 'Not recorded'} />
                  <InfoTile label="Charges" value={priorityShipment ? money(priorityShipment.shipmentCharges ?? 0, priorityShipment.order.currency) : money(0, 'TZS')} />
                </div>
                <OperationalInsight {...topInsight} />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={openPriorityShipment}
                  disabled={!priorityShipment}
                >
                  <PackageCheck className="mr-2 h-4 w-4" />
                  {priorityActionLabel}
                </Button>
              </div>
            ) : null}

            {workspaceTab === 'Workflow' ? (
              <div className="space-y-4">
                {priorityShipment ? <ShipmentLifecycle status={priorityShipment.status} /> : (
                  <p className="text-sm text-akiva-text-muted">No shipment selected for workflow tracking.</p>
                )}
                {priorityShipment ? (
                  <div className="rounded-xl bg-akiva-surface px-3 py-3 text-sm text-akiva-text-muted">
                    Current blocker: <span className="font-semibold text-akiva-text">{priorityShipment.issue}</span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {workspaceTab === 'Actions' ? (
              <div className="space-y-3">
                <PrimaryOperationalAction action={shipmentActions[0]} />
                <p className="text-xs font-semibold text-akiva-text-muted">Secondary workflow actions</p>
                <div className="grid gap-2">
                  {shipmentActions.slice(1).map((action) => <CompactOperationalAction key={action.label} action={action} />)}
                </div>
              </div>
            ) : null}

            {workspaceTab === 'Intelligence' ? (
              <div className="space-y-3">
                <OperationalInsight {...topInsight} />
                <button
                  type="button"
                  onClick={() => setAdvancedInsightsOpen((value) => !value)}
                  className="flex w-full items-center justify-between rounded-lg bg-akiva-surface px-3 py-2 text-left text-xs font-semibold text-akiva-text transition hover:bg-akiva-surface-muted"
                >
                  <span>{advancedInsightsOpen ? 'Hide diagnostics' : 'View AI diagnostics'}</span>
                  <span className="text-akiva-text-muted">{aiInsights.length - 1}</span>
                </button>
                {advancedInsightsOpen ? (
                  <div className="space-y-2">
                    {aiInsights.slice(1).map((insight) => <OperationalInsight key={insight.label} {...insight} />)}
                    <div className="rounded-lg bg-akiva-surface px-3 py-2.5">
                      <p className="text-xs font-semibold text-akiva-text-muted">Resolution value</p>
                      <p className="mt-0.5 text-sm font-semibold text-akiva-text">{priorityShipment ? money(priorityShipment.value, priorityShipment.order.currency) : money(0, 'TZS')}</p>
                      <p className="mt-0.5 text-xs leading-5 text-akiva-text-muted">Estimated financial exposure protected by resolving the selected shipment first.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {workspaceTab === 'Tracking' ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-akiva-surface px-3 py-3">
                  <p className="text-sm font-semibold text-akiva-text">{priorityShipment?.etaLabel ?? 'No ETA risk'}</p>
                  <p className="mt-1 text-xs leading-5 text-akiva-text-muted">
                    {priorityShipment
                      ? `${priorityShipment.status}. ${priorityCarrierLabel ? `${priorityCarrierLabel}. ` : ''}${priorityShipment.issue}. Charges ${money(priorityShipment.shipmentCharges ?? 0, priorityShipment.order.currency)}. Progress ${priorityShipment.progress}%.`
                      : 'No shipment is currently active in the tracking workspace.'}
                  </p>
                </div>
                <ShipmentTimeline
                  events={visibleTimelineEvents}
                  expanded={timelineExpanded}
                  onToggle={() => setTimelineExpanded((value) => !value)}
                />
                <div className="grid gap-2">
                  {monitoringActions.map((action) => <CompactOperationalAction key={action.label} action={action} />)}
                </div>
                <div className="border-t border-akiva-border pt-3">
                  <p className="mb-2 text-sm font-semibold text-akiva-text">Supplier operations</p>
                  <div className="grid gap-2">
                    {supplierActions.map((action) => <CompactOperationalAction key={action.label} action={action} />)}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ShipmentKpiSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: Array<[string, string]>;
  tone: 'neutral' | 'info' | 'warning' | 'critical';
}) {
  const toneClass =
    tone === 'critical' ? 'border-rose-200/80 bg-rose-50/50 dark:border-rose-900/60 dark:bg-rose-950/20'
      : tone === 'warning' ? 'border-amber-200/80 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
        : tone === 'info' ? 'border-sky-200/80 bg-sky-50/50 dark:border-sky-900/60 dark:bg-sky-950/20'
          : 'border-akiva-border bg-akiva-surface-raised';
  return (
    <section className={`rounded-xl border px-3 py-2.5 shadow-sm ${toneClass}`}>
      <p className="text-sm font-semibold text-akiva-text">{title}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="truncate text-xs text-akiva-text-muted">{label}</p>
            <p className="mt-0.5 truncate text-base font-semibold text-akiva-text">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  const tone =
    status === 'Customs Hold' ? 'border-rose-300 bg-rose-50 text-rose-800 shadow-sm shadow-rose-900/5 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100'
      : status === 'Warehouse Receiving' || status === 'Awaiting GRN' ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100'
        : status === 'Partial Receipt' ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-100'
          : status === 'Invoice Match' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100'
            : status === 'Closed' ? 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200'
              : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-100';
  const dotTone =
    status === 'Customs Hold' ? 'bg-rose-600'
      : status === 'Warehouse Receiving' || status === 'Awaiting GRN' ? 'bg-amber-600'
        : status === 'Partial Receipt' ? 'bg-violet-600'
          : status === 'Invoice Match' ? 'bg-emerald-600'
            : status === 'Closed' ? 'bg-slate-500'
              : 'bg-sky-600';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotTone}`} />
      {status}
    </span>
  );
}

function ShipmentRiskBadge({ risk }: { risk: ShipmentRisk }) {
  const tone =
    risk === 'High' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100'
      : risk === 'Medium' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100';
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{risk}</span>;
}

function shipmentStageLabel(status: ShipmentStatus) {
  if (status === 'Closed') return 'Shipment closed';
  if (status === 'Customs Hold') return 'Blocked at customs';
  if (status === 'Warehouse Receiving') return 'Ready for receiving';
  if (status === 'Awaiting GRN') return 'GRN required';
  if (status === 'Partial Receipt') return 'Partial receipt open';
  if (status === 'Invoice Match') return 'Invoice match stage';
  if (status === 'In Transit') return 'In transit';
  return 'Ordered';
}

function shipmentSeverityBorder(shipment: ShipmentRecord) {
  if (shipment.status === 'Customs Hold' || shipment.risk === 'High' || shipment.etaDays < 0) return 'border-l-rose-500';
  if (shipment.status === 'Warehouse Receiving' || shipment.status === 'Awaiting GRN' || shipment.status === 'Partial Receipt') return 'border-l-amber-500';
  if (shipment.status === 'Invoice Match') return 'border-l-emerald-500';
  if (shipment.status === 'Closed') return 'border-l-slate-400';
  return 'border-l-transparent';
}

function shipmentRowTone(shipment: ShipmentRecord) {
  if (shipment.status === 'Customs Hold' || shipment.risk === 'High' || shipment.etaDays < 0) return 'bg-rose-50/30 dark:bg-rose-950/10';
  if (shipment.status === 'Warehouse Receiving' || shipment.status === 'Awaiting GRN') return 'bg-amber-50/25 dark:bg-amber-950/10';
  if (shipment.status === 'Partial Receipt') return 'bg-violet-50/20 dark:bg-violet-950/10';
  if (shipment.status === 'Closed') return 'bg-slate-50/30 text-akiva-text-muted dark:bg-slate-900/15';
  return 'hover:bg-akiva-surface-muted/70';
}

function ShipmentLifecycle({ status }: { status: ShipmentStatus }) {
  const steps = [
    { label: 'Ordered', detail: 'PO released' },
    { label: 'Transit', detail: 'Supplier shipped' },
    { label: 'Customs', detail: 'Clearance' },
    { label: 'Warehouse', detail: 'Dock receiving' },
    { label: 'GRN', detail: 'Receipt posted' },
    { label: 'Invoice', detail: 'Bill match' },
    { label: 'Closed', detail: 'Complete' },
  ];
  const activeIndex =
    status === 'Ordered' ? 0
      : status === 'In Transit' ? 1
        : status === 'Customs Hold' ? 2
              : status === 'Warehouse Receiving' ? 3
                : status === 'Awaiting GRN' || status === 'Partial Receipt' ? 4
                  : status === 'Invoice Match' ? 5
                    : status === 'Closed' ? 6
                      : 0;

  return (
    <div className="rounded-xl bg-akiva-surface px-3 py-3">
      <div className="flex items-start">
        {steps.map((step, index) => {
          const complete = index < activeIndex;
          const current = index === activeIndex;
          return (
            <div key={step.label} className="flex min-w-0 flex-1 items-start">
              <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                    complete || current
                      ? 'border-akiva-accent bg-akiva-accent text-white'
                      : 'border-akiva-border bg-akiva-surface-raised text-akiva-text-muted'
                  }`}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className={`mt-1.5 max-w-full truncate text-[11px] font-semibold ${current ? 'text-akiva-text' : 'text-akiva-text-muted'}`}>{step.label}</span>
                <span className="mt-0.5 hidden text-[10px] leading-4 text-akiva-text-muted min-[1500px]:block">{step.detail}</span>
              </div>
              {index < steps.length - 1 ? (
                <span className={`mt-3 h-px min-w-3 flex-1 ${index < activeIndex ? 'bg-akiva-accent' : 'bg-akiva-border'}`} />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-akiva-text-muted">
        Current stage: <span className="font-semibold text-akiva-text">{steps[activeIndex]?.label}</span>. Use the Actions tab only for the next operational step.
      </p>
    </div>
  );
}

function ShipmentTimeline({
  events,
  expanded,
  onToggle,
}: {
  events: ShipmentTimelineEvent[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const shownEvents = expanded ? events : events.slice(0, 3);
  const dotClass = (tone: ShipmentTimelineEvent['tone']) =>
    tone === 'critical' ? 'bg-rose-600'
      : tone === 'warning' ? 'bg-amber-600'
        : tone === 'success' ? 'bg-emerald-600'
          : 'bg-akiva-accent';

  if (events.length === 0) {
    return (
      <div className="rounded-xl bg-akiva-surface px-3 py-3 text-sm text-akiva-text-muted">
        No shipment timeline is available.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-akiva-surface px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-akiva-text-muted" />
          <p className="text-sm font-semibold text-akiva-text">Operational timeline</p>
        </div>
        {events.length > 3 ? (
          <button type="button" onClick={onToggle} className="text-xs font-semibold text-akiva-accent hover:text-akiva-accent-strong">
            {expanded ? 'Less' : 'Full trail'}
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-3">
        {shownEvents.map((event) => (
          <div key={`${event.time}-${event.label}`} className="grid grid-cols-[3.25rem_1fr] gap-2">
            <span className="font-mono text-[11px] text-akiva-text-muted">{event.time}</span>
            <div className="relative border-l border-akiva-border pl-3">
              <span className={`absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-akiva-surface ${dotClass(event.tone)}`} />
              <p className="text-xs font-semibold text-akiva-text">{event.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-akiva-text-muted">{event.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrimaryOperationalAction({ action }: { action: ShipmentWorkspaceAction }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className="group flex w-full items-center gap-3 rounded-xl bg-akiva-accent px-3 py-3 text-left text-white shadow-sm transition hover:bg-akiva-accent-strong disabled:cursor-not-allowed disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted disabled:shadow-none"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white group-disabled:bg-akiva-surface group-disabled:text-akiva-text-muted">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{action.label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-white/80 group-disabled:text-akiva-text-muted">{action.detail}</span>
      </span>
    </button>
  );
}

function CompactOperationalAction({ action }: { action: ShipmentWorkspaceAction }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-akiva-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-akiva-surface text-akiva-text-muted group-hover:text-akiva-text">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-akiva-text">{action.label}</span>
        <span className="block truncate text-xs text-akiva-text-muted">{action.detail}</span>
      </span>
    </button>
  );
}

function OperationalInsight({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'neutral' | 'warning' | 'critical' }) {
  const iconTone = tone === 'critical' ? 'text-rose-600' : tone === 'warning' ? 'text-amber-600' : 'text-akiva-accent';
  return (
    <div className="rounded-lg bg-akiva-surface px-3 py-2.5">
      <div className="flex items-start gap-2">
        <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-akiva-text-muted">{label}</p>
          <p className="mt-0.5 text-sm font-semibold text-akiva-text">{value}</p>
          <p className="mt-0.5 text-xs leading-5 text-akiva-text-muted">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function OffersReceivedPanel({
  tenders,
  selectedTender,
  selectedTenderId,
  tenderOptions,
  selectedOffers,
  decisions,
  summary,
  message,
  onTenderChange,
  onDecisionChange,
  onAcceptRecommended,
  onAddVendorResponse,
  onProcess,
}: {
  tenders: Tender[];
  selectedTender: Tender | null;
  selectedTenderId: string;
  tenderOptions: LookupOption[];
  selectedOffers: SupplierOffer[];
  decisions: Record<string, OfferDecision>;
  summary: {
    lineCount: number;
    totalValue: number;
    acceptedCount: number;
    rejectedCount: number;
    expiringSoon: number;
    supplierCount: number;
    currency: PurchaseOrder['currency'];
  };
  message: string;
  onTenderChange: (value: string) => void;
  onDecisionChange: (offerId: string, decision: OfferDecision) => void;
  onAcceptRecommended: (offerIds: string[]) => void;
  onAddVendorResponse: (draft: VendorResponseDraftState) => void;
  onProcess: () => void;
}) {
  const [activeStep, setActiveStep] = useState<TenderProcessStep>('dossier');
  const [vendorResponseOpen, setVendorResponseOpen] = useState(false);
  const [vendorResponseDraft, setVendorResponseDraft] = useState<VendorResponseDraftState>(() => createVendorResponseDraft());
  const [vendorResponseError, setVendorResponseError] = useState('');

  useEffect(() => {
    setActiveStep('dossier');
    setVendorResponseOpen(false);
    setVendorResponseError('');
  }, [selectedTenderId]);

  if (tenders.length === 0) {
    return (
      <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold text-akiva-text">No active tender offers</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-akiva-text-muted">
          Awarded, rejected, and closed tender lines have been cleared from the evaluation queue.
        </p>
      </section>
    );
  }

  if (!selectedTender) {
    return (
      <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
        <h2 className="mt-3 text-lg font-semibold text-akiva-text">Select a tender dossier</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-akiva-text-muted">
          Tender evaluation needs a selected tender before supplier offers can be compared or awarded.
        </p>
      </section>
    );
  }

  const evaluatedOffers = selectedOffers.map((offer) => {
    const lineOffers = selectedOffers.filter((candidate) => candidate.lineId === offer.lineId);
    const ranked = [...lineOffers].sort((a, b) => weightedOfferScore(b, selectedTender, lineOffers).score - weightedOfferScore(a, selectedTender, lineOffers).score);
    const rank = ranked.findIndex((candidate) => candidate.id === offer.id) + 1;
    return {
      offer,
      tenderLine: selectedTender.lines.find((line) => line.id === offer.lineId),
      evaluation: evaluationForOffer(offer, selectedTender, lineOffers, rank),
    };
  }).sort((a, b) => a.offer.lineId.localeCompare(b.offer.lineId) || a.evaluation.rank - b.evaluation.rank);
  const recommendedAwards = selectedTender.lines
    .map((line) =>
      evaluatedOffers
        .filter((entry) => entry.offer.lineId === line.id && entry.offer.complianceStatus !== 'Non-compliant')
        .sort((a, b) => b.evaluation.score - a.evaluation.score)[0]
    )
    .filter(Boolean) as typeof evaluatedOffers;
  const recommendedOfferIds = recommendedAwards.map((entry) => entry.offer.id);
  const recommendedAwardValue = recommendedAwards.reduce((sum, entry) => sum + offerTotal(entry.offer), 0);
  const recommendedConfidence = recommendedAwards.length > 0
    ? Math.round(recommendedAwards.reduce((sum, entry) => sum + entry.evaluation.score, 0) / recommendedAwards.length)
    : 0;
  const acceptedValue = selectedOffers
    .filter((offer) => (decisions[offer.id] ?? 'defer') === 'accept')
    .reduce((sum, offer) => sum + offerTotal(offer), 0);
  const respondedSuppliers = selectedTender.suppliers.filter((supplier) => supplier.status === 'Responded').length;
  const responseCoverage = selectedTender.suppliers.length > 0 ? Math.round((respondedSuppliers / selectedTender.suppliers.length) * 100) : 0;
  const clarificationCount = selectedOffers.filter((offer) => offer.complianceStatus === 'Clarification').length;
  const nonCompliantCount = selectedOffers.filter((offer) => offer.complianceStatus === 'Non-compliant').length;
  const criticalExpiryCount = selectedOffers.filter((offer) => daysUntil(offer.expiryDate) <= 3).length;
  const tenderRiskLevel: TenderRiskLevel =
    nonCompliantCount > 0 || criticalExpiryCount > 0 || responseCoverage < 67
      ? 'High'
      : clarificationCount > 0 || responseCoverage < 100
        ? 'Moderate'
        : 'Low';
  const savingsVsEstimate = selectedTender.estimatedValue - recommendedAwardValue;
  const weighted = selectedTender.evaluationWeights;
  const acceptedOffers = selectedOffers.filter((offer) => (decisions[offer.id] ?? 'defer') === 'accept');
  const acceptedGroups = Object.values(
    acceptedOffers.reduce<Record<string, { supplierCode: string; supplierName: string; total: number; lines: number }>>((groups, offer) => {
      const current = groups[offer.supplierCode] ?? {
        supplierCode: offer.supplierCode,
        supplierName: offer.supplierName,
        total: 0,
        lines: 0,
      };
      groups[offer.supplierCode] = {
        ...current,
        total: current.total + offerTotal(offer),
        lines: current.lines + 1,
      };
      return groups;
    }, {})
  );
  const offersBySupplier = selectedTender.suppliers.map((supplier) => {
    const supplierOffers = selectedOffers.filter((offer) => offer.supplierCode === supplier.supplierCode);
    const supplierEvaluations = evaluatedOffers.filter((entry) => entry.offer.supplierCode === supplier.supplierCode);
    const bestScore = supplierEvaluations.length > 0 ? Math.max(...supplierEvaluations.map((entry) => entry.evaluation.score)) : 0;
    return {
      supplier,
      offerCount: supplierOffers.length,
      total: supplierOffers.reduce((sum, offer) => sum + offerTotal(offer), 0),
      clarificationCount: supplierOffers.filter((offer) => offer.complianceStatus === 'Clarification').length,
      bestScore,
    };
  });
  const processStepStats: Record<TenderProcessStep, string> = {
    dossier: selectedTender.status,
    responses: `${respondedSuppliers}/${selectedTender.suppliers.length} responded`,
    evaluation: `${recommendedConfidence}/100 confidence`,
    award: `${summary.acceptedCount} accepted`,
    conversion: acceptedOffers.length > 0 ? `${acceptedOffers.length} line${acceptedOffers.length === 1 ? '' : 's'} ready` : 'Awaiting award',
  };

  function openVendorResponseDialog(supplierCode?: string) {
    setVendorResponseDraft(createVendorResponseDraft(selectedTender, supplierCode));
    setVendorResponseError('');
    setVendorResponseOpen(true);
  }

  function submitVendorResponse() {
    const duplicate = selectedOffers.some((offer) => offer.supplierCode === vendorResponseDraft.supplierCode && offer.lineId === vendorResponseDraft.lineId);

    if (!vendorResponseDraft.supplierCode || !vendorResponseDraft.lineId) {
      setVendorResponseError('Select the supplier and tender line for this vendor application.');
      return;
    }

    if (duplicate) {
      setVendorResponseError('This supplier already has a response for the selected tender line.');
      return;
    }

    if (vendorResponseDraft.price <= 0 || vendorResponseDraft.leadTimeDays <= 0) {
      setVendorResponseError('Enter a valid unit price and lead time.');
      return;
    }

    if (
      vendorResponseDraft.technicalScore < 0 ||
      vendorResponseDraft.technicalScore > 100 ||
      vendorResponseDraft.supplierRating < 0 ||
      vendorResponseDraft.supplierRating > 100
    ) {
      setVendorResponseError('Technical score and supplier rating must be between 0 and 100.');
      return;
    }

    onAddVendorResponse(vendorResponseDraft);
    setVendorResponseOpen(false);
    setActiveStep('responses');
  }

  const offerComparisonTable = (showDecision: boolean) => (
    <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
      <div className="border-b border-akiva-border px-4 py-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-akiva-text">
              {showDecision ? 'Offer comparison and award decision' : 'Commercial and technical evaluation'}
            </h2>
            <p className="mt-1 text-sm text-akiva-text-muted">
              {showDecision
                ? 'Accept, reject, or defer supplier lines after reviewing score, compliance, delivery, and price variance.'
                : 'Score combines price, lead time, compliance, and supplier performance before the award decision is made.'}
            </p>
          </div>
          {showDecision ? (
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">Accept</span>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900">Reject</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">Defer</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[1180px] table-fixed">
          <thead className="sticky top-0 z-10 bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-text-muted">
            <tr>
              <th className="w-28 px-4 py-3 text-left">Offer ID</th>
              <th className="w-56 px-4 py-3 text-left">Supplier</th>
              <th className="w-64 px-4 py-3 text-left">Tender line</th>
              <th className="w-28 px-4 py-3 text-right">Quantity</th>
              <th className="w-32 px-4 py-3 text-right">Price</th>
              <th className="w-32 px-4 py-3 text-right">Total</th>
              <th className="w-32 px-4 py-3 text-left">Compliance</th>
              <th className="w-32 px-4 py-3 text-right">Score</th>
              <th className="w-32 px-4 py-3 text-left">Expires</th>
              {showDecision ? <th className="w-72 px-4 py-3 text-left">Decision</th> : null}
            </tr>
          </thead>
          <tbody>
            {evaluatedOffers.map(({ offer, tenderLine, evaluation }) => {
              const decision = decisions[offer.id] ?? 'defer';
              const days = daysUntil(offer.expiryDate);
              const lineOffers = selectedOffers.filter((candidate) => candidate.lineId === offer.lineId);
              const lowestLinePrice = Math.min(...lineOffers.map((candidate) => candidate.price));
              const priceVariance = offer.price - lowestLinePrice;
              const recommended = recommendedOfferIds.includes(offer.id);
              return (
                <tr
                  key={offer.id}
                  className={`border-t border-akiva-border align-top ${
                    decision === 'accept'
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                      : recommended
                        ? 'bg-akiva-accent-soft/30 dark:bg-akiva-accent-soft/10'
                        : ''
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-akiva-text">{offer.id}</td>
                  <td className="px-4 py-3">
                    <p className="truncate text-sm font-semibold text-akiva-text">{offer.supplierName}</p>
                    <p className="mt-1 truncate text-xs text-akiva-text-muted">{offer.paymentTerms} · lead {offer.leadTimeDays} days</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="truncate text-sm font-semibold text-akiva-text">{offer.description}</p>
                    <p className="mt-1 truncate text-xs text-akiva-text-muted">{offer.itemCode} · {tenderLine?.technicalRequirement ?? offer.category}</p>
                    <p className="mt-1 truncate text-xs text-akiva-text-muted">{offer.notes}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">{offer.quantity} {offer.units}</td>
                  <td className="px-4 py-3 text-right text-sm">
                    <span className="block">{money(offer.price, offer.currency)}</span>
                    <span className="mt-1 block text-xs text-akiva-text-muted">
                      {priceVariance === 0 ? 'Best price' : `+${money(priceVariance, offer.currency)}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold">{money(offerTotal(offer), offer.currency)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${complianceTone(offer.complianceStatus)}`}>
                      {offer.complianceStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className={`text-sm font-semibold ${scoreTone(evaluation.score)}`}>{evaluation.score}/100</p>
                    <p className="mt-1 text-xs text-akiva-text-muted">Rank {evaluation.rank} · {evaluation.recommendation}</p>
                    {recommended ? (
                      <span className="mt-1 inline-flex rounded-full bg-akiva-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                        Recommended
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                      days <= 3
                        ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-100 dark:ring-rose-900'
                        : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900'
                    }`}>
                      {formatDate(offer.expiryDate)}
                    </span>
                  </td>
                  {showDecision ? (
                    <td className="px-4 py-3">
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['accept', 'reject', 'defer'] as OfferDecision[]).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => onDecisionChange(offer.id, option)}
                            aria-pressed={decision === option}
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
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100">
          {message}
        </div>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-akiva-border bg-akiva-surface-raised/85 p-3 shadow-sm lg:grid-cols-[minmax(280px,420px)_1fr] lg:items-center">
        <Field label="Tender dossier">
          <SearchableSelect
            value={selectedTenderId}
            onChange={onTenderChange}
            options={tenderOptions}
            inputClassName={inputClass}
            placeholder="Select tender"
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-4">
          <InfoTile label="Tender status" value={selectedTender.status} />
          <InfoTile label="Suppliers" value={`${respondedSuppliers}/${selectedTender.suppliers.length}`} />
          <InfoTile label="Offer value" value={money(summary.totalValue, summary.currency)} />
          <InfoTile label="Award value" value={money(acceptedValue, summary.currency)} />
        </div>
      </section>

      <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-2 shadow-sm">
        <div className="grid gap-2 md:grid-cols-5">
          {tenderProcessSteps.map((step, index) => {
            const active = activeStep === step.id;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                aria-pressed={active}
                className={`flex min-h-[4.5rem] items-start gap-3 rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? 'border-akiva-accent bg-akiva-accent text-white shadow-sm'
                    : 'border-akiva-border bg-akiva-surface text-akiva-text hover:border-akiva-accent/60 hover:bg-akiva-surface-muted'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-akiva-surface-muted text-akiva-text-muted'
                }`}>
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{step.label}</span>
                  <span className={`mt-1 block text-xs leading-4 ${active ? 'text-white/80' : 'text-akiva-text-muted'}`}>{step.detail}</span>
                  <span className={`mt-2 inline-flex max-w-full rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    active ? 'bg-white/15 text-white' : 'bg-akiva-surface-raised text-akiva-text-muted ring-1 ring-akiva-border'
                  }`}>
                    {processStepStats[step.id]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activeStep === 'dossier' ? (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{selectedTender.reference}</p>
              <h2 className="mt-1 text-base font-semibold text-akiva-text">{selectedTender.title}</h2>
              <p className="mt-2 text-sm leading-6 text-akiva-text-muted">
                {selectedTender.method} · {selectedTender.category} · {selectedTender.location} · deadline {formatDate(selectedTender.submissionDeadline)}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tenderStatusTone(selectedTender.status)}`}>
              {selectedTender.status}
            </span>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <InfoTile label="Estimated value" value={money(selectedTender.estimatedValue, selectedTender.currency)} />
            <InfoTile label="Required date" value={formatDate(selectedTender.requiredDate)} />
            <InfoTile label="Offer responses" value={String(summary.lineCount)} />
            <InfoTile label="Expiring soon" value={String(summary.expiringSoon)} />
          </div>

          <div className="mt-4 rounded-lg border border-akiva-border bg-akiva-surface p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Evaluation weights</p>
            <div className="mt-2 grid gap-2 text-xs font-semibold text-akiva-text-muted sm:grid-cols-4">
              <span>Price {weighted.price}%</span>
              <span>Delivery {weighted.delivery}%</span>
              <span>Compliance {weighted.compliance}%</span>
              <span>Performance {weighted.performance}%</span>
            </div>
          </div>
        </div>

            <div className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <h2 className="text-base font-semibold text-akiva-text">Tender audit trace</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">Status changes and sourcing events tied to this dossier.</p>
              <div className="mt-4 space-y-2">
                {selectedTender.auditEvents.slice(0, 4).map((event) => (
                  <div key={`${event.label}-${event.at}`} className="flex gap-2 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-xs leading-5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-akiva-accent" />
                    <span className="min-w-0 text-akiva-text-muted">
                      <span className="font-semibold text-akiva-text">{event.label}</span>
                      <span className="block">{event.by} · {event.at}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-akiva-text">Tender lines</h2>
            <p className="mt-1 text-sm text-akiva-text-muted">Required items, quantities, technical constraints, and GL coding.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">{summary.acceptedCount} accepted</span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900">{summary.rejectedCount} rejected</span>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-akiva-border">
          <table className="w-full min-w-[760px] table-fixed">
            <thead className="bg-akiva-table-header text-xs uppercase tracking-wide text-akiva-text-muted">
              <tr>
                <th className="w-36 px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Requirement</th>
                <th className="w-32 px-3 py-2 text-right">Quantity</th>
                <th className="w-36 px-3 py-2 text-left">Required</th>
                <th className="w-24 px-3 py-2 text-left">GL</th>
              </tr>
            </thead>
            <tbody>
              {selectedTender.lines.map((line) => (
                <tr key={line.id} className="border-t border-akiva-border">
                  <td className="px-3 py-2">
                    <p className="font-mono text-sm font-semibold text-akiva-text">{line.itemCode}</p>
                    <p className="mt-1 text-xs text-akiva-text-muted">{line.category}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-sm font-semibold text-akiva-text">{line.description}</p>
                    <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{line.technicalRequirement}</p>
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-semibold text-akiva-text">{line.quantity} {line.units}</td>
                  <td className="px-3 py-2 text-sm text-akiva-text-muted">{formatDate(line.requiredDate)}</td>
                  <td className="px-3 py-2 font-mono text-sm text-akiva-text-muted">{line.glCode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </section>
        </>
      ) : null}

      {activeStep === 'responses' ? (
        <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-akiva-text">Supplier response control</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">Add vendor applications before evaluation, then track submitted lines, value, and compliance exceptions.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <InfoTile label="Response rate" value={`${responseCoverage}%`} />
              <Button onClick={() => openVendorResponseDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Add vendor response
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {offersBySupplier.map((entry) => (
              <article key={entry.supplier.supplierCode} className="rounded-xl border border-akiva-border bg-akiva-surface p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-akiva-text">{entry.supplier.supplierName}</p>
                    <p className="mt-1 text-xs text-akiva-text-muted">Invited {entry.supplier.invitedAt}</p>
                    {entry.supplier.respondedAt ? <p className="mt-0.5 text-xs text-akiva-text-muted">Responded {entry.supplier.respondedAt}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${invitationTone(entry.supplier.status)}`}>
                    {entry.supplier.status}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <InfoTile label="Lines" value={String(entry.offerCount)} />
                  <InfoTile label="Best score" value={entry.bestScore ? `${entry.bestScore}` : 'None'} />
                  <InfoTile label="Clarify" value={String(entry.clarificationCount)} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Button variant="secondary" size="sm" onClick={() => openVendorResponseDialog(entry.supplier.supplierCode)}>
                    Add response
                  </Button>
                  <p className="text-right text-sm font-semibold text-akiva-text">{money(entry.total, selectedTender.currency)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeStep === 'evaluation' ? (
        <div className="space-y-4">
          <section className="grid gap-3 xl:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-2xl border border-akiva-border bg-gradient-to-r from-akiva-surface-raised via-akiva-surface-raised to-akiva-surface-muted/70 p-4 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Award recommendation</p>
                  <h2 className="mt-1 text-base font-semibold text-akiva-text">
                    {recommendedAwards.length > 0
                      ? `${recommendedAwards.length} line award ready for procurement review`
                      : 'No award recommendation available'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-akiva-text-muted">
                    The scorecard ranks each supplier by price, lead time, technical compliance, and supplier performance before a PO is generated.
                  </p>
                </div>
                <span className={`inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${tenderRiskTone(tenderRiskLevel)}`}>
                  {tenderRiskLevel} award risk
                </span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <InfoTile label="Recommended" value={money(recommendedAwardValue, selectedTender.currency)} />
                <InfoTile label="Confidence" value={`${recommendedConfidence}/100`} />
                <InfoTile label="Response rate" value={`${responseCoverage}%`} />
                <InfoTile label="Estimate variance" value={money(savingsVsEstimate, selectedTender.currency)} />
              </div>
            </div>

            <div className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <h2 className="text-base font-semibold text-akiva-text">Evaluation method</h2>
              <div className="mt-3 grid gap-2 text-xs font-semibold text-akiva-text-muted">
                <span>Price {weighted.price}%</span>
                <span>Delivery {weighted.delivery}%</span>
                <span>Compliance {weighted.compliance}%</span>
                <span>Performance {weighted.performance}%</span>
              </div>
            </div>
          </section>
          {offerComparisonTable(false)}
        </div>
      ) : null}

      {activeStep === 'award' ? (
        <div className="space-y-4">
          <section className="grid gap-3 rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-akiva-text">Award decision</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                Select winning supplier lines, reject unsuitable responses, or defer unresolved offers before converting to purchase orders.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">{summary.acceptedCount} accepted</span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-900">{summary.rejectedCount} rejected</span>
                <span className={`rounded-full border px-2.5 py-1 ${tenderRiskTone(tenderRiskLevel)}`}>{tenderRiskLevel} risk</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" onClick={() => onAcceptRecommended(recommendedOfferIds)} disabled={recommendedOfferIds.length === 0}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Accept recommended
              </Button>
              <Button onClick={onProcess} disabled={selectedOffers.length === 0}>
                <Check className="mr-2 h-4 w-4" />
                Process award
              </Button>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <div className="flex items-start gap-2 rounded-xl border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-sm shadow-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-akiva-text-muted">One awarded supplier is allowed per tender line before PO conversion.</p>
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-akiva-border bg-akiva-surface-raised px-3 py-3 text-sm shadow-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-akiva-accent" />
              <p className="text-akiva-text-muted">Non-compliant offers are blocked from award unless a future override workflow is configured.</p>
            </div>
          </section>
          {offerComparisonTable(true)}
        </div>
      ) : null}

      {activeStep === 'conversion' ? (
        <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
            <div>
              <h2 className="text-base font-semibold text-akiva-text">Purchase order conversion</h2>
              <p className="mt-1 text-sm leading-6 text-akiva-text-muted">
                Accepted awards create pending-review purchase orders grouped by supplier, preserving tender reference, delivery date, GL code, and award audit trail.
              </p>
              <div className="mt-4 space-y-2">
                {acceptedGroups.length > 0 ? acceptedGroups.map((group) => (
                  <div key={group.supplierCode} className="flex items-center justify-between gap-3 rounded-xl border border-akiva-border bg-akiva-surface px-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-akiva-text">{group.supplierName}</p>
                      <p className="mt-1 text-xs text-akiva-text-muted">{group.lines} awarded line{group.lines === 1 ? '' : 's'} · pending-review PO will be created</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-akiva-text">{money(group.total, selectedTender.currency)}</span>
                  </div>
                )) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
                    No accepted awards yet. Go to the Award step and accept at least one supplier line before creating POs.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-akiva-border bg-akiva-surface px-3 py-3 shadow-sm">
              <div className="grid gap-2">
                <InfoTile label="Award value" value={money(acceptedValue, selectedTender.currency)} />
                <InfoTile label="PO groups" value={String(acceptedGroups.length)} />
                <InfoTile label="Tender ref" value={selectedTender.reference} />
              </div>
              <Button className="mt-3 w-full" onClick={onProcess} disabled={acceptedOffers.length === 0}>
                <Check className="mr-2 h-4 w-4" />
                Create pending-review POs
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <Modal
        isOpen={vendorResponseOpen}
        onClose={() => setVendorResponseOpen(false)}
        title="Add Vendor Application"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVendorResponseOpen(false)}>Cancel</Button>
            <Button onClick={submitVendorResponse}>
              <Plus className="mr-2 h-4 w-4" />
              Add response
            </Button>
          </>
        }
      >
        <VendorResponsePanel
          tender={selectedTender}
          draft={vendorResponseDraft}
          error={vendorResponseError}
          onChange={(patch) => {
            setVendorResponseError('');
            setVendorResponseDraft((current) => ({ ...current, ...patch }));
          }}
        />
      </Modal>
    </div>
  );
}

function AuthorisePurchaseOrdersPanel({
  orders,
  authLevels,
  selectedAuthLevel,
  loading,
  error,
  message,
  notificationSettings,
  notificationOptions,
  onOpen,
  onReview,
  onAuthorise,
  onReject,
  onNotificationChange,
  onSetupLevels,
  onOpenNotificationSettings,
}: {
  orders: PurchaseOrder[];
  authLevels: PoAuthorisationLevel[];
  selectedAuthLevel: PoAuthorisationLevel | null;
  loading: boolean;
  error: string;
  message: string;
  notificationSettings: PoNotificationSettings;
  notificationOptions: PoNotificationOptions;
  onOpen: (order: PurchaseOrder) => void;
  onReview: (order: PurchaseOrder) => void;
  onAuthorise: (order: PurchaseOrder) => void;
  onReject: (order: PurchaseOrder) => void;
  onNotificationChange: (patch: Partial<PoNotificationOptions>) => void;
  onSetupLevels: () => void;
  onOpenNotificationSettings: () => void;
}) {
  const reviewOrders = orders.filter((order) => order.status === 'Pending Review');
  const finalApprovalOrders = orders.filter((order) => order.status === 'Reviewed');
  const reviewCount = reviewOrders.length;
  const finalCount = finalApprovalOrders.length;
  const nextReviewOrder = reviewOrders[0] ?? null;
  const nextAuthoriseOrder = finalApprovalOrders[0] ?? null;
  const reviewValue = reviewOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const finalApprovalValue = finalApprovalOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const limitCurrency = (selectedAuthLevel?.currencyCode ?? 'TZS') as PurchaseOrder['currency'];
  const authorisationLimit = selectedAuthLevel?.authLevel ?? 0;
  const overLimitOrders = selectedAuthLevel
    ? finalApprovalOrders.filter((order) => order.currency === selectedAuthLevel.currencyCode && orderTotal(order) > selectedAuthLevel.authLevel)
    : [];
  const notificationReady =
    (notificationOptions.user && notificationSettings.userEnabled) ||
    (notificationOptions.email && notificationSettings.emailEnabled) ||
    (notificationOptions.sms && notificationSettings.smsEnabled);

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

      <section className="grid gap-3 rounded-2xl border border-akiva-border bg-gradient-to-r from-white via-emerald-50/60 to-violet-50/70 p-4 shadow-sm dark:from-slate-950/90 dark:via-slate-900/70 dark:to-slate-900/80 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="Review queue" value={String(reviewCount)} />
          <InfoTile label="Final approval" value={String(finalCount)} />
          <InfoTile label="Limit" value={selectedAuthLevel ? money(authorisationLimit, limitCurrency) : 'Not configured'} />
          <InfoTile label="Exceptions" value={String(overLimitOrders.length)} />
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onSetupLevels}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Levels
          </Button>
        </div>
      </section>

      {selectedAuthLevel ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ActionTaskCard
            label="Needs review"
            value={`${reviewCount} PO${reviewCount === 1 ? '' : 's'}`}
            detail={
              nextReviewOrder
                ? `Next: PO ${nextReviewOrder.orderNumber} from ${nextReviewOrder.supplierName} · ${money(orderTotal(nextReviewOrder), nextReviewOrder.currency)}. Queue value ${money(reviewValue, 'TZS')}.`
                : 'No pending-review purchase orders are waiting for review.'
            }
            icon={ClipboardCheck}
            actionLabel="Approve next"
            disabled={!nextReviewOrder}
            secondaryLabel="Reject next"
            secondaryVariant="danger"
            onAction={() => nextReviewOrder && onReview(nextReviewOrder)}
            onSecondaryAction={() => nextReviewOrder && onReject(nextReviewOrder)}
          />
          <ActionTaskCard
            label="Ready to authorise"
            value={`${finalCount} PO${finalCount === 1 ? '' : 's'}`}
            detail={
              nextAuthoriseOrder
                ? `Next: PO ${nextAuthoriseOrder.orderNumber} from ${nextAuthoriseOrder.supplierName} · ${money(orderTotal(nextAuthoriseOrder), nextAuthoriseOrder.currency)}. Ready value ${money(finalApprovalValue, 'TZS')}.`
                : 'No reviewed purchase orders are ready for final authorisation.'
            }
            icon={ShieldCheck}
            actionLabel="Authorise next"
            disabled={!nextAuthoriseOrder}
            secondaryLabel="Reject next"
            secondaryVariant="danger"
            onAction={() => nextAuthoriseOrder && onAuthorise(nextAuthoriseOrder)}
            onSecondaryAction={() => nextAuthoriseOrder && onReject(nextAuthoriseOrder)}
          />
          <ActionTaskCard
            label="Limit exceptions"
            value={overLimitOrders.length > 0 ? `${overLimitOrders.length} over limit` : 'Clear'}
            detail={
              overLimitOrders.length > 0
                ? `Review setup before authorising. Approval limit is ${money(authorisationLimit, limitCurrency)}.`
                : `Approval limit ${money(authorisationLimit, limitCurrency)} covers the current final-authorisation queue.`
            }
            icon={AlertTriangle}
            actionLabel="Check levels"
            tone={overLimitOrders.length > 0 ? 'warning' : 'neutral'}
            onAction={onSetupLevels}
          />
          <ActionTaskCard
            label="Send action updates"
            value={notificationReady ? 'Ready' : 'Off'}
            detail={
              notificationReady
                ? 'Enabled email or SMS updates will be queued when an approval action is posted.'
                : 'No email or SMS notifications are enabled for approval actions.'
            }
            icon={MessageSquare}
            actionLabel="Notification settings"
            tone={notificationReady ? 'neutral' : 'warning'}
            onAction={onOpenNotificationSettings}
          />
        </section>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-3 shadow-sm lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-akiva-text">Action notifications</h2>
          <p className="mt-1 text-sm leading-6 text-akiva-text-muted">
            User, email, and SMS queueing follows the purchase order notification settings in System Parameters.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToggleChip
            icon={Bell}
            label="User"
            checked={notificationOptions.user && notificationSettings.userEnabled}
            disabled={!notificationSettings.userEnabled}
            note={notificationSettings.userEnabled ? 'Enabled' : notificationSettings.loaded ? 'Off in settings' : 'Loading'}
            onChange={(checked) => onNotificationChange({ user: checked })}
          />
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
          <Button variant="secondary" size="sm" onClick={onOpenNotificationSettings}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Settings
          </Button>
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
                              Approve review
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => onAuthorise(order)} className="min-h-8 rounded-md px-2.5 py-1 text-xs">
                              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                              Authorise
                            </Button>
                          )}
                          <Button variant="danger" size="sm" onClick={() => onReject(order)} className="min-h-8 rounded-md px-2.5 py-1 text-xs">
                            {isPendingReview ? 'Reject review' : 'Reject authorisation'}
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

function ActionTaskCard({
  label,
  value,
  detail,
  icon: Icon,
  actionLabel,
  secondaryLabel,
  secondaryVariant = 'secondary',
  disabled = false,
  secondaryDisabled,
  tone = 'neutral',
  onAction,
  onSecondaryAction,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  actionLabel: string;
  secondaryLabel?: string;
  secondaryVariant?: 'secondary' | 'danger';
  disabled?: boolean;
  secondaryDisabled?: boolean;
  tone?: 'neutral' | 'warning';
  onAction: () => void;
  onSecondaryAction?: () => void;
}) {
  const warning = tone === 'warning';
  const secondaryButtonDisabled = secondaryDisabled ?? disabled;

  return (
    <article
      className={`rounded-lg border p-4 shadow-sm ${
        warning
          ? 'border-amber-200 bg-amber-50/80 dark:border-amber-900/70 dark:bg-amber-950/30'
          : 'border-akiva-border bg-akiva-surface-raised'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${
            warning ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100' : 'bg-akiva-surface-muted text-akiva-text'
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 min-h-[3.75rem] text-sm leading-5 text-akiva-text-muted">{detail}</p>
      <div className={`mt-4 grid gap-2 ${secondaryLabel && onSecondaryAction ? 'sm:grid-cols-2' : ''}`}>
        <Button variant={warning ? 'secondary' : 'primary'} size="sm" className="w-full" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </Button>
        {secondaryLabel && onSecondaryAction ? (
          <Button
            variant={secondaryVariant}
            size="sm"
            className="w-full"
            onClick={onSecondaryAction}
            disabled={secondaryButtonDisabled}
          >
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
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
