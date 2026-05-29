export type ReceivablesTone = 'danger' | 'warning' | 'pending' | 'success' | 'info' | 'neutral';

export interface ReceivablesSummary {
  totalReceivables: number;
  openInvoices: number;
  customersWithBalance: number;
  overdueReceivables: number;
  overdueInvoices: number;
  dueSoonReceivables: number;
  dueSoonInvoices: number;
  currentReceivables: number;
  highestCustomerBalance: number;
  averageDaysOverdue: number;
  oldestDaysOverdue: number;
}

export interface ReceivablesAgingBucket {
  key: string;
  label: string;
  amount: number;
  invoiceCount: number;
}

export interface ReceivablesCustomerExposure {
  debtorNo: string;
  customerName: string;
  email: string;
  phone: string;
  balance: number;
  overdueBalance: number;
  invoiceCount: number;
  overdueInvoices: number;
  creditLimit: number;
  utilizationPct: number;
  oldestDueDate: string;
  daysOverdue: number;
  status: string;
}

export interface ReceivablesPriorityInvoice {
  transNo: string;
  transactionType: string;
  reference: string;
  debtorNo: string;
  customerName: string;
  transactionDate: string;
  dueDate: string;
  amountDue: number;
  daysOverdue: number;
  status: string;
}

export interface ReceivablesAction {
  id: string;
  priority: number;
  title: string;
  detail: string;
  tone: ReceivablesTone;
  value: number;
  valueLabel: string;
}

export interface ReceivablesDashboardPayload {
  currency: string;
  asOf: string;
  summary: ReceivablesSummary;
  aging: ReceivablesAgingBucket[];
  topCustomers: ReceivablesCustomerExposure[];
  priorityInvoices: ReceivablesPriorityInvoice[];
  actionQueue: ReceivablesAction[];
}
