import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Star, 
  Clock, 
  ShoppingCart, 
  Target, 
  Home, 
  FileBarChart, 
  ChevronDown,
  Plus,
  Settings,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Menu,
  Shield
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

const iconSidebarItems = [
  { id: 'dashboard', icon: Home, label: 'Dashboard' },
  { id: 'transactions', icon: ShoppingCart, label: 'Transactions' },
  { id: 'inquiries', icon: FileBarChart, label: 'Inquiries & Reports' },
  { id: 'maintenance', icon: Settings, label: 'Maintenance' },
  { id: 'starred', icon: Star, label: 'Starred' },
  { id: 'recent', icon: Clock, label: 'Recent' },
];

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'transactions', label: 'Transactions', icon: ShoppingCart, hasSubmenu: true },
  { id: 'inquiries', label: 'Inquiries & Reports', icon: FileBarChart, hasSubmenu: true },
  { id: 'maintenance', label: 'Maintenance', icon: Settings, hasSubmenu: true },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'recent', label: 'Recent', icon: Clock },
];

const submenuItems = {
  transactions: [
    { id: 'sales-orders', label: 'Sales Orders', hasSubmenu: true },
    { id: 'purchase-orders', label: 'Purchase Orders', hasSubmenu: true },
    { id: 'general-ledger', label: 'General Ledger', hasSubmenu: true },
    { id: 'inventory', label: 'Inventory', hasSubmenu: true }
  ],
  inquiries: [
    { id: 'financial-reports', label: 'Financial Reports', hasSubmenu: true },
    { id: 'sales-reports', label: 'Sales Reports', hasSubmenu: true },
    { id: 'purchase-reports', label: 'Purchase Reports', hasSubmenu: true },
    { id: 'inventory-reports', label: 'Inventory Reports', hasSubmenu: true },
    { id: 'gl-reports', label: 'GL Reports', hasSubmenu: true }
  ],
  maintenance: [
    { id: 'accounts', label: 'Chart of Accounts' },
    { id: 'receivables', label: 'Accounts Receivable' },
    { id: 'payables', label: 'Accounts Payable' },
    { id: 'users', label: 'User Management' },
    { id: 'company-setup', label: 'Company Setup' },
    { id: 'system-setup', label: 'System Setup' }
  ]
};

const subSubmenuItems = {
  'sales-orders': [
    { id: 'sales-orders', label: 'Sales Orders' },
    { id: 'sales-invoices', label: 'Sales Invoices' },
    { id: 'credit-notes', label: 'Credit Notes' },
    { id: 'customer-payments', label: 'Customer Payments' }
  ],
  'purchase-orders': [
    { id: 'purchase-orders', label: 'Purchase Orders' },
    { id: 'purchase-invoices', label: 'Purchase Invoices' },
    { id: 'supplier-payments', label: 'Supplier Payments' },
    { id: 'grn', label: 'Goods Received Notes' }
  ],
  'general-ledger': [
    { id: 'general-ledger', label: 'Journal Entries' },
    { id: 'bank-accounts', label: 'Bank Accounts' },
    { id: 'bank-reconciliation', label: 'Bank Reconciliation' },
    { id: 'fixed-assets', label: 'Fixed Assets' }
  ],
  'inventory': [
    { id: 'inventory', label: 'Stock Items' },
    { id: 'stock-movements', label: 'Stock Movements' },
    { id: 'stock-adjustments', label: 'Stock Adjustments' },
    { id: 'stock-transfers', label: 'Stock Transfers' }
  ],
  'financial-reports': [
    { id: 'financial-reports', label: 'Balance Sheet' },
    { id: 'profit-loss', label: 'Profit & Loss' },
    { id: 'trial-balance', label: 'Trial Balance' },
    { id: 'cash-flow', label: 'Cash Flow Statement' }
  ],
  'sales-reports': [
    { id: 'sales-analysis', label: 'Sales Analysis' },
    { id: 'customer-statements', label: 'Customer Statements' },
    { id: 'aged-debtors', label: 'Aged Debtors' },
    { id: 'sales-by-customer', label: 'Sales by Customer' }
  ],
  'purchase-reports': [
    { id: 'purchase-analysis', label: 'Purchase Analysis' },
    { id: 'aged-creditors', label: 'Aged Creditors' },
    { id: 'supplier-statements', label: 'Supplier Statements' },
    { id: 'purchase-by-supplier', label: 'Purchase by Supplier' }
  ],
  'inventory-reports': [
    { id: 'stock-status', label: 'Stock Status' },
    { id: 'stock-valuation', label: 'Stock Valuation' },
    { id: 'reorder-level', label: 'Reorder Level Report' },
    { id: 'stock-usage', label: 'Stock Usage Report' }
  ],
  'gl-reports': [
    { id: 'account-listing', label: 'Account Listing' },
    { id: 'gl-inquiry', label: 'GL Account Inquiry' },
    { id: 'bank-statements', label: 'Bank Statements' },
    { id: 'tax-reports', label: 'Tax Reports' }
  ]
};

