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
  Menu
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
  
  const iconSidebarRef = useRef<HTMLDivElement>(null);
  const mainSidebarRef = useRef<HTMLDivElement>(null);

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
    
    // Auto-expand/collapse based on width
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
    
    // Auto-expand/collapse based on width
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
    <div className="flex h-full">
      {/* Left Icon Sidebar */}
      <div 
        ref={iconSidebarRef}
        className="bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ease-in-out relative"
        style={{ width: `${iconSidebarWidth}px` }}
      >
        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 dark:hover:bg-blue-400 hover:w-1.5 transition-all duration-200 z-10"
          onMouseDown={handleIconMouseDown}
        />

        {/* Toggle Button */}
        <div className="absolute -right-3 top-6 z-20">
          <button
            onClick={() => setIconSidebarExpanded(!iconSidebarExpanded)}
            className="w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
          >
            {iconSidebarExpanded ? (
              <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>

        <div className="flex flex-col items-center py-4 space-y-4 overflow-hidden">
          {/* Logo */}
          <div className="w-10 h-10 bg-black dark:bg-white rounded-full flex items-center justify-center mb-4 flex-shrink-0">
            <span className="text-white dark:text-black font-bold text-lg">W</span>
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
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 mx-auto ${
                    isActive
                      ? 'bg-blue-500 text-white shadow-lg'
                      : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  } ${iconSidebarExpanded ? 'w-full justify-start px-4 rounded-lg mx-2' : ''}`}
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
                  <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 bg-gray-900 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50 shadow-lg">
                    {item.label}
                    <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900"></div>
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Spacer */}
          <div className="flex-1"></div>
          
          {/* Bottom Icons */}
          <div className="relative w-full flex-shrink-0">
            <button 
              onMouseEnter={() => !iconSidebarExpanded && setHoveredIcon('notifications')}
              onMouseLeave={() => setHoveredIcon(null)}
              className={`w-10 h-10 bg-pink-500 rounded-full flex items-center justify-center text-white relative transition-all duration-200 mx-auto ${
                iconSidebarExpanded ? 'w-full justify-start px-4 rounded-lg mx-2' : ''
              }`}
              style={{ 
                width: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px',
                maxWidth: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px'
              }}
            >
              <span className="text-lg font-light flex-shrink-0">C</span>
              {iconSidebarExpanded && iconSidebarWidth > 120 && (
                <span className="ml-3 text-sm font-medium truncate">Notifications</span>
              )}
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-medium">3</span>
              </div>
            </button>
            
            {!iconSidebarExpanded && hoveredIcon === 'notifications' && (
              <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 bg-gray-900 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50 shadow-lg">
                Notifications (3)
                <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900"></div>
              </div>
            )}
          </div>
          
          <div className="relative w-full flex-shrink-0">
            <button 
              onMouseEnter={() => !iconSidebarExpanded && setHoveredIcon('settings')}
              onMouseLeave={() => setHoveredIcon(null)}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all duration-200 mx-auto ${
                iconSidebarExpanded ? 'w-full justify-start px-4 rounded-lg mx-2' : ''
              }`}
              style={{ 
                width: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px',
                maxWidth: iconSidebarExpanded ? `${iconSidebarWidth - 16}px` : '40px'
              }}
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              {iconSidebarExpanded && iconSidebarWidth > 120 && (
                <span className="ml-3 text-sm font-medium text-gray-600 truncate">Settings</span>
              )}
            </button>
            
            {!iconSidebarExpanded && hoveredIcon === 'settings' && (
              <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 bg-gray-900 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-50 shadow-lg">
                Settings
                <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900"></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Navigation Sidebar */}
      <div 
        ref={mainSidebarRef}
        className={`bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ease-in-out overflow-hidden relative ${
          sidebarCollapsed ? 'w-0' : ''
        }`}
        style={{ width: sidebarCollapsed ? '0px' : `${mainSidebarWidth}px` }}
      >
        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 dark:hover:bg-blue-400 hover:w-1.5 transition-all duration-200 z-10"
          onMouseDown={handleMainMouseDown}
        />

        {/* Toggle Button */}
        <div className="absolute -right-3 top-6 z-20">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow"
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
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white dark:text-black font-bold text-sm">W</span>
                </div>
                <div className="flex items-center space-x-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white truncate">webERP Pro</span>
                  <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                </div>
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
                      className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg transition-colors text-sm ${
                        isActive
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 font-medium'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center min-w-0">
                        <Icon className="w-4 h-4 mr-3 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.hasSubmenu && (
                        <Plus className={`w-4 h-4 transition-transform flex-shrink-0 text-gray-400 dark:text-gray-500 ${
                          isExpanded ? 'rotate-45' : ''
                        }`} />
                      )}
                    </button>
                    
                    {item.hasSubmenu && isExpanded && (
                      <div className="ml-7 mt-1 space-y-1">
                        {submenuItems[item.id as keyof typeof submenuItems]?.map((subItem, subIndex) => {
                          if (typeof subItem === 'object' && subItem.hasSubmenu) {
                            const isSubExpanded = expandedSubItems.includes(subItem.id);
                            return (
                              <div key={subIndex}>
                                <button
                                  onClick={() => toggleSubExpanded(subItem.id)}
                                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                                >
                                  <span className="truncate">{subItem.label}</span>
                                  <ChevronUp className={`w-3 h-3 transition-transform flex-shrink-0 ${
                                    isSubExpanded ? 'rotate-180' : ''
                                  }`} />
                                </button>
                                
                                {isSubExpanded && subSubmenuItems[subItem.id as keyof typeof subSubmenuItems] && (
                                  <div className="ml-4 mt-1 space-y-1">
                                    {subSubmenuItems[subItem.id as keyof typeof subSubmenuItems].map((subSubItem, subSubIndex) => (
                                      <button
                                        key={subSubIndex}
                                        onClick={() => setCurrentPage(subSubItem.id)}
                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors rounded ${
                                          currentPage === subSubItem.id
                                            ? 'bg-gray-200 text-gray-900 font-medium'
                                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
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
                            const menuItem = typeof subItem === 'object' ? subItem : { id: subItem.toLowerCase().replace(/\s+/g, '-'), label: subItem };
                            return (
                              <button
                                key={subIndex}
                                onClick={() => setCurrentPage(menuItem.id)}
                                className={`w-full text-left px-3 py-1.5 text-sm transition-colors rounded ${
                                  currentPage === menuItem.id
                                    ? 'bg-gray-200 text-gray-900 font-medium'
                                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                              >
                                <span className="truncate">{menuItem.label}</span>
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

            {/* Bottom section */}
            <div className="p-4 border-t border-gray-200 flex-shrink-0">
              <button className="w-full flex items-center px-3 py-2 text-left text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                <Menu className="w-4 h-4 mr-3 flex-shrink-0" />
                <span className="truncate">System Administration</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}