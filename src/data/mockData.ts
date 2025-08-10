import { Account, Transaction, Customer, Supplier, Product, SalesOrder, PurchaseOrder } from '../types';

export const mockAccounts: Account[] = [
  { id: '1', code: '1000', name: 'Cash', type: 'Asset', balance: 50000, level: 1, isActive: true },
  { id: '2', code: '1100', name: 'Accounts Receivable', type: 'Asset', balance: 25000, level: 1, isActive: true },
  { id: '3', code: '1200', name: 'Inventory', type: 'Asset', balance: 75000, level: 1, isActive: true },
  { id: '4', code: '1500', name: 'Equipment', type: 'Asset', balance: 100000, level: 1, isActive: true },
  { id: '5', code: '2000', name: 'Accounts Payable', type: 'Liability', balance: 15000, level: 1, isActive: true },
  { id: '6', code: '2100', name: 'Notes Payable', type: 'Liability', balance: 30000, level: 1, isActive: true },
  { id: '7', code: '3000', name: 'Owner\'s Capital', type: 'Equity', balance: 150000, level: 1, isActive: true },
  { id: '8', code: '4000', name: 'Sales Revenue', type: 'Revenue', balance: 200000, level: 1, isActive: true },
  { id: '9', code: '5000', name: 'Cost of Goods Sold', type: 'Expense', balance: 80000, level: 1, isActive: true },
  { id: '10', code: '6000', name: 'Operating Expenses', type: 'Expense', balance: 45000, level: 1, isActive: true },
];

export const mockTransactions: Transaction[] = [
  {
    id: '1',
    date: '2024-01-15',
    reference: 'JE001',
    description: 'Sale of goods to customer ABC',
    debitAccount: '1000',
    creditAccount: '4000',
    amount: 5000,
    status: 'Posted'
  },
  {
    id: '2',
    date: '2024-01-16',
    reference: 'JE002',
    description: 'Purchase of inventory',
    debitAccount: '1200',
    creditAccount: '2000',
    amount: 3000,
    status: 'Posted'
  },
  {
    id: '3',
    date: '2024-01-17',
    reference: 'JE003',
    description: 'Payment of office rent',
    debitAccount: '6000',
    creditAccount: '1000',
    amount: 2000,
    status: 'Pending'
  }
];

export const mockCustomers: Customer[] = [
  {
    id: '1',
    name: 'ABC Corporation',
    email: 'contact@abc.com',
    phone: '(555) 123-4567',
    address: '123 Business St, City, State 12345',
    balance: 15000,
    creditLimit: 25000
  },
  {
    id: '2',
    name: 'XYZ Industries',
    email: 'info@xyz.com',
    phone: '(555) 987-6543',
    address: '456 Industrial Blvd, City, State 12345',
    balance: 8500,
    creditLimit: 20000
  }
];

export const mockSuppliers: Supplier[] = [
  {
    id: '1',
    name: 'Global Supply Co',
    email: 'orders@globalsupply.com',
    phone: '(555) 111-2222',
    address: '789 Supply Chain Ave, City, State 12345',
    balance: 5000
  },
  {
    id: '2',
    name: 'Premier Materials',
    email: 'sales@premiermaterials.com',
    phone: '(555) 333-4444',
    address: '321 Materials Way, City, State 12345',
    balance: 3500
  }
];

export const mockProducts: Product[] = [
  {
    id: '1',
    code: 'PROD001',
    name: 'Premium Widget A',
    description: 'High-quality widget for industrial use',
    category: 'Widgets',
    unitPrice: 25.99,
    stockLevel: 150,
    reorderLevel: 50
  },
  {
    id: '2',
    code: 'PROD002',
    name: 'Standard Widget B',
    description: 'Standard widget for general use',
    category: 'Widgets',
    unitPrice: 15.99,
    stockLevel: 75,
    reorderLevel: 25
  }
];

export const mockSalesOrders: SalesOrder[] = [
  {
    id: '1',
    orderNumber: 'SO-2024-001',
    customer: 'ABC Corporation',
    date: '2024-01-15',
    dueDate: '2024-01-30',
    status: 'Confirmed',
    total: 1299.50,
    items: [
      { productId: '1', productName: 'Premium Widget A', quantity: 50, unitPrice: 25.99, total: 1299.50 }
    ]
  }
];

export const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: '1',
    orderNumber: 'PO-2024-001',
    supplier: 'Global Supply Co',
    date: '2024-01-10',
    expectedDate: '2024-01-25',
    status: 'Approved',
    total: 2598.00,
    items: [
      { productId: '1', productName: 'Premium Widget A', quantity: 100, unitPrice: 25.98, total: 2598.00 }
    ]
  }
];