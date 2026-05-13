import { AppProvider, useApp } from './contexts/AppContext';
import { Header } from './components/layout/Header';
import { OfflineStatusBar } from './components/layout/OfflineStatusBar';
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
import { CompanyPreferences } from './pages/CompanyPreferences';
import { SystemParameters } from './pages/SystemParameters';
import { AuditTrail } from './pages/AuditTrail';
import { SystemCheck } from './pages/SystemCheck';
import { GeocodeSetup } from './pages/GeocodeSetup';
import { FormDesigner } from './pages/FormDesigner';
import { Labels } from './pages/Labels';
import { Home, ShoppingCart, FileBarChart, Settings, Star, Menu, Clock, X, ChevronRight } from 'lucide-react';
import type { SalesModuleMode } from './pages/SalesOrders';
import type { MenuCategory, MenuItem } from './types/menu';

function normalizeMenuSlug(pageId: string): string {
  if (!pageId.startsWith('menu-')) return '';
  const firstDash = pageId.indexOf('-', 5);
  return firstDash > -1 ? pageId.slice(firstDash + 1) : '';
}

function normalizedSlugKey(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSalesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  if (!key) return false;
  return [
    'sales',
    'order',
    'invoice',
    'debtor',
    'customer',
    'quotation',
    'countersales',
    'credit',
    'topitems',
    'dailysalesinquiry',
    'pdflowgp',
    'pdfpricelist',
    'pdforderstatus',
    'pdfordersinvoiced',
    'pdfdeliverydifferences',
    'pdfdifot',
    'salesinquiry',
    'selectorderitems',
    'specialorder',
    'recurringsalesordersprocess',
    'selectrecurringsalesorder',
    'selectcompletedorder',
    'selectsalesorder',
  ].some((keyword) => key.includes(keyword));
}

function isGeneralLedgerMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  if (!key) return false;
  return [
    'gl',
    'journal',
    'bankaccount',
    'bankmatching',
    'bankreconciliation',
    'accountgroup',
    'accountsection',
    'glaccount',
    'trialbalance',
    'balancesheet',
    'profitloss',
    'cashflows',
    'gltag',
    'selectglaccount',
    'glaccountgraph',
    'glaccountreport',
    'glaccountcsv',
    'dailybanktransactions',
    'importbanktrans',
    'customerreceipt',
    'payment',
  ].some((keyword) => key.includes(keyword));
}

function isGeneralLedgerPathSegment(segment: string): boolean {
  const key = segment.toLowerCase().replace(/[^a-z0-9]/g, '');
  return key === 'generalledger' || key === 'gl';
}

function isCompanyPreferencesMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'companypreferences' || key.includes('companypreferences');
}

function isSystemParametersMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'systemparameters' || key.includes('systemparameters');
}

function isAuditTrailMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'audittrail' || key.includes('audittrail');
}

function isSystemCheckMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'systemcheck' || key.includes('systemcheck');
}

function isGeocodeSetupMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'geocodesetup' || key.includes('geocodesetup');
}

function isFormDesignerMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'formdesigner' || key.includes('formdesigner') || key.includes('documenttemplate');
}

function isLabelsMenuSlug(slug: string): boolean {
  const key = normalizedSlugKey(slug);
  return key === 'labels' || key.includes('labeltemplates') || key.includes('pricelabels');
}

type GeneralLedgerView = 'transactions' | 'accounts';

function resolveGeneralLedgerView(slug: string): GeneralLedgerView {
  const key = normalizedSlugKey(slug);

  if (
    key.includes('accountsection') ||
    key.includes('accountgroup') ||
    key.includes('glaccounts')
  ) {
    return 'accounts';
  }

  if (
    key.includes('trialbalance') ||
    key.includes('balancesheet') ||
    key.includes('profitloss') ||
    key.includes('cashflows') ||
    key.includes('gltag') ||
    key.includes('analysishorizontal') ||
    key.includes('tax')
  ) {
    return 'transactions';
  }

  return 'transactions';
}

function resolveSalesMode(slug: string): SalesModuleMode {
  const key = normalizedSlugKey(slug);

  const reportKeywords = [
    'report',
    'analysis',
    'inquiry',
    'statement',
    'aged',
    'status',
    'pdfpricelist',
    'pdforderstatus',
    'pdfordersinvoiced',
    'dailysalesinquiry',
    'pdfdeliverydifferences',
    'pdfdifot',
    'salesinquiry',
    'topitems',
    'pdflowgp',
    'selectcompletedorder',
  ];
  const settingsKeywords = [
    'setup',
    'config',
    'maintenance',
    'type',
    'salestypes',
    'sales-types',
    'price',
    'discount',
    'paymentterms',
    'payment-terms',
    'salespeople',
    'salesman',
    'holdreasons',
    'hold-reasons',
    'maintenance',
    'contract',
  ];

  if (reportKeywords.some((keyword) => key.includes(keyword))) return 'reports';
  if (settingsKeywords.some((keyword) => key.includes(keyword))) return 'settings';
  return 'transactions';
}

function menuSlugToTitle(slug: string): string {
  if (!slug) return 'Module';
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type MenuNode = MenuCategory | MenuItem;

function parseMenuNodeId(pageId: string): number | null {
  if (!pageId.startsWith('menu-')) return null;
  const firstDash = pageId.indexOf('-', 5);
  if (firstDash <= 5) return null;
  const rawId = pageId.slice(5, firstDash);
  const id = Number(rawId);
  return Number.isFinite(id) ? id : null;
}

function findMenuNodeById(nodes: MenuNode[], id: number): MenuNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const children = node.children as MenuNode[] | undefined;
    if (!children || children.length === 0) continue;
    const match = findMenuNodeById(children, id);
    if (match) return match;
  }
  return null;
}

