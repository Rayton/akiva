import React from 'react';
import { AppProvider, useApp } from './contexts/AppContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { ChartOfAccounts } from './pages/ChartOfAccounts';
import { GeneralLedger } from './pages/GeneralLedger';
import { AccountsReceivable } from './pages/AccountsReceivable';
import { AccountsPayable } from './pages/AccountsPayable';
import { Inventory } from './pages/Inventory';
import { SalesOrders } from './pages/SalesOrders';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { FinancialReports } from './pages/FinancialReports';
import { UserManagement } from './pages/UserManagement';

function AppContent() {
  const { currentPage } = useApp();

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'accounts':
        return <ChartOfAccounts />;
      case 'general-ledger':
        return <GeneralLedger />;
      case 'receivables':
        return <AccountsReceivable />;
      case 'payables':
        return <AccountsPayable />;
      case 'inventory':
        return <Inventory />;
      case 'sales-orders':
        return <SalesOrders />;
      case 'purchase-orders':
        return <PurchaseOrders />;
      case 'financial-reports':
        return <FinancialReports />;
      case 'users':
        return <UserManagement />;
      // Sales & Customer Management
      case 'sales-invoices':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Sales Invoices</h2><p className="text-gray-600 mt-2">Manage customer invoices and billing</p></div>;
      case 'credit-notes':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Credit Notes</h2><p className="text-gray-600 mt-2">Process customer credit notes and returns</p></div>;
      case 'customer-payments':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Customer Payments</h2><p className="text-gray-600 mt-2">Record and manage customer payments</p></div>;
      
      // Purchase & Supplier Management
      case 'purchase-invoices':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Purchase Invoices</h2><p className="text-gray-600 mt-2">Process supplier invoices and bills</p></div>;
      case 'supplier-payments':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Supplier Payments</h2><p className="text-gray-600 mt-2">Manage payments to suppliers</p></div>;
      case 'grn':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Goods Received Notes</h2><p className="text-gray-600 mt-2">Record goods received from suppliers</p></div>;
      
      // General Ledger
      case 'bank-accounts':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Bank Accounts</h2><p className="text-gray-600 mt-2">Manage company bank accounts</p></div>;
      case 'bank-reconciliation':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Bank Reconciliation</h2><p className="text-gray-600 mt-2">Reconcile bank statements</p></div>;
      case 'fixed-assets':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Fixed Assets</h2><p className="text-gray-600 mt-2">Manage company fixed assets and depreciation</p></div>;
      
      // Inventory Management
      case 'stock-movements':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Stock Movements</h2><p className="text-gray-600 mt-2">Track inventory movements and transactions</p></div>;
      case 'stock-adjustments':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Stock Adjustments</h2><p className="text-gray-600 mt-2">Adjust inventory levels and quantities</p></div>;
      case 'stock-transfers':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Stock Transfers</h2><p className="text-gray-600 mt-2">Transfer stock between locations</p></div>;
      
      // Financial Reports
      case 'profit-loss':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h2><p className="text-gray-600 mt-2">View company profit and loss reports</p></div>;
      case 'trial-balance':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Trial Balance</h2><p className="text-gray-600 mt-2">Generate trial balance reports</p></div>;
      case 'cash-flow':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Cash Flow Statement</h2><p className="text-gray-600 mt-2">Analyze company cash flow</p></div>;
      
      // Sales Reports
      case 'sales-analysis':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Sales Analysis</h2><p className="text-gray-600 mt-2">Analyze sales performance and trends</p></div>;
      case 'customer-statements':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Customer Statements</h2><p className="text-gray-600 mt-2">Generate customer account statements</p></div>;
      case 'aged-debtors':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Aged Debtors Report</h2><p className="text-gray-600 mt-2">View outstanding customer balances by age</p></div>;
      
      // Purchase Reports
      case 'purchase-analysis':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Purchase Analysis</h2><p className="text-gray-600 mt-2">Analyze purchase patterns and costs</p></div>;
      case 'aged-creditors':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Aged Creditors Report</h2><p className="text-gray-600 mt-2">View outstanding supplier balances by age</p></div>;
      case 'supplier-statements':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Supplier Statements</h2><p className="text-gray-600 mt-2">Generate supplier account statements</p></div>;
      
      // Inventory Reports
      case 'stock-status':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Stock Status Report</h2><p className="text-gray-600 mt-2">View current stock levels and status</p></div>;
      case 'stock-valuation':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Stock Valuation Report</h2><p className="text-gray-600 mt-2">Calculate inventory valuation</p></div>;
      case 'reorder-level':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Reorder Level Report</h2><p className="text-gray-600 mt-2">Items below reorder level</p></div>;
      
      // System Setup
      case 'company-setup':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">Company Setup</h2><p className="text-gray-600 mt-2">Configure company information and settings</p></div>;
      case 'system-setup':
        return <div className="p-8"><h2 className="text-2xl font-bold text-gray-900">System Setup</h2><p className="text-gray-600 mt-2">Configure system parameters and preferences</p></div>;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-white flex">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 overflow-auto">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <div className="bg-white dark:bg-gray-900 min-h-screen transition-colors">
        <AppContent />
      </div>
    </AppProvider>
  );
}

export default App;