export type SalesReceivablesSetupTab =
  | 'sales-types'
  | 'customer-types'
  | 'credit-status'
  | 'payment-terms'
  | 'payment-methods'
  | 'sales-people'
  | 'areas'
  | 'sales-gl-postings'
  | 'cogs-gl-postings'
  | 'discount-matrix';

export interface SalesType {
  code: string;
  name: string;
}

export interface CustomerType {
  id: number;
  name: string;
}

export interface CreditStatus {
  id: number;
  name: string;
  disallowInvoices: number;
}

export interface PaymentTerm {
  code: string;
  name: string;
  daysBeforeDue: number;
  dayInFollowingMonth: number;
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

export interface SalesPerson {
  code: string;
  name: string;
  telephone: string;
  fax: string;
  commissionRate1: number;
  breakpoint: number;
  commissionRate2: number;
  current: boolean;
}

export interface SalesArea {
  code: string;
  name: string;
}

export interface SalesGlPosting {
  id: number;
  area: string;
  areaName: string;
  stockCategory: string;
  stockCategoryName: string;
  salesType: string;
  salesTypeName: string;
  salesGlCode: string;
  salesGlName: string;
  discountGlCode: string;
  discountGlName: string;
  hasInvalidAccounts: boolean;
}

export interface CogsGlPosting {
  id: number;
  area: string;
  areaName: string;
  stockCategory: string;
  stockCategoryName: string;
  salesType: string;
  salesTypeName: string;
  cogsGlCode: string;
  cogsGlName: string;
  hasInvalidAccount: boolean;
}

export interface DiscountMatrixRow {
  id: string;
  salesType: string;
  salesTypeName: string;
  discountCategory: string;
  quantityBreak: number;
  discountRate: number;
  discountRatePercent: number;
}

export interface SalesReceivablesLookupOption {
  code: string;
  name: string;
}

export interface SalesReceivablesSetupPayload {
  salesTypes: SalesType[];
  customerTypes: CustomerType[];
  creditStatuses: CreditStatus[];
  paymentTerms: PaymentTerm[];
  paymentMethods: PaymentMethod[];
  salesPeople: SalesPerson[];
  areas: SalesArea[];
  salesGlPostings: SalesGlPosting[];
  cogsGlPostings: CogsGlPosting[];
  discountMatrix: DiscountMatrixRow[];
  lookups: {
    stockCategories: SalesReceivablesLookupOption[];
    profitLossAccounts: SalesReceivablesLookupOption[];
    discountCategories: SalesReceivablesLookupOption[];
  };
  stats: {
    salesTypes: number;
    customerTypes: number;
    creditStatuses: number;
    paymentTerms: number;
    paymentMethods: number;
    salesPeople: number;
    areas: number;
    salesGlPostings: number;
    cogsGlPostings: number;
    discountMatrix: number;
    priceRows: number;
    customers: number;
    suppliers: number;
    bankTransactions: number;
    transactions: number;
  };
}

export interface SalesReceivablesSetupForm {
  code?: string;
  name: string;
  disallowInvoices?: number;
  dueMode?: 'days' | 'following-month';
  dayNumber?: number;
  paymentType?: boolean;
  receiptType?: boolean;
  usePreprintedStationery?: boolean;
  openCashDrawer?: boolean;
  percentDiscount?: number;
  telephone?: string;
  fax?: string;
  commissionRate1?: number;
  breakpoint?: number;
  commissionRate2?: number;
  current?: boolean;
  area?: string;
  stockCategory?: string;
  salesType?: string;
  salesGlCode?: string;
  discountGlCode?: string;
  cogsGlCode?: string;
  discountCategory?: string;
  quantityBreak?: number;
  discountRatePercent?: number;
}
