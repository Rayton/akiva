export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
  balance: number;
  parent?: string;
  level: number;
  isActive: boolean;
}

export interface Transaction {
  id: string;
  date: string;
  reference: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  status: 'Posted' | 'Pending' | 'Draft';
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  balance: number;
  creditLimit: number;
}

export interface Supplier {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  balance: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  unitPrice: number;
  stockLevel: number;
  reorderLevel: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customer: string;
  date: string;
  dueDate: string;
  status: 'Draft' | 'Confirmed' | 'Shipped' | 'Completed';
  total: number;
  items: OrderItem[];
}

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplier: string;
  date: string;
  expectedDate: string;
  status: 'Draft' | 'Approved' | 'Received' | 'Completed';
  total: number;
  items: OrderItem[];
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface FinancialReport {
  id: string;
  name: string;
  type: 'Balance Sheet' | 'Income Statement' | 'Cash Flow' | 'Trial Balance';
  period: string;
  data: any;
}