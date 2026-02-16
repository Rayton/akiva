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
import { Home, ShoppingCart, FileBarChart, Settings, Star, Menu, Clock, X, ChevronRight } from 'lucide-react';

function AppContent() {
  const { currentPage, mobileSidebarOpen, setMobileSidebarOpen } = useApp();

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
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Sales Invoices</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage customer invoices and billing</p></div>;
      case 'credit-notes':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Credit Notes</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Process customer credit notes and returns</p></div>;
      case 'customer-payments':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Customer Payments</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Record and manage customer payments</p></div>;
      
      // Purchase & Supplier Management
      case 'purchase-invoices':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Purchase Invoices</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Process supplier invoices and bills</p></div>;
      case 'supplier-payments':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Supplier Payments</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage payments to suppliers</p></div>;
      case 'grn':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Goods Received Notes</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Record goods received from suppliers</p></div>;
      
      // General Ledger
      case 'bank-accounts':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Bank Accounts</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage company bank accounts</p></div>;
      case 'bank-reconciliation':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Bank Reconciliation</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Reconcile bank statements</p></div>;
      case 'fixed-assets':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Fixed Assets</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Manage company fixed assets and depreciation</p></div>;
      
      // Inventory Management
      case 'stock-movements':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Stock Movements</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Track inventory movements and transactions</p></div>;
      case 'stock-adjustments':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Stock Adjustments</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Adjust inventory levels and quantities</p></div>;
      case 'stock-transfers':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Stock Transfers</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Transfer stock between locations</p></div>;
      
      // Financial Reports
      case 'profit-loss':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Profit & Loss Statement</h2><p className="text-gray-600 dark:text-gray-400 mt-2">View company profit and loss reports</p></div>;
      case 'trial-balance':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Trial Balance</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Generate trial balance reports</p></div>;
      case 'cash-flow':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Cash Flow Statement</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Analyze company cash flow</p></div>;
      
      // Sales Reports
      case 'sales-analysis':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Sales Analysis</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Analyze sales performance and trends</p></div>;
      case 'customer-statements':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Customer Statements</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Generate customer account statements</p></div>;
      case 'aged-debtors':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Aged Debtors Report</h2><p className="text-gray-600 dark:text-gray-400 mt-2">View outstanding customer balances by age</p></div>;
      
      // Purchase Reports
      case 'purchase-analysis':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Purchase Analysis</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Analyze purchase patterns and costs</p></div>;
      case 'aged-creditors':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Aged Creditors Report</h2><p className="text-gray-600 dark:text-gray-400 mt-2">View outstanding supplier balances by age</p></div>;
      case 'supplier-statements':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Supplier Statements</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Generate supplier account statements</p></div>;
      
      // Inventory Reports
      case 'stock-status':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Stock Status Report</h2><p className="text-gray-600 dark:text-gray-400 mt-2">View current stock levels and status</p></div>;
      case 'stock-valuation':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Stock Valuation Report</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Calculate inventory valuation</p></div>;
      case 'reorder-level':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Reorder Level Report</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Items below reorder level</p></div>;
      
      // System Setup
      case 'company-setup':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Company Setup</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Configure company information and settings</p></div>;
      case 'system-setup':
        return <div className="p-4 md:p-8"><h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">System Setup</h2><p className="text-gray-600 dark:text-gray-400 mt-2">Configure system parameters and preferences</p></div>;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-slate-900 flex flex-col overflow-hidden transition-colors duration-300">
      {/* Desktop: Sidebar on left - Mobile: Header on top */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-6 overflow-auto bg-gray-50 dark:bg-slate-900 transition-colors duration-300">
            {renderCurrentPage()}
          </main>
        </div>
      </div>
      
      {/* Mobile Layout: Header on top, content in middle, sidebar at bottom */}
      <div className="lg:hidden flex flex-col h-full">
        {/* Mobile Header - Simple version */}
        <MobileHeader />
        
        {/* Main content area */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-slate-900 transition-colors duration-300 pb-20 lg:pb-0">
          {renderCurrentPage()}
        </main>
        
        {/* Mobile Bottom Navigation Bar - Fixed at bottom */}
        <MobileNav />
      </div>
      
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && <MobileSidebarOverlay />}
    </div>
  );
}

function MobileHeader() {
  const { isDarkMode, toggleDarkMode, setMobileSidebarOpen } = useApp();
  
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex-shrink-0">
      <div className="flex items-center justify-between">
        {/* Left: Menu button and Logo */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center">
              <span className="text-white dark:text-gray-900 font-bold text-sm">W</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white text-sm">webERP</span>
          </div>
        </div>
        
        {/* Right side actions */}
        <div className="flex items-center space-x-1">
          <button 
            onClick={toggleDarkMode}
            className="p-2 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            {isDarkMode ? (
              <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
          
          <button className="p-2 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 relative">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-medium">JD</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const { currentPage, setCurrentPage, setMobileSidebarOpen } = useApp();
  
  const mobileNavItems = [
    { id: 'dashboard', icon: Home, label: 'Home' },
    { id: 'transactions', icon: ShoppingCart, label: 'Trans' },
    { id: 'inquiries', icon: FileBarChart, label: 'Reports' },
    { id: 'maintenance', icon: Settings, label: 'Setup' },
    { id: 'starred', icon: Star, label: 'Starred' },
    { id: 'recent', icon: Clock, label: 'Recent' },
  ];
  
  const handleNavClick = (itemId: string) => {
    // Open the mobile sidebar with the selected section
    setMobileSidebarOpen(true);
  };
  
  return (
    <nav className="bg-white dark:bg-slate-900 border-t border-gray-200 dark:border-slate-700 px-2 py-2 flex-shrink-0 fixed bottom-0 left-0 right-0 z-40">
      <div className="flex items-center justify-around">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center justify-center min-w-[50px] h-12 px-1 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'text-blue-500'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-medium truncate mt-0.5">{item.label}</span>
            </button>
          );
        })}
        
        {/* More menu button */}
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="flex flex-col items-center justify-center min-w-[50px] h-12 px-1 rounded-lg text-gray-500 dark:text-gray-400 transition-all duration-200"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[9px] font-medium mt-0.5">More</span>
        </button>
      </div>
    </nav>
  );
}

function MobileSidebarOverlay() {
  const { mobileSidebarOpen, setMobileSidebarOpen, currentPage, setCurrentPage } = useApp();
  
  const menuSections = [
    {
      id: 'transactions',
      label: 'Transactions',
      icon: ShoppingCart,
      items: [
        { id: 'sales-orders', label: 'Sales Orders' },
        { id: 'purchase-orders', label: 'Purchase Orders' },
        { id: 'general-ledger', label: 'General Ledger' },
        { id: 'inventory', label: 'Inventory' }
      ]
    },
    {
      id: 'inquiries',
      label: 'Reports',
      icon: FileBarChart,
      items: [
        { id: 'financial-reports', label: 'Financial Reports' },
        { id: 'sales-analysis', label: 'Sales Analysis' },
        { id: 'purchase-analysis', label: 'Purchase Analysis' },
        { id: 'stock-status', label: 'Stock Status' }
      ]
    },
    {
      id: 'maintenance',
      label: 'Setup',
      icon: Settings,
      items: [
        { id: 'accounts', label: 'Chart of Accounts' },
        { id: 'receivables', label: 'Accounts Receivable' },
        { id: 'payables', label: 'Accounts Payable' },
        { id: 'users', label: 'User Management' },
        { id: 'company-setup', label: 'Company Setup' }
      ]
    }
  ];
  
  if (!mobileSidebarOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 transition-opacity"
        onClick={() => setMobileSidebarOpen(false)}
      />
      
      {/* Sidebar Panel */}
      <div className="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-slate-900 shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center">
              <span className="text-white dark:text-gray-900 font-bold text-lg">W</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">webERP</span>
          </div>
          <button 
            onClick={() => setMobileSidebarOpen(false)}
            className="p-2 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Navigation Sections */}
        <nav className="p-4 space-y-2">
          {/* Dashboard */}
          <button
            onClick={() => {
              setCurrentPage('dashboard');
              setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors ${
              currentPage === 'dashboard'
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Home className="w-5 h-5" />
              <span className="font-medium">Dashboard</span>
            </div>
          </button>
          
          {/* Menu Sections */}
          {menuSections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.id} className="space-y-1">
                <div className="flex items-center space-x-3 px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  <Icon className="w-4 h-4" />
                  <span>{section.label}</span>
                </div>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentPage(item.id);
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 ml-4 rounded-lg transition-colors ${
                      currentPage === item.id
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-sm">{item.label}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ))}
              </div>
            );
          })}
          
          {/* Starred */}
          <button
            onClick={() => {
              setCurrentPage('starred');
              setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              currentPage === 'starred'
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
          >
            <Star className="w-5 h-5" />
            <span className="font-medium">Starred</span>
          </button>
          
          {/* Recent */}
          <button
            onClick={() => {
              setCurrentPage('recent');
              setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
              currentPage === 'recent'
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
            }`}
          >
            <Clock className="w-5 h-5" />
            <span className="font-medium">Recent</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <div className="bg-gray-50 dark:bg-slate-900 h-screen transition-colors duration-300">
        <AppContent />
      </div>
    </AppProvider>
  );
}

export default App;