export function Sidebar() {
  const { 
    currentPage, 
    setCurrentPage, 
    iconSidebarExpanded, 
    setIconSidebarExpanded,
    expandIconSidebar,
    collapseIconSidebar,
    sidebarCollapsed,
    setSidebarCollapsed,
    iconSidebarWidth,
    setIconSidebarWidth,
    mainSidebarWidth,
    setMainSidebarWidth
  } = useApp();
  
  const [expandedItems, setExpandedItems] = useState<string[]>(['dashboard', 'reports']);
  const [expandedSubItems, setExpandedSubItems] = useState<string[]>(['sales-orders', 'financial-reports']);
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);
  const [isResizingIcon, setIsResizingIcon] = useState(false);
  const [isResizingMain, setIsResizingMain] = useState(false);
  const [isHoveringIconSidebar, setIsHoveringIconSidebar] = useState(false);
  
  const iconSidebarRef = useRef<HTMLDivElement>(null);
  const mainSidebarRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Handle hover to expand icon sidebar (like Instagram)
  const handleMouseEnterIconSidebar = useCallback(() => {
    if (!iconSidebarExpanded) {
      expandIconSidebar();
    }
  }, [iconSidebarExpanded, expandIconSidebar]);

  const handleMouseLeaveIconSidebar = useCallback(() => {
    if (iconSidebarExpanded) {
      collapseIconSidebar();
    }
  }, [iconSidebarExpanded, collapseIconSidebar]);

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const toggleSubExpanded = (itemId: string) => {
    setExpandedSubItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleIconClick = (itemId: string) => {
    if (iconSidebarExpanded) {
      setCurrentPage(itemId);
    } else {
      setIconSidebarExpanded(true);
      setCurrentPage(itemId);
    }
  };

  // Icon sidebar resize handlers
  const handleIconMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingIcon(true);
  }, []);

  const handleIconMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingIcon) return;
    
    const newWidth = Math.max(64, Math.min(400, e.clientX));
    setIconSidebarWidth(newWidth);
    
    if (newWidth > 120 && !iconSidebarExpanded) {
      setIconSidebarExpanded(true);
    } else if (newWidth <= 120 && iconSidebarExpanded) {
      setIconSidebarExpanded(false);
    }
  }, [isResizingIcon, iconSidebarExpanded, setIconSidebarWidth, setIconSidebarExpanded]);

  const handleIconMouseUp = useCallback(() => {
    setIsResizingIcon(false);
  }, []);

  // Main sidebar resize handlers
  const handleMainMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingMain(true);
  }, []);

  const handleMainMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingMain) return;
    
    const iconWidth = iconSidebarWidth;
    const newWidth = Math.max(200, Math.min(500, e.clientX - iconWidth));
    setMainSidebarWidth(newWidth);
    
    if (newWidth < 150 && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    } else if (newWidth >= 150 && sidebarCollapsed) {
      setSidebarCollapsed(false);
    }
  }, [isResizingMain, iconSidebarWidth, sidebarCollapsed, setMainSidebarWidth, setSidebarCollapsed]);

  const handleMainMouseUp = useCallback(() => {
    setIsResizingMain(false);
  }, []);

  // Global mouse event listeners
  useEffect(() => {
    if (isResizingIcon) {
      document.addEventListener('mousemove', handleIconMouseMove);
      document.addEventListener('mouseup', handleIconMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleIconMouseMove);
      document.removeEventListener('mouseup', handleIconMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingIcon, handleIconMouseMove, handleIconMouseUp]);

  useEffect(() => {
    if (isResizingMain) {
      document.addEventListener('mousemove', handleMainMouseMove);
      document.addEventListener('mouseup', handleMainMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMainMouseMove);
      document.removeEventListener('mouseup', handleMainMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingMain, handleMainMouseMove, handleMainMouseUp]);

  return (
    <div className="flex h-screen">
      {/* Left Icon Sidebar - Hover to expand */}
      <div 
        ref={iconSidebarRef}
        className="bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col transition-all duration-300 ease-in-out relative"
        style={{ width: `${iconSidebarWidth}px` }}
        onMouseEnter={handleMouseEnterIconSidebar}
        onMouseLeave={handleMouseLeaveIconSidebar}
      >
        {/* Resize Handle */}
        <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-500 dark:hover:bg-brand-400 hover:w-1.5 transition-all duration-200 z-10"
        onMouseDown={handleIconMouseDown}
        />

        {/* Toggle Button - toggles second sidebar */}
        <div className="absolute -right-3 top-6 z-20">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-6 h-6 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-all duration-200"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            ) : (
              <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>

        <div className="flex flex-col h-full">
          {/* Top Section - Logo & Navigation */}
          <div className={`flex flex-col py-4 space-y-4 overflow-hidden ${iconSidebarExpanded ? 'items-start px-2' : 'items-center'}`}>
            {/* Logo */}
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0 shadow-lg">
                <span className="text-white dark:text-gray-900 font-bold text-lg">A</span>
              </div>
              {iconSidebarExpanded && iconSidebarWidth > 120 && (
                <span className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">Akiva ERP</span>
              )}
            </div>
            
            {/* Icon Navigation */}
            {iconSidebarItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <div key={item.id} className="relative w-full flex-shrink-0">
                  <button
                    onClick={() => handleIconClick(item.id)}
                    onMouseEnter={() => !iconSidebarExpanded && setHoveredIcon(item.id)}
                    onMouseLeave={() => setHoveredIcon(null)}
                    className={`h-10 rounded-full flex items-center transition-all duration-300 ${
                      isActive
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25 dark:shadow-brand-500/40'
                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800'
                    } ${iconSidebarExpanded ? 'w-full justify-start px-4 rounded-lg' : 'w-10 justify-center mx-auto'}`}
                    style={{ 
                      width: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px',
                      maxWidth: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px'
                    }}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {iconSidebarExpanded && iconSidebarWidth > 120 && (
                      <span className="ml-3 text-sm font-medium truncate text-gray-900 dark:text-white">{item.label}</span>
                    )}
                  </button>
                  
                  {/* Tooltip */}
                  {!iconSidebarExpanded && hoveredIcon === item.id && (
                    <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 bg-gray-900 dark:bg-slate-800 text-white dark:text-gray-100 px-2 py-1 rounded text-xs whitespace-nowrap z-50 shadow-lg border border-gray-700 dark:border-slate-600">
                      {item.label}
                      <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900 dark:border-r-slate-800"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bottom Section - Fixed at bottom */}
          <div className={`mt-auto pb-4 flex flex-col space-y-2 ${iconSidebarExpanded ? 'items-start px-2' : 'items-center'}`}>
            {/* Notifications */}
            <div className="relative w-full flex-shrink-0">
              <button 
                onMouseEnter={() => !iconSidebarExpanded && setHoveredIcon('notifications')}
                onMouseLeave={() => setHoveredIcon(null)}
                className={`h-10 bg-brand-500 hover:bg-brand-600 rounded-full flex items-center justify-center text-white relative transition-all duration-300 ${
                  iconSidebarExpanded ? 'w-full justify-start px-4 rounded-lg' : 'w-10 justify-center'
                }`}
                style={{ 
                  width: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px',
                  maxWidth: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px'
                }}
              >
                <span className="text-lg font-light flex-shrink-0">A</span>
                {iconSidebarExpanded && iconSidebarWidth > 120 && (
                  <span className="ml-3 text-sm font-medium truncate">Notifications</span>
                )}
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                  <span className="text-white text-xs font-medium">3</span>
                </div>
              </button>
              
              {!iconSidebarExpanded && hoveredIcon === 'notifications' && (
                <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 bg-gray-900 dark:bg-slate-800 text-white dark:text-gray-100 px-2 py-1 rounded text-xs whitespace-nowrap z-50 shadow-lg border border-gray-700 dark:border-slate-600">
                  Notifications (3)
                  <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900 dark:border-r-slate-800"></div>
                </div>
              )}
            </div>
            
            {/* Settings - At the bottom */}
            <div className="relative w-full flex-shrink-0">
              <button 
                onMouseEnter={() => !iconSidebarExpanded && setHoveredIcon('settings')}
                onMouseLeave={() => setHoveredIcon(null)}
                className={`h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all duration-300 ${
                  iconSidebarExpanded ? 'w-full justify-start px-4 rounded-lg' : 'w-10 justify-center'
                }`}
                style={{ 
                  width: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px',
                  maxWidth: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px'
                }}
              >
                <Settings className="w-5 h-5 flex-shrink-0" />
                {iconSidebarExpanded && iconSidebarWidth > 120 && (
                  <span className="ml-3 text-sm font-medium text-gray-600 dark:text-gray-300 truncate">Settings</span>
                )}
              </button>
              
              {!iconSidebarExpanded && hoveredIcon === 'settings' && (
                <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 bg-gray-900 dark:bg-slate-800 text-white dark:text-gray-100 px-2 py-1 rounded text-xs whitespace-nowrap z-50 shadow-lg border border-gray-700 dark:border-slate-600">
                  Settings
                  <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900 dark:border-r-slate-800"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Sidebar */}
      <div 
        ref={mainSidebarRef}
        className={`bg-gray-50 dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col transition-all duration-300 ease-in-out overflow-hidden relative ${
          sidebarCollapsed ? 'w-0' : ''
        }`}
        style={{ width: sidebarCollapsed ? '0px' : `${mainSidebarWidth}px` }}
      >
        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-500 dark:hover:bg-brand-400 hover:w-1.5 transition-all duration-200 z-10"
          onMouseDown={handleMainMouseDown}
        />

        {/* Toggle Button */}
        <div className="absolute -right-3 top-6 z-20">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-6 h-6 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-all duration-200"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            ) : (
              <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Header - Company Selector */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <div className="relative">
                <select 
                  className="w-full bg-transparent border-none text-sm font-medium text-gray-900 dark:text-white focus:ring-0 cursor-pointer appearance-none pr-6"
                  defaultValue="Entice Tech Ltd"
                >
                  <option className="dark:bg-slate-800">Entice Tech Ltd</option>
                  <option className="dark:bg-slate-800">Sample Company 2</option>
                  <option className="dark:bg-slate-800">Sample Company 3</option>
                </select>
                <ChevronDown className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isExpanded = expandedItems.includes(item.id);
                const isActive = currentPage === item.id;
                
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        if (item.hasSubmenu) {
                          toggleExpanded(item.id);
                        } else {
                          setCurrentPage(item.id);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg transition-all duration-200 text-sm ${
                        isActive
                          ? 'bg-brand-100 dark:bg-brand-dark-100 text-brand-900 dark:text-brand-dark-text font-medium'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center min-w-0">
                        <Icon className="w-4 h-4 mr-3 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.hasSubmenu && (
                        <Plus className={`w-4 h-4 transition-transform duration-200 flex-shrink-0 text-gray-400 dark:text-gray-500 ${
                          isExpanded ? 'rotate-45' : ''
                        }`} />
                      )}
                    </button>
                    
                    {item.hasSubmenu && isExpanded && (
                      <div className="ml-7 mt-1 space-y-1">
                        {submenuItems[item.id as keyof typeof submenuItems]?.map((subItem, subIndex) => {
                          const subItemObj = subItem as { id: string; label: string; hasSubmenu?: boolean };
                          if (subItemObj.hasSubmenu) {
                            const isSubExpanded = expandedSubItems.includes(subItemObj.id);
                            return (
                              <div key={subIndex}>
                                <button
                                  onClick={() => toggleSubExpanded(subItemObj.id)}
                                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200"
                                >
                                  <span className="truncate">{subItemObj.label}</span>
                                  <ChevronUp className={`w-3 h-3 transition-transform duration-200 flex-shrink-0 ${
                                    isSubExpanded ? 'rotate-180' : ''
                                  }`} />
                                </button>
                                
                                {isSubExpanded && subSubmenuItems[subItemObj.id as keyof typeof subSubmenuItems] && (
                                  <div className="ml-4 mt-1 space-y-1">
                                    {subSubmenuItems[subItemObj.id as keyof typeof subSubmenuItems].map((subSubItem, subSubIndex) => (
                                      <button
                                        key={subSubIndex}
                                        onClick={() => setCurrentPage(subSubItem.id)}
                                        className={`w-full text-left px-3 py-1.5 text-sm transition-all duration-200 rounded ${
                                          currentPage === subSubItem.id
                                            ? 'bg-brand-200 dark:bg-brand-dark-200 text-brand-900 dark:text-brand-dark-text font-medium'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
                                        }`}
                                      >
                                        <span className="truncate">{subSubItem.label}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            return (
                              <button
                                key={subIndex}
                                onClick={() => setCurrentPage(subItemObj.id)}
                                className={`w-full text-left px-3 py-1.5 text-sm transition-all duration-200 rounded ${
                                  currentPage === subItemObj.id
                                    ? 'bg-brand-200 dark:bg-brand-dark-200 text-brand-900 dark:text-brand-dark-text font-medium'
                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
                                }`}
                              >
                                <span className="truncate">{subItemObj.label}</span>
                              </button>
                            );
                          }
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* System Administration - Fixed at very bottom */}
            <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex-shrink-0 mt-auto">
              <button className="w-full flex items-center px-3 py-2 text-left text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200">
                <Shield className="w-4 h-4 mr-3 flex-shrink-0" />
                <span className="truncate">System Administration</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