function AppContent() {
  const { currentPage, mobileSidebarOpen, appMenu } = useApp();

  const renderCurrentPage = () => {
    if (currentPage.startsWith('main-')) {
      const mainId = parseInt(currentPage.replace('main-', ''), 10);
      const mainModule = appMenu.find((item) => item.id === mainId);

      return (
        <div className="p-4 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            {mainModule?.caption ?? 'Module'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Select a submenu from the right panel to continue.
          </p>
        </div>
      );
    }

    const menuSlug = normalizeMenuSlug(currentPage);
    const primaryPathSegment = window.location.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    const menuNodeId = parseMenuNodeId(currentPage);
    const currentMenuNode = menuNodeId !== null ? findMenuNodeById(appMenu as MenuNode[], menuNodeId) : null;
    const currentMenuHref = currentMenuNode?.href ?? '';
    const currentMenuCaption = currentMenuNode?.caption ?? '';

    if (menuSlug) {
      if (isCompanyPreferencesMenuSlug(menuSlug)) {
        return <CompanyPreferences />;
      }

      if (isSystemParametersMenuSlug(menuSlug)) {
        return <SystemParameters />;
      }

      if (isAuditTrailMenuSlug(menuSlug)) {
        return <AuditTrail />;
      }

      if (isSystemCheckMenuSlug(menuSlug)) {
        return <SystemCheck />;
      }

      if (isGeocodeSetupMenuSlug(menuSlug)) {
        return <GeocodeSetup />;
      }

      if (isFormDesignerMenuSlug(menuSlug)) {
        return <FormDesigner />;
      }

      if (isLabelsMenuSlug(menuSlug)) {
        return <Labels />;
      }

      if (isGeneralLedgerPathSegment(primaryPathSegment) || isGeneralLedgerMenuSlug(menuSlug)) {
        const glView = resolveGeneralLedgerView(menuSlug);
        if (glView === 'accounts') {
          return <ChartOfAccounts sourceSlug={menuSlug} />;
        }
        return <GeneralLedger sourceSlug={menuSlug} sourceHref={currentMenuHref} sourceCaption={currentMenuCaption} />;
      }

      if (primaryPathSegment === 'sales' || isSalesMenuSlug(menuSlug)) {
        return <SalesOrders mode={resolveSalesMode(menuSlug)} sourceSlug={menuSlug} />;
      }

      return (
        <div className="p-4 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
            {menuSlugToTitle(menuSlug)}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            This module is not available yet.
          </p>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'accounts':
        return <ChartOfAccounts />;
      case 'general-ledger':
        return <GeneralLedger sourceSlug="general-ledger" sourceCaption="General Ledger" />;
      case 'receivables':
        return <AccountsReceivable />;
      case 'payables':
        return <AccountsPayable />;
      case 'inventory':
        return <Inventory />;
      case 'sales-orders':
        return <SalesOrders mode="transactions" sourceSlug="sales-orders" />;
      case 'purchase-orders':
        return <PurchaseOrders />;
      case 'financial-reports':
        return <FinancialReports />;
      case 'users':
        return <UserManagement />;
      case 'companypreferences':
      case 'company-preferences':
        return <CompanyPreferences />;
      case 'systemparameters':
      case 'system-parameters':
        return <SystemParameters />;
      case 'audittrail':
      case 'audit-trail':
        return <AuditTrail />;
      case 'systemcheck':
      case 'system-check':
        return <SystemCheck />;
      case 'geocodesetup':
      case 'geocode-setup':
        return <GeocodeSetup />;
      case 'formdesigner':
      case 'form-designer':
      case 'document-template-designer':
        return <FormDesigner />;
      case 'labels':
      case 'label-templates':
      case 'price-labels':
        return <Labels />;
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
        return <SalesOrders mode="reports" sourceSlug="sales-analysis" />;
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
    <div className="flex h-screen flex-col overflow-hidden bg-[#f2eeee] transition-colors duration-300 dark:bg-slate-950">
      {/* Desktop: Sidebar on left - Mobile: Header on top */}
      <div className="hidden lg:flex h-full">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <OfflineStatusBar />
          <main className="flex-1 overflow-auto bg-[#f2eeee] transition-colors duration-300 dark:bg-slate-950">
            {renderCurrentPage()}
          </main>
        </div>
      </div>
      
      {/* Mobile Layout: Header on top, content in middle, sidebar at bottom */}
      <div className="lg:hidden flex flex-col h-full">
        {/* Mobile Header - Simple version */}
        <MobileHeader />
        <OfflineStatusBar compact />
        
        {/* Main content area */}
        <main className="flex-1 overflow-auto bg-[#f2eeee] pb-20 transition-colors duration-300 dark:bg-slate-950 lg:pb-0">
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
    <header className="flex-shrink-0 border-b border-white/70 bg-[#f2eeee]/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex items-center justify-between">
        {/* Left: Menu button and Logo */}
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setMobileSidebarOpen(true)}
            className="-ml-2 rounded-full bg-white/78 p-2 text-slate-600 shadow-sm shadow-slate-200/60 hover:bg-white dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 dark:bg-white">
              <span className="text-white dark:text-gray-900 font-bold text-sm">A</span>
            </div>
            <span className="text-sm font-semibold text-slate-950 dark:text-white">Akiva</span>
          </div>
        </div>
        
        {/* Right side actions */}
        <div className="flex items-center space-x-1">
          <button 
            onClick={toggleDarkMode}
            className="rounded-full bg-white/78 p-2 text-slate-600 shadow-sm shadow-slate-200/60 hover:bg-white dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800"
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
          
          <button className="relative rounded-full bg-white/78 p-2 text-slate-600 shadow-sm shadow-slate-200/60 hover:bg-white dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 shadow-sm shadow-rose-600/20 dark:bg-rose-500">
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
    if (itemId === 'dashboard') {
      setCurrentPage('dashboard');
      setMobileSidebarOpen(false);
      return;
    }

    setMobileSidebarOpen(true);
  };
  
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex-shrink-0 border-t border-white/70 bg-[#f2eeee]/95 px-2 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
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
                  ? 'bg-white text-rose-600 shadow-sm shadow-slate-200/60 dark:bg-slate-900 dark:text-rose-300 dark:shadow-black/20'
                  : 'text-slate-500 dark:text-slate-400'
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
          className="flex h-12 min-w-[50px] flex-col items-center justify-center rounded-lg px-1 text-slate-500 transition-all duration-200 dark:text-slate-400"
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
      <div 
        className="absolute bottom-0 left-0 top-0 w-80 max-w-[85vw] overflow-y-auto bg-[#f7f4f4] shadow-xl dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/70 px-4 py-4 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 dark:bg-white">
              <span className="text-white dark:text-gray-900 font-bold text-lg">A</span>
            </div>
            <span className="font-semibold text-slate-950 dark:text-white">Akiva</span>
          </div>
          <button 
            onClick={() => setMobileSidebarOpen(false)}
            className="rounded-full bg-white/78 p-2 text-slate-600 shadow-sm hover:bg-white dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
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
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900'
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
                <div className="flex items-center space-x-3 px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400">
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
                        ? 'bg-white text-rose-700 shadow-sm dark:bg-slate-900 dark:text-rose-300'
                        : 'text-slate-600 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-900'
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
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900'
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
                ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/20'
                : 'text-slate-700 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-900'
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
      <div className="h-screen bg-[#f2eeee] transition-colors duration-300 dark:bg-slate-950">
        <AppContent />
      </div>
    </AppProvider>
  );
}

export default App;
