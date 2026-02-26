export type SalesSyncState = 'pending' | 'synced' | 'error';
export type SalesOrderSource = 'local-draft' | 'weberp';
export type SalesOrderStatus = 'draft' | 'confirmed' | 'invoiced';

export interface SalesOrderDoc {
  _id: string;
  _rev?: string;
  docType: 'sales-order';
  source: SalesOrderSource;
  orderNo: string;
  debtorNo: string;
  customerName: string;
  customerRef: string;
  orderDate: string;
  deliveryDate: string;
  status: SalesOrderStatus;
  grossTotal: number;
  lineCount: number;
  syncState: SalesSyncState;
  createdAt: string;
  updatedAt: string;
}

export interface NewSalesOrderDraftInput {
  debtorNo: string;
  customerName: string;
  customerRef?: string;
  orderDate?: string;
  deliveryDate?: string;
  grossTotal: number;
}

export interface SalesOrderListItem {
  id: string;
  orderNo: string;
  customerName: string;
  debtorNo: string;
  customerRef: string;
  orderDate: string;
  deliveryDate: string;
  grossTotal: number;
  lineCount: number;
  status: SalesOrderStatus;
  source: SalesOrderSource;
  syncState: SalesSyncState;
}

export interface OnlineSalesOrder {
  orderNo: string;
  debtorNo: string;
  customerName: string;
  customerRef: string;
  orderDate: string;
  deliveryDate: string;
  grossTotal: number;
  lineCount: number;
}

export interface SalesTransaction {
  transNo: string;
  transType: number;
  debtorNo: string;
  customerName: string;
  reference: string;
  orderNo: string;
  transactionDate: string;
  grossTotal: number;
  settled: boolean;
}

export interface SalesMonthlySummary {
  month: string;
  invoiceCount: number;
  grossTotal: number;
}

export interface SalesTopCustomer {
  debtorNo: string;
  customerName: string;
  invoiceCount: number;
  grossTotal: number;
}

export interface SalesReportSummary {
  monthly: SalesMonthlySummary[];
  topCustomers: SalesTopCustomer[];
}

export interface SalesSettings {
  salesTypes: Array<{ code: string; name: string }>;
  paymentTerms: Array<{ code: string; name: string }>;
  holdReasons: Array<{ code: string; name: string; blocksInvoicing: boolean }>;
  salesPeople: Array<{ code: string; name: string; current: boolean }>;
}

export interface SalesCustomer {
  debtorNo: string;
  customerName: string;
  branchCode: string;
  branchName: string;
  phone: string;
  email: string;
  salesType: string;
  paymentTerms: string;
  defaultLocation: string;
  defaultShipperId: number;
}

export interface SalesStockItem {
  stockId: string;
  description: string;
  units: string;
  salesType: string;
  price: number;
  materialCost: number;
}

export interface SalesOrderLineInput {
  stockId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  narrative?: string;
}

export interface CreateSalesOrderPayload {
  debtorNo: string;
  branchCode?: string;
  customerRef?: string;
  buyerName?: string;
  comments?: string;
  orderDate?: string;
  deliveryDate?: string;
  orderType?: string;
  shipVia?: number;
  fromStockLoc?: string;
  lines: SalesOrderLineInput[];
}

export interface CreateSalesOrderResult {
  orderNo: number;
  debtorNo: string;
  branchCode: string;
  deliveryDate: string;
}

export interface SalesOutstandingOrder {
  orderNo: string;
  debtorNo: string;
  customerName: string;
  orderDate: string;
  deliveryDate: string;
  lineCount: number;
  outstandingLines: number;
  outstandingQty: number;
  grossTotal: number;
}

export interface SalesPickingCandidate {
  orderNo: string;
  debtorNo: string;
  customerName: string;
  locationCode: string;
  orderDate: string;
  dueDate: string;
  openQty: number;
}

