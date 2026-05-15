export type PurchasesPayablesSetupTab =
  | 'supplier-types'
  | 'payment-terms'
  | 'po-authorisation-levels'
  | 'payment-methods'
  | 'shippers'
  | 'freight-costs';

export interface SupplierType {
  id: number;
  name: string;
}

export interface PaymentTerm {
  code: string;
  name: string;
  daysBeforeDue: number;
  dayInFollowingMonth: number;
}

export interface PoAuthorisationLevel {
  id: string;
  userId: string;
  userName: string;
  currencyCode: string;
  currencyName: string;
  canCreate: boolean;
  canReview: boolean;
  authLevel: number;
  offHold: boolean;
}

export interface PaymentMethod {
  id: number;
  name: string;
  paymentType: boolean;
  receiptType: boolean;
  usePreprintedStationery: boolean;
  openCashDrawer: boolean;
  percentDiscount: number;
}

export interface Shipper {
  id: number;
  name: string;
  minimumCharge: number;
}

export interface FreightCost {
  id: number;
  locationFrom: string;
  locationName: string;
  destinationCountry: string;
  destination: string;
  shipperId: number;
  shipperName: string;
  cubRate: number;
  kgRate: number;
  maxKgs: number;
  maxCub: number;
  fixedPrice: number;
  minimumCharge: number;
}

export interface PurchasesPayablesLookupOption {
  code: string;
  name: string;
}

export interface PurchasesPayablesSetupPayload {
  supplierTypes: SupplierType[];
  paymentTerms: PaymentTerm[];
  poAuthorisationLevels: PoAuthorisationLevel[];
  paymentMethods: PaymentMethod[];
  shippers: Shipper[];
  freightCosts: FreightCost[];
  lookups: {
    users: PurchasesPayablesLookupOption[];
    currencies: PurchasesPayablesLookupOption[];
    locations: PurchasesPayablesLookupOption[];
  };
  stats: {
    supplierTypes: number;
    paymentTerms: number;
    poAuthorisationLevels: number;
    paymentMethods: number;
    shippers: number;
    freightCosts: number;
    suppliers: number;
    bankTransactions: number;
  };
}

export interface PurchasesPayablesSetupForm {
  code?: string;
  name: string;
  dueMode?: 'days' | 'following-month';
  dayNumber?: number;
  userId?: string;
  currencyCode?: string;
  canCreate?: boolean;
  canReview?: boolean;
  authLevel?: number;
  offHold?: boolean;
  paymentType?: boolean;
  receiptType?: boolean;
  usePreprintedStationery?: boolean;
  openCashDrawer?: boolean;
  percentDiscount?: number;
  minimumCharge?: number;
  locationFrom?: string;
  destinationCountry?: string;
  destination?: string;
  shipperId?: number;
  cubRate?: number;
  kgRate?: number;
  maxKgs?: number;
  maxCub?: number;
  fixedPrice?: number;
}
