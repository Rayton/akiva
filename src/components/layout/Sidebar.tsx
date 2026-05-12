import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Settings,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Shield,
  Loader2,
  LayoutGrid,
  ShoppingCart,
  Wallet,
  CreditCard,
  ShoppingBag,
  Package,
  Factory,
  BookOpen,
  Building2,
  Banknote,
  FileText,
  FolderOpen,
  FileBarChart2,
  Search,
  Wrench,
  ArrowRightLeft,
  ListChecks,
  ClipboardList,
  type LucideIcon
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { fetchMenu, hrefToSlug } from '../../data/menuApi';
import { MenuCategory } from '../../types/menu';
import { SearchableSelect } from '../common/SearchableSelect';

const MAIN_MENU_ICONS: Record<string, LucideIcon> = {
  sales: ShoppingCart,
  receivables: Wallet,
  payables: CreditCard,
  purchases: ShoppingBag,
  inventory: Package,
  manufacturing: Factory,
  'general ledger': BookOpen,
  'asset manager': Building2,
  'petty cash': Banknote,
  configuration: Settings,
};

function getMainMenuIcon(caption: string): LucideIcon {
  const key = caption.toLowerCase().trim();
  return MAIN_MENU_ICONS[key] ?? LayoutGrid;
}

function menuPageId(id: number, caption: string, href?: string): string {
  const fallbackSlug = caption.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const slug = hrefToSlug(href ?? '') || fallbackSlug;
  return `menu-${id}-${slug}`;
}

function menuSlug(caption: string, href?: string): string {
  const fallbackSlug = caption.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  return hrefToSlug(href ?? '') || fallbackSlug;
}

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized === '' ? '/' : normalized;
}

interface MenuRouteIndex {
  pathToPageId: Map<string, string>;
  pageIdToPath: Map<string, string>;
  pageIdToMainId: Map<string, number>;
  pageIdToExpandIds: Map<string, string[]>;
}

function buildMenuRouteIndex(mainMenus: MenuCategory[]): MenuRouteIndex {
  const pathToPageId = new Map<string, string>();
  const pageIdToPath = new Map<string, string>();
  const pageIdToMainId = new Map<string, number>();
  const pageIdToExpandIds = new Map<string, string[]>();

  const visitNode = (
    node: MenuCategory,
    mainSlug: string,
    parentSegments: string[],
    mainId: number,
    depth: number,
    expandTrail: string[]
  ) => {
    const slug = menuSlug(node.caption, node.href);
    const segments = [mainSlug, ...parentSegments, slug];
    const path = '/' + segments.join('/');
    const pageId = menuPageId(node.id, node.caption, node.href);

    pathToPageId.set(path, pageId);
    pageIdToPath.set(pageId, path);
    pageIdToMainId.set(pageId, mainId);
    pageIdToExpandIds.set(pageId, expandTrail);

    if (!node.children || node.children.length === 0) return;

    const expandId = depth === 0 ? `menu-${node.id}` : `menu-child-${node.id}`;
    const nextTrail = [...expandTrail, expandId];

    node.children.forEach((child) => {
      visitNode(child as MenuCategory, mainSlug, [...parentSegments, slug], mainId, depth + 1, nextTrail);
    });
  };

  mainMenus.forEach((mainMenu) => {
    const mainSlug = menuSlug(mainMenu.caption, mainMenu.href);
    const mainPageId = `main-${mainMenu.id}`;
    const mainPath = '/' + mainSlug;

    pathToPageId.set(mainPath, mainPageId);
    pageIdToPath.set(mainPageId, mainPath);
    pageIdToMainId.set(mainPageId, mainMenu.id);
    pageIdToExpandIds.set(mainPageId, []);

    mainMenu.children?.forEach((child) => {
      visitNode(child as MenuCategory, mainSlug, [], mainMenu.id, 0, []);
    });
  });

  return {
    pathToPageId,
    pageIdToPath,
    pageIdToMainId,
    pageIdToExpandIds,
  };
}

interface MenuCategoryItemProps {
  category: MenuCategory;
  currentPage: string;
  setCurrentPage: (page: string) => void;
  expandedSubItems: string[];
  toggleSubExpanded: (id: string) => void;
}

/** Pick a distinct icon for secondary sidebar items by caption (report, inquiry, maintenance, etc.). */
function getSecondaryMenuIcon(caption: string, hasChildren: boolean): LucideIcon {
  if (hasChildren) return FolderOpen;
  const lower = caption.toLowerCase();
  if (lower.includes('report') || lower.includes('listing')) return FileBarChart2;
  if (lower.includes('inquiry') || lower.includes('inquiries') || lower.includes('status')) return Search;
  if (lower.includes('check') || lower.includes('compare') || lower.includes('sheet')) return ListChecks;
  if (lower.includes('maintenance') || lower.includes('maintain') || lower.includes('setup')) return Wrench;
  if (lower.includes('movement') || lower.includes('transaction') || lower.includes('dispatch')) return ArrowRightLeft;
  if (lower.includes('reorder') || lower.includes('stock') || lower.includes('inventory') || lower.includes('valuation')) return Package;
  if (lower.includes('order') || lower.includes('entry')) return ClipboardList;
  return FileText;
}

function nodeContainsPage(node: MenuCategory, currentPage: string): boolean {
  const nodePageId = menuPageId(node.id, node.caption, node.href);
  if (nodePageId === currentPage) return true;
  if (!node.children || node.children.length === 0) return false;
  return node.children.some((child) => nodeContainsPage(child as MenuCategory, currentPage));
}

function MenuCategoryItem({ category, currentPage, setCurrentPage, expandedSubItems, toggleSubExpanded }: MenuCategoryItemProps) {
  const isExpanded = expandedSubItems.includes(`menu-${category.id}`);
  const hasChildren = category.children && category.children.length > 0;
  const pageId = menuPageId(category.id, category.caption, category.href);
  const ItemIcon = getSecondaryMenuIcon(category.caption, Boolean(hasChildren));
  const isCurrentBranchActive = hasChildren ? nodeContainsPage(category, currentPage) : currentPage === pageId;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => toggleSubExpanded(`menu-${category.id}`)}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
            isCurrentBranchActive
              ? 'bg-brand-100 dark:bg-brand-dark-100 text-brand-900 dark:text-brand-dark-text'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
          }`}
        >
          <ItemIcon className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
          <span className="truncate font-medium flex-1 text-left">{category.caption}</span>
          <ChevronUp className={`w-3 h-3 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
        {isExpanded && (
          <div className="ml-4 mt-1 space-y-1">
            {category.children!.map((child) => {
              const childPageId = menuPageId(child.id, child.caption, child.href);
              const hasGrandChildren = child.children && child.children.length > 0;
              const ChildIcon = getSecondaryMenuIcon(child.caption, Boolean(hasGrandChildren));
              if (hasGrandChildren) {
                const childExpanded = expandedSubItems.includes(`menu-child-${child.id}`);
                const childBranchActive = nodeContainsPage(child as MenuCategory, currentPage);
                return (
                  <div key={child.id}>
                    <button
                      onClick={() => toggleSubExpanded(`menu-child-${child.id}`)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-all duration-200 ${
                        childBranchActive
                          ? 'bg-brand-100 dark:bg-brand-dark-100 text-brand-900 dark:text-brand-dark-text'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <ChildIcon className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
                      <span className="truncate flex-1 text-left">{child.caption}</span>
                      <ChevronUp className={`w-3 h-3 transition-transform duration-200 flex-shrink-0 ${childExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {childExpanded && (
                      <div className="ml-4 mt-1 space-y-1">
                        {child.children!.map((grandChild) => {
                          const grandChildPageId = menuPageId(grandChild.id, grandChild.caption, grandChild.href);
                          return (
                            <button
                              key={grandChild.id}
                              onClick={() => setCurrentPage(grandChildPageId)}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-all duration-200 rounded text-left ${
                                currentPage === grandChildPageId
                                  ? 'bg-brand-200 dark:bg-brand-dark-200 text-brand-900 dark:text-brand-dark-text font-medium'
                                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {(() => {
                                const GrandChildIcon = getSecondaryMenuIcon(grandChild.caption, false);
                                return <GrandChildIcon className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />;
                              })()}
                              <span className="truncate">{grandChild.caption}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={child.id}
                  onClick={() => setCurrentPage(childPageId)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-all duration-200 rounded text-left ${
                    currentPage === childPageId
                      ? 'bg-brand-200 dark:bg-brand-dark-200 text-brand-900 dark:text-brand-dark-text font-medium'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {(() => {
                    const LeafIcon = getSecondaryMenuIcon(child.caption, false);
                    return <LeafIcon className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />;
                  })()}
                  <span className="truncate">{child.caption}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
  return (
    <button
      onClick={() => setCurrentPage(pageId)}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-all duration-200 rounded text-left ${
        currentPage === pageId
          ? 'bg-brand-200 dark:bg-brand-dark-200 text-brand-900 dark:text-brand-dark-text font-medium'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700'
      }`}
    >
      {(() => {
        const LeafIcon = getSecondaryMenuIcon(category.caption, false);
        return <LeafIcon className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />;
      })()}
      <span className="truncate font-medium">{category.caption}</span>
    </button>
  );
}

function Sidebar() {
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
    setMainSidebarWidth,
    appMenu,
    setAppMenu,
    menuLoading,
    setMenuLoading
  } = useApp();
  
  const [expandedSubItems, setExpandedSubItems] = useState<string[]>([]);
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);
  const [hoveredMainMenuId, setHoveredMainMenuId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('Entice Tech Ltd');
  const [isResizingIcon, setIsResizingIcon] = useState(false);
  const [isResizingMain, setIsResizingMain] = useState(false);
  
  const iconSidebarRef = useRef<HTMLDivElement>(null);
  const mainSidebarRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iconCollapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondaryIsRelevantRef = useRef(false);
  const routeBootstrapDoneRef = useRef(false);
  const mainMenus = appMenu;
  const routeIndex = React.useMemo(() => buildMenuRouteIndex(mainMenus), [mainMenus]);
  const mainMenuPageId = (id: number) => 'main-' + id;
  
  // Fetch main menus (parent = -1) and full tree from menus table
  useEffect(() => {
    const loadMenu = async () => {
      if (appMenu.length === 0 && !menuLoading) {
        setMenuLoading(true);
        try {
          const menu = await fetchMenu();
          setAppMenu(menu);
        } finally {
          setMenuLoading(false);
        }
      }
    };
    loadMenu();
  }, [appMenu.length, menuLoading, setAppMenu, setMenuLoading]);

  const resolvePageIdFromPath = useCallback(
    (pathname: string): string | null => {
      const normalized = normalizePath(pathname);
      const exact = routeIndex.pathToPageId.get(normalized);
      if (exact) return exact;

      const segments = normalized.split('/').filter(Boolean);
      if (segments.length === 0) return null;

      for (let i = segments.length - 1; i >= 1; i -= 1) {
        const candidate = '/' + segments.slice(0, i).join('/');
        const match = routeIndex.pathToPageId.get(candidate);
        if (match) return match;
      }

      const mainOnly = '/' + segments[0];
      return routeIndex.pathToPageId.get(mainOnly) ?? null;
    },
    [routeIndex.pathToPageId]
  );

  // Initialize current page from URL once menus are available.
  useEffect(() => {
    if (mainMenus.length === 0 || routeBootstrapDoneRef.current) return;

    const routePageId = resolvePageIdFromPath(window.location.pathname);
    if (routePageId) {
      setCurrentPage(routePageId);
    } else if (currentPage === 'dashboard') {
      setCurrentPage(mainMenuPageId(mainMenus[0].id));
    }

    routeBootstrapDoneRef.current = true;
  }, [mainMenus, currentPage, resolvePageIdFromPath, setCurrentPage]);

  // Keep URL synchronized with selected page for deep links and refresh persistence.
  useEffect(() => {
    if (mainMenus.length === 0) return;
    const targetPath = routeIndex.pageIdToPath.get(currentPage);
    if (!targetPath) return;

    const activePath = normalizePath(window.location.pathname);
    if (activePath !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }, [currentPage, mainMenus.length, routeIndex.pageIdToPath]);

  // Browser navigation support.
  useEffect(() => {
    if (mainMenus.length === 0) return;

    const onPopState = () => {
      const routePageId = resolvePageIdFromPath(window.location.pathname);
      if (routePageId) {
        setCurrentPage(routePageId);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [mainMenus.length, resolvePageIdFromPath, setCurrentPage]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (iconCollapseTimeoutRef.current) clearTimeout(iconCollapseTimeoutRef.current);
    };
  }, []);

  const selectedMainMenuId = routeIndex.pageIdToMainId.get(currentPage) ?? null;
  const selectedMainMenu = selectedMainMenuId != null ? mainMenus.find((m) => m.id === selectedMainMenuId) : null;
  // Show secondary sidebar on hover (hovered) or on selection (click); hover takes precedence
  const displayedMainMenu = hoveredMainMenuId != null
    ? mainMenus.find((m) => m.id === hoveredMainMenuId) ?? selectedMainMenu
    : selectedMainMenu;
  // Allow main sidebar to collapse ONLY when a secondary (submodule) menu item is selected
  const hasSecondaryMenuSelected = currentPage.startsWith('menu-');
  const canCollapseMainSidebar = hasSecondaryMenuSelected;
  secondaryIsRelevantRef.current = hoveredMainMenuId != null || !sidebarCollapsed;

  // Guarded setter: never collapse unless a secondary menu item is active (catches all code paths)
  const setSidebarCollapsedGuarded = useCallback(
    (value: boolean) => {
      if (value === true && !hasSecondaryMenuSelected) return;
      setSidebarCollapsed(value);
    },
    [hasSecondaryMenuSelected, setSidebarCollapsed]
  );

  // Expand all secondary submenus by default when the displayed main menu changes (hover or selection)
  const menuForExpand = displayedMainMenu ?? selectedMainMenu;
  useEffect(() => {
    if (!menuForExpand?.children) return;
    const idsToExpand: string[] = [];
    menuForExpand.children.forEach((child) => {
      idsToExpand.push(`menu-${child.id}`);
      if (child.children?.length) idsToExpand.push(`menu-child-${child.id}`);
    });
    setExpandedSubItems((prev) => [...new Set([...prev, ...idsToExpand])]);
  }, [menuForExpand?.id]);

  useEffect(() => {
    const routeExpandIds = routeIndex.pageIdToExpandIds.get(currentPage) ?? [];
    if (routeExpandIds.length === 0) return;
    setExpandedSubItems((prev) => [...new Set([...prev, ...routeExpandIds])]);
  }, [currentPage, routeIndex.pageIdToExpandIds]);

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  // Clear hover after delay. Never auto-collapse secondary — only the user can collapse via the button.
  const scheduleClearHoveredMainMenu = useCallback(() => {
    clearHoverTimeout();
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredMainMenuId(null);
    }, 150);
  }, [clearHoverTimeout]);

  const handleMainMenuMouseEnter = useCallback((categoryId: number) => {
    clearHoverTimeout();
    setHoveredMainMenuId(categoryId);
    setSidebarCollapsed(false);
  }, [clearHoverTimeout, setSidebarCollapsed]);

  // Leaving main icon: clear hover so displayed menu reverts to selected. Do NOT collapse secondary.
  const handleMainMenuMouseLeave = useCallback(() => {
    scheduleClearHoveredMainMenu();
  }, [scheduleClearHoveredMainMenu]);

  const handleSecondarySidebarMouseEnter = useCallback(() => {
    clearHoverTimeout();
  }, [clearHoverTimeout]);

  const clearIconCollapseTimeout = useCallback(() => {
    if (iconCollapseTimeoutRef.current) {
      clearTimeout(iconCollapseTimeoutRef.current);
      iconCollapseTimeoutRef.current = null;
    }
  }, []);

  // Leaving secondary: clear hover and schedule collapse of primary (icon) sidebar after delay.
  const handleSecondarySidebarMouseLeave = useCallback(() => {
    scheduleClearHoveredMainMenu();
    clearIconCollapseTimeout();
    iconCollapseTimeoutRef.current = setTimeout(() => {
      collapseIconSidebar();
    }, 200);
  }, [scheduleClearHoveredMainMenu, clearIconCollapseTimeout, collapseIconSidebar]);

  // Icon sidebar: expand on hover. Cancel any pending icon collapse when re-entering (e.g. from secondary).
  const handleMouseEnterIconSidebar = useCallback(() => {
    clearIconCollapseTimeout();
    if (!iconSidebarExpanded) expandIconSidebar();
  }, [iconSidebarExpanded, expandIconSidebar, clearIconCollapseTimeout]);

  const handleMouseLeaveIconSidebar = useCallback(() => {
    if (!iconSidebarExpanded) return;
    if (secondaryIsRelevantRef.current) return;
    collapseIconSidebar();
  }, [iconSidebarExpanded, collapseIconSidebar]);

  const toggleSubExpanded = (itemId: string) => {
    setExpandedSubItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleMainMenuClick = (pageId: string) => {
    if (iconSidebarExpanded) {
      setCurrentPage(pageId);
    } else {
      setIconSidebarExpanded(true);
      setCurrentPage(pageId);
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
      setSidebarCollapsedGuarded(true);
    } else if (newWidth >= 150 && sidebarCollapsed) {
      setSidebarCollapsedGuarded(false);
    }
  }, [isResizingMain, iconSidebarWidth, sidebarCollapsed, setMainSidebarWidth, setSidebarCollapsedGuarded]);

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

        {/* Toggle Button - toggles main sidebar (only when a secondary menu item is selected) */}
        <div className="absolute -right-3 top-6 z-20">
          <button
            onClick={() => setSidebarCollapsedGuarded(!sidebarCollapsed)}
            disabled={!canCollapseMainSidebar}
            className={`w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-all duration-200 ${
              canCollapseMainSidebar
                ? 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 hover:shadow-md cursor-pointer'
                : 'bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 cursor-not-allowed opacity-60'
            }`}
            title={canCollapseMainSidebar ? 'Collapse sidebar' : 'Select a menu item to collapse'}
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
            
            {/* First sidebar: main menus from menus table (parent = -1) */}
            {menuLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
              </div>
            )}
            {!menuLoading && mainMenus.length === 0 && (
              <div className="px-2 py-2 text-center text-xs text-gray-500 dark:text-gray-400">No modules</div>
            )}
            {!menuLoading && mainMenus.map((category) => {
              const pageId = mainMenuPageId(category.id);
              const Icon = getMainMenuIcon(category.caption);
              const isActive = selectedMainMenuId === category.id;
              const itemKey = String(category.id);
              return (
                <div key={itemKey} className="relative w-full flex-shrink-0">
                  <button
                    onClick={() => handleMainMenuClick(pageId)}
                    onMouseEnter={() => {
                      handleMainMenuMouseEnter(category.id);
                      if (!iconSidebarExpanded) setHoveredIcon(itemKey);
                    }}
                    onMouseLeave={() => {
                      handleMainMenuMouseLeave();
                      setHoveredIcon(null);
                    }}
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
                      <span className="ml-3 text-sm font-medium truncate text-gray-900 dark:text-white">{category.caption}</span>
                    )}
                  </button>
                  {!iconSidebarExpanded && hoveredIcon === itemKey && (
                    <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 bg-gray-900 dark:bg-slate-800 text-white dark:text-gray-100 px-2 py-1 rounded text-xs whitespace-nowrap z-50 shadow-lg border border-gray-700 dark:border-slate-600">
                      {category.caption}
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

      {/* Main Navigation Sidebar - shows on hover or when a main menu is selected */}
      <div 
        ref={mainSidebarRef}
        className={`bg-gray-50 dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col transition-all duration-300 ease-in-out overflow-hidden relative ${
          sidebarCollapsed && hoveredMainMenuId == null ? 'w-0' : ''
        }`}
        style={{ width: sidebarCollapsed && hoveredMainMenuId == null ? '0px' : `${mainSidebarWidth}px` }}
        onMouseEnter={handleSecondarySidebarMouseEnter}
        onMouseLeave={handleSecondarySidebarMouseLeave}
      >
        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-brand-500 dark:hover:bg-brand-400 hover:w-1.5 transition-all duration-200 z-10"
          onMouseDown={handleMainMouseDown}
        />

        {/* Toggle Button - click to collapse/expand the secondary menu */}
        <div className="absolute -right-3 top-6 z-20">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-6 h-6 rounded-full flex items-center justify-center shadow-sm transition-all duration-200 bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:shadow-md cursor-pointer"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            ) : (
              <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>

        {(!sidebarCollapsed || hoveredMainMenuId != null) && (
          <>
            {/* Header - Company Selector */}
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
              <div className="relative">
                <SearchableSelect
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="w-full bg-transparent border-none text-sm font-medium text-gray-900 dark:text-white focus:ring-0 cursor-pointer appearance-none pr-6"
                  placeholder="Search company"
                >
                  <option className="dark:bg-slate-800">Entice Tech Ltd</option>
                  <option className="dark:bg-slate-800">Sample Company 2</option>
                  <option className="dark:bg-slate-800">Sample Company 3</option>
                </SearchableSelect>
              </div>
            </div>

            {/* Second sidebar: submodules of the displayed main menu (hover or selection) */}
            <nav className="flex-1 flex flex-col min-h-0 p-4 overflow-y-auto">
              {menuLoading && (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
                  <span className="ml-2 text-sm text-gray-500">Loading...</span>
                </div>
              )}
              {!menuLoading && !displayedMainMenu && mainMenus.length > 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2">Select or hover a module</div>
              )}
              {!menuLoading && displayedMainMenu && (
                <>
                  <div className="text-sm font-medium text-gray-900 dark:text-white mb-2 pb-2 border-b border-gray-200 dark:border-slate-600 flex-shrink-0">
                    {displayedMainMenu.caption}
                  </div>
                  <div className="space-y-1 flex-1 min-h-0">
                    {displayedMainMenu.children && displayedMainMenu.children.length > 0 ? (
                      displayedMainMenu.children.map((child) => (
                        <MenuCategoryItem
                          key={child.id}
                          category={child as MenuCategory}
                          currentPage={currentPage}
                          setCurrentPage={setCurrentPage}
                          expandedSubItems={expandedSubItems}
                          toggleSubExpanded={toggleSubExpanded}
                        />
                      ))
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 py-2">No submodules</div>
                    )}
                  </div>
                </>
              )}
              {!menuLoading && mainMenus.length === 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2">No modules</div>
              )}
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

export { Sidebar };