export interface SalesRecurringTemplate {
  recurringOrderNo: number;
  debtorNo: string;
  customerName: string;
  branchCode: string;
  orderDate: string;
  lastRecurrence: string;
  stopDate: string;
  frequencyDays: number;
  autoInvoice: boolean;
  lineCount: number;
}

export interface SalesRecurringProcessResult {
  createdOrders: number[];
  skippedTemplates: number[];
}

export interface SalesPriceListItem {
  stockId: string;
  description: string;
  salesType: string;
  currency: string;
  unitPrice: number;
  units: string;
}

export interface SalesOrderStatusRow {
  orderNo: string;
  debtorNo: string;
  customerName: string;
  orderDate: string;
  deliveryDate: string;
  lineCount: number;
  completedLines: number;
  grossTotal: number;
}

export interface SalesDailySalesRow {
  day: string;
  invoiceCount: number;
  grossTotal: number;
}

export interface SalesTopItem {
  stockId: string;
  description: string;
  quantity: number;
  grossTotal: number;
}

export interface SalesLowGrossRow {
  orderNo: string;
  stockId: string;
  description: string;
  unitPrice: number;
  materialCost: number;
  grossMarginPct: number;
}

export interface SalesContractSummary {
  contractRef: string;
  contractDescription: string;
  debtorNo: string;
  branchCode: string;
  customerName: string;
  branchName: string;
  locationCode: string;
  locationName: string;
  status: number;
  statusLabel: string;
  orderNo: number;
  workOrderNo: number;
  margin: number;
  requiredDate: string;
  customerRef: string;
  exchangeRate: number;
  bomCost: number;
  requirementsCost: number;
  totalCost: number;
  quotedPrice: number;
}

export interface SalesContractBomLine {
  stockId: string;
  description?: string;
  workCentreCode: string;
  quantity: number;
  units?: string;
  itemCost?: number;
}

export interface SalesContractRequirementLine {
  id?: number;
  requirement: string;
  quantity: number;
  costPerUnit: number;
}

export interface SalesContractDetail {
  contractRef: string;
  contractDescription: string;
  debtorNo: string;
  branchCode: string;
  customerName: string;
  branchName: string;
  locationCode: string;
  locationName: string;
  status: number;
  statusLabel: string;
  categoryId: string;
  orderNo: number;
  workOrderNo: number;
  customerRef: string;
  margin: number;
  requiredDate: string;
  drawing: string;
  exchangeRate: number;
  currencyCode: string;
  bomCost: number;
  requirementsCost: number;
  totalCost: number;
  quotedPrice: number;
  bomLines: SalesContractBomLine[];
  requirementLines: SalesContractRequirementLine[];
}

export interface SalesContractCustomerLookup {
  debtorNo: string;
  customerName: string;
  currencyCode: string;
  branchCode: string;
  branchName: string;
  defaultLocation: string;
  defaultShipperId: number;
}

export interface SalesContractCategoryLookup {
  categoryId: string;
  categoryDescription: string;
}

export interface SalesContractLocationLookup {
  locationCode: string;
  locationName: string;
}

export interface SalesContractWorkCentreLookup {
  workCentreCode: string;
  locationCode: string;
  description: string;
}

export interface SalesContractLookups {
  customers: SalesContractCustomerLookup[];
  categories: SalesContractCategoryLookup[];
  locations: SalesContractLocationLookup[];
  workCentres: SalesContractWorkCentreLookup[];
}

export interface SalesContractPayload {
  contractRef: string;
  contractDescription: string;
  debtorNo: string;
  branchCode: string;
  categoryId: string;
  locationCode: string;
  requiredDate: string;
  margin: number;
  customerRef: string;
  exchangeRate?: number;
  defaultWorkCentre?: string;
  bomLines: SalesContractBomLine[];
  requirementLines: SalesContractRequirementLine[];
}

export interface SalesContractQuoteResult {
  contractRef: string;
  orderNo: number;
  alreadyQuoted: boolean;
}
