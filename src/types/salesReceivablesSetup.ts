export type SalesReceivablesSetupTab = 'sales-types' | 'customer-types';

export interface SalesType {
  code: string;
  name: string;
}

export interface CustomerType {
  id: number;
  name: string;
}

export interface SalesReceivablesSetupPayload {
  salesTypes: SalesType[];
  customerTypes: CustomerType[];
  stats: {
    salesTypes: number;
    customerTypes: number;
    priceRows: number;
    customers: number;
    transactions: number;
  };
}

export interface SalesReceivablesSetupForm {
  code?: string;
  name: string;
}
