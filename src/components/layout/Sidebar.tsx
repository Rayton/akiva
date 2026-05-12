import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Shield,
  Loader2,
} from 'lucide-react';
import {
  ArrowsLeftRight,
  Bank,
  Basket,
  Books,
  Buildings,
  Cards,
  ChartBar,
  ChatCircle,
  Checks,
  ClipboardText,
  Factory,
  FileText,
  FolderOpen,
  GearSix,
  HandCoins,
  MagnifyingGlass,
  MoneyWavy,
  Package,
  Receipt,
  ShoppingCart,
  SquaresFour,
  Wrench,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useApp } from '../../contexts/AppContext';
import { fetchMenu, hrefToSlug } from '../../data/menuApi';
import { MenuCategory } from '../../types/menu';
import { SearchableSelect } from '../common/SearchableSelect';

const COLLAPSED_ICON_SIDEBAR_WIDTH = 88;
const DEFAULT_EXPANDED_ICON_SIDEBAR_WIDTH = 300;
const MIN_EXPANDED_ICON_SIDEBAR_WIDTH = 260;
const MAX_EXPANDED_ICON_SIDEBAR_WIDTH = 360;
const ICON_EXPAND_DRAG_THRESHOLD = 240;
const ICON_COLLAPSE_DRAG_THRESHOLD = 180;

const MAIN_MENU_ICONS: Record<string, PhosphorIcon> = {
  sales: ShoppingCart,
  receivables: HandCoins,
  payables: Cards,
  purchases: Basket,
  inventory: Package,
  manufacturing: Factory,
  'general ledger': Books,
  'asset manager': Buildings,
  'petty cash': MoneyWavy,
  configuration: GearSix,
};

function getMainMenuIcon(caption: string): PhosphorIcon {
  const key = caption.toLowerCase().trim();
  return MAIN_MENU_ICONS[key] ?? SquaresFour;
}

function isConfigurationMenu(caption: string): boolean {
  return caption.toLowerCase().trim() === 'configuration';
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
function getSecondaryMenuIcon(caption: string, hasChildren: boolean): PhosphorIcon {
  if (hasChildren) return FolderOpen;
  const lower = caption.toLowerCase();
  if (lower.includes('report') || lower.includes('listing')) return ChartBar;
  if (lower.includes('inquiry') || lower.includes('inquiries') || lower.includes('status')) return MagnifyingGlass;
  if (lower.includes('check') || lower.includes('compare') || lower.includes('sheet')) return Checks;
  if (lower.includes('maintenance') || lower.includes('maintain') || lower.includes('setup')) return Wrench;
  if (lower.includes('movement') || lower.includes('transaction') || lower.includes('dispatch')) return ArrowsLeftRight;
  if (lower.includes('reorder') || lower.includes('stock') || lower.includes('inventory') || lower.includes('valuation')) return Package;
  if (lower.includes('invoice') || lower.includes('receipt')) return Receipt;
  if (lower.includes('bank') || lower.includes('cash')) return Bank;
  if (lower.includes('order') || lower.includes('entry')) return ClipboardText;
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
              ? 'bg-white text-slate-950 shadow-sm shadow-slate-200/60 dark:bg-slate-800 dark:text-white dark:shadow-black/20'
              : 'text-slate-600 hover:bg-white/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white'
          }`}
        >
          <ItemIcon weight="regular" className={`w-4 h-4 flex-shrink-0 ${isCurrentBranchActive ? 'text-rose-600 dark:text-rose-300' : 'text-slate-400 dark:text-slate-500'}`} />
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
                          ? 'bg-white text-slate-950 shadow-sm shadow-slate-200/60 dark:bg-slate-800 dark:text-white dark:shadow-black/20'
                          : 'text-slate-500 hover:bg-white/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white'
                      }`}
                    >
                      <ChildIcon weight="regular" className={`w-4 h-4 flex-shrink-0 ${childBranchActive ? 'text-rose-600 dark:text-rose-300' : 'text-slate-400 dark:text-slate-500'}`} />
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
                                  ? 'bg-rose-50 text-rose-700 font-medium dark:bg-rose-950/40 dark:text-rose-300'
                                  : 'text-slate-500 hover:bg-white/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white'
                              }`}
                            >
                              {(() => {
                                const GrandChildIcon = getSecondaryMenuIcon(grandChild.caption, false);
                                return <GrandChildIcon weight="regular" className="w-4 h-4 flex-shrink-0 text-slate-400 dark:text-slate-500" />;
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
                      ? 'bg-rose-50 text-rose-700 font-medium dark:bg-rose-950/40 dark:text-rose-300'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white'
                  }`}
                >
                  {(() => {
                    const LeafIcon = getSecondaryMenuIcon(child.caption, false);
                    return <LeafIcon weight="regular" className="w-4 h-4 flex-shrink-0 text-slate-400 dark:text-slate-500" />;
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
          ? 'bg-white text-slate-950 font-medium shadow-sm shadow-slate-200/60 dark:bg-slate-800 dark:text-white dark:shadow-black/20'
          : 'text-slate-600 hover:bg-white/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white'
      }`}
    >
      {(() => {
        const LeafIcon = getSecondaryMenuIcon(category.caption, false);
        return <LeafIcon weight="regular" className="w-4 h-4 flex-shrink-0 text-slate-400 dark:text-slate-500" />;
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
	  const [railTooltip, setRailTooltip] = useState<{ label: string; top: number } | null>(null);
	  const [companyName, setCompanyName] = useState('Entice Tech Ltd');
  const [isResizingIcon, setIsResizingIcon] = useState(false);
  const [isResizingMain, setIsResizingMain] = useState(false);
  
  const iconSidebarRef = useRef<HTMLDivElement>(null);
  const mainSidebarRef = useRef<HTMLDivElement>(null);
  const iconCollapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeBootstrapDoneRef = useRef(false);
  const mainMenus = appMenu;
  const configurationMainMenu = React.useMemo(
    () => mainMenus.find((menu) => isConfigurationMenu(menu.caption)) ?? null,
    [mainMenus]
  );
  const primaryMainMenus = React.useMemo(
    () => mainMenus.filter((menu) => !isConfigurationMenu(menu.caption)),
    [mainMenus]
  );
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
      if (normalized === '/' || normalized === '/dashboard') return 'dashboard';

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
      window.history.replaceState({}, '', '/dashboard');
    }

    routeBootstrapDoneRef.current = true;
  }, [mainMenus, currentPage, resolvePageIdFromPath, setCurrentPage]);

  // Keep URL synchronized with selected page for deep links and refresh persistence.
  useEffect(() => {
    if (mainMenus.length === 0) return;
    const targetPath = currentPage === 'dashboard' ? '/dashboard' : routeIndex.pageIdToPath.get(currentPage);
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
      if (iconCollapseTimeoutRef.current) clearTimeout(iconCollapseTimeoutRef.current);
    };
  }, []);

  const selectedMainMenuId = routeIndex.pageIdToMainId.get(currentPage) ?? null;
  const selectedMainMenu = selectedMainMenuId != null ? mainMenus.find((m) => m.id === selectedMainMenuId) : null;
  // Keep the secondary sidebar stable. Hover only shows icon tooltips; click changes menus.
  const displayedMainMenu = selectedMainMenu;
  // Allow the secondary sidebar to appear only after selecting a dynamic module.
  const hasSecondaryMenuSelected = currentPage.startsWith('menu-');
  const showSecondarySidebar = !sidebarCollapsed && displayedMainMenu != null;

  // Guarded setter: never collapse unless a secondary menu item is active (catches all code paths)
  const setSidebarCollapsedGuarded = useCallback(
    (value: boolean) => {
      if (value === true && !hasSecondaryMenuSelected) return;
      setSidebarCollapsed(value);
    },
    [hasSecondaryMenuSelected, setSidebarCollapsed]
  );

  // Expand all secondary submenus by default when the selected main menu changes.
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

	  const handleSecondarySidebarMouseEnter = useCallback(() => {
	  }, []);

  const clearIconCollapseTimeout = useCallback(() => {
    if (iconCollapseTimeoutRef.current) {
      clearTimeout(iconCollapseTimeoutRef.current);
      iconCollapseTimeoutRef.current = null;
    }
  }, []);

  // Leaving secondary should not collapse the rail; the sidebar should feel stable.
  const handleSecondarySidebarMouseLeave = useCallback(() => {
    clearIconCollapseTimeout();
  }, [clearIconCollapseTimeout]);

  // Icon sidebar: hover is only for tooltips; resize/click controls layout changes.
  const handleMouseEnterIconSidebar = useCallback(() => {
    clearIconCollapseTimeout();
  }, [clearIconCollapseTimeout]);

  const handleMouseLeaveIconSidebar = useCallback(() => {
    clearIconCollapseTimeout();
  }, [clearIconCollapseTimeout]);

  const toggleSubExpanded = (itemId: string) => {
    setExpandedSubItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

	  const handleMainMenuClick = (pageId: string) => {
	    setCurrentPage(pageId);
	    setSidebarCollapsed(false);
	  };

	  const handleSettingsClick = () => {
	    if (!configurationMainMenu) return;
	    handleMainMenuClick(mainMenuPageId(configurationMainMenu.id));
	  };

	  const showRailTooltip = useCallback((label: string, event: React.MouseEvent<HTMLElement>) => {
	    if (iconSidebarExpanded) return;
	    const rect = event.currentTarget.getBoundingClientRect();
	    setRailTooltip({ label, top: rect.top + rect.height / 2 });
	  }, [iconSidebarExpanded]);

	  const hideRailTooltip = useCallback(() => {
	    setRailTooltip(null);
	  }, []);

	  useEffect(() => {
	    if (iconSidebarExpanded) {
	      setRailTooltip(null);
	    }
	  }, [iconSidebarExpanded]);

	  const toggleIconSidebar = () => {
	    if (iconSidebarExpanded) {
	      setIconSidebarExpanded(false);
	      setIconSidebarWidth(COLLAPSED_ICON_SIDEBAR_WIDTH);
	      return;
	    }

	    setIconSidebarExpanded(true);
	    setIconSidebarWidth(DEFAULT_EXPANDED_ICON_SIDEBAR_WIDTH);
	  };

	  useEffect(() => {
	    if (isResizingIcon) return;
	    if (!iconSidebarExpanded && iconSidebarWidth !== COLLAPSED_ICON_SIDEBAR_WIDTH) {
	      setIconSidebarWidth(COLLAPSED_ICON_SIDEBAR_WIDTH);
	      return;
	    }
	    if (iconSidebarExpanded && iconSidebarWidth < MIN_EXPANDED_ICON_SIDEBAR_WIDTH) {
	      setIconSidebarWidth(DEFAULT_EXPANDED_ICON_SIDEBAR_WIDTH);
	    }
	  }, [iconSidebarExpanded, iconSidebarWidth, isResizingIcon, setIconSidebarWidth]);

	  // Icon sidebar resize handlers
	  const handleIconMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingIcon(true);
  }, []);

  const handleIconMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingIcon) return;
    
	    const newWidth = Math.max(COLLAPSED_ICON_SIDEBAR_WIDTH, Math.min(MAX_EXPANDED_ICON_SIDEBAR_WIDTH, e.clientX));
	    setIconSidebarWidth(newWidth);
	    
	    if (newWidth >= ICON_EXPAND_DRAG_THRESHOLD && !iconSidebarExpanded) {
	      setIconSidebarExpanded(true);
	    } else if (newWidth <= ICON_COLLAPSE_DRAG_THRESHOLD && iconSidebarExpanded) {
	      setIconSidebarExpanded(false);
	    }
	  }, [isResizingIcon, iconSidebarExpanded, setIconSidebarWidth, setIconSidebarExpanded]);

	  const handleIconMouseUp = useCallback(() => {
	    setIsResizingIcon(false);
	    if (!iconSidebarExpanded) {
	      setIconSidebarWidth(COLLAPSED_ICON_SIDEBAR_WIDTH);
	    } else if (iconSidebarWidth < MIN_EXPANDED_ICON_SIDEBAR_WIDTH) {
	      setIconSidebarWidth(DEFAULT_EXPANDED_ICON_SIDEBAR_WIDTH);
	    }
	  }, [iconSidebarExpanded, iconSidebarWidth, setIconSidebarWidth]);

  // Main sidebar resize handlers
  const handleMainMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingMain(true);
  }, []);

  const handleMainMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizingMain) return;
    
    const iconWidth = iconSidebarWidth;
    const newWidth = Math.max(240, Math.min(520, e.clientX - iconWidth));
    setMainSidebarWidth(newWidth);
    
    if (newWidth < 180 && !sidebarCollapsed) {
      setSidebarCollapsedGuarded(true);
    } else if (newWidth >= 180 && sidebarCollapsed) {
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
	    <div className="flex h-screen min-h-screen items-stretch">
	      {/* Left Icon Sidebar */}
	      <div 
	        ref={iconSidebarRef}
		        className="relative flex h-screen min-h-screen shrink-0 flex-col overflow-visible border-r border-white/70 bg-[#f4f0f0] transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950"
	        style={{ width: `${iconSidebarWidth}px` }}
	        onMouseEnter={handleMouseEnterIconSidebar}
	        onMouseLeave={handleMouseLeaveIconSidebar}
      >
        {/* Resize Handle */}
        <div
        className="absolute bottom-0 right-0 top-0 z-10 w-1 cursor-col-resize transition-all duration-200 hover:w-1.5 hover:bg-rose-500 dark:hover:bg-rose-400"
        onMouseDown={handleIconMouseDown}
        />

	        <div className={`grid min-h-0 flex-1 ${
	          iconSidebarExpanded
	            ? 'grid-rows-[88px_minmax(0,1fr)_104px]'
	            : 'grid-rows-[88px_minmax(0,1fr)_112px]'
	        }`}>
	          {/* Logo and primary rail toggle */}
	          <div className={`relative flex ${iconSidebarExpanded ? 'w-full items-center justify-between px-5' : 'items-center justify-center px-0'}`}>
	            <div className="flex min-w-0 items-center space-x-3">
	              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-black shadow-lg shadow-slate-300/70 dark:bg-white dark:shadow-black/30">
	                <span className="text-xl font-bold text-white dark:text-gray-900">A</span>
              </div>
              {iconSidebarExpanded && iconSidebarWidth > 132 && (
                <span className="truncate whitespace-nowrap text-lg font-semibold text-slate-950 dark:text-white">Akiva ERP</span>
              )}
            </div>

            <button
	              type="button"
	              onClick={toggleIconSidebar}
	              className={`flex items-center justify-center rounded-full bg-white/86 text-slate-700 shadow-sm shadow-slate-200/70 transition hover:bg-white hover:text-slate-950 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800 dark:hover:text-white ${
	                iconSidebarExpanded ? 'h-9 w-9 flex-shrink-0' : 'absolute -right-4 top-1/2 z-30 h-9 w-9 -translate-y-1/2'
	              }`}
	              aria-label={iconSidebarExpanded ? 'Collapse main menu' : 'Expand main menu'}
	              title={iconSidebarExpanded ? 'Collapse main menu' : 'Expand main menu'}
            >
              {iconSidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>

          {/* Top Section - Logo & Navigation */}
	          <nav
	            className={`flex min-h-0 flex-col overflow-y-auto overflow-x-visible scrollbar-hide ${
	              iconSidebarExpanded ? 'w-full px-4 py-1' : 'items-center px-0 py-2'
	            }`}
	            style={{
	              justifyContent: 'flex-start',
	              gap: iconSidebarExpanded ? 4 : 10,
	            }}
	          >
            {/* First sidebar: main menus from menus table (parent = -1) */}
            {menuLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
              </div>
            )}
	            {!menuLoading && primaryMainMenus.length === 0 && (
	              <div className="px-2 py-2 text-center text-xs text-gray-500 dark:text-gray-400">No modules</div>
	            )}
	            {!menuLoading && primaryMainMenus.map((category) => {
	              const pageId = mainMenuPageId(category.id);
	              const Icon = getMainMenuIcon(category.caption);
	              const isActive = selectedMainMenuId === category.id;
	              const itemKey = String(category.id);
	              return (
	                <div key={itemKey} className={`relative flex-shrink-0 ${iconSidebarExpanded ? 'w-full' : 'w-11'}`}>
		                  <button
		                    onClick={() => handleMainMenuClick(pageId)}
		                    onMouseEnter={(event) => {
		                      showRailTooltip(category.caption, event);
		                    }}
		                    onMouseLeave={() => {
		                      hideRailTooltip();
		                    }}
	                    className={`flex items-center rounded-full transition-all duration-300 ${
                      isActive
                        ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/25 dark:bg-rose-500 dark:shadow-rose-500/20'
                        : iconSidebarExpanded
                          ? 'text-slate-500 hover:bg-white/70 hover:text-slate-950 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-white'
                          : 'bg-white/86 text-slate-700 shadow-sm shadow-slate-200/70 hover:bg-white hover:text-slate-950 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800 dark:hover:text-white'
	                    } ${iconSidebarExpanded ? 'h-10 w-full justify-start gap-3 rounded-lg px-3' : 'mx-auto h-11 w-11 justify-center'}`}
	                  >
	                    <Icon weight={isActive ? 'fill' : 'regular'} className="h-5 w-5 flex-shrink-0" />
	                    {iconSidebarExpanded && iconSidebarWidth > 132 && (
	                      <span className="truncate text-sm font-medium text-inherit">{category.caption}</span>
	                    )}
	                  </button>
	                </div>
	              );
	            })}
	          </nav>

	          {/* Bottom Section - Fixed at bottom */}
	          <div className={`flex flex-col justify-end ${iconSidebarExpanded ? 'w-full gap-1.5 px-4 pb-4' : 'items-center gap-3 pb-5'}`}>
	            {/* Notifications */}
	            <div className="relative w-full flex-shrink-0">
	              <button 
	                onMouseEnter={(event) => showRailTooltip('Notifications', event)}
	                onMouseLeave={hideRailTooltip}
	                className={`relative flex items-center transition-all duration-300 ${
	                  iconSidebarExpanded
	                    ? 'h-10 w-full justify-start gap-3 rounded-lg bg-rose-600 px-3 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400'
	                    : 'mx-auto h-11 w-11 justify-center rounded-full bg-white/86 text-slate-700 shadow-sm shadow-slate-200/70 hover:bg-white hover:text-slate-950 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800 dark:hover:text-white'
	                }`}
	              >
                <ChatCircle weight="regular" className="h-5 w-5 flex-shrink-0" />
                {iconSidebarExpanded && iconSidebarWidth > 132 && (
                  <span className="truncate text-sm font-medium">Notifications</span>
	                )}
	                <span className="absolute right-1.5 top-1.5 h-3 w-3 rounded-full bg-rose-600 ring-2 ring-white dark:ring-slate-900" />
	              </button>
	            </div>
	            
	            {/* Settings - At the bottom */}
	            <div className="relative w-full flex-shrink-0">
	              <button 
	                onMouseEnter={(event) => showRailTooltip('Settings', event)}
	                onMouseLeave={hideRailTooltip}
	                onClick={handleSettingsClick}
	                className={`flex items-center transition-all duration-300 ${
	                  selectedMainMenuId === configurationMainMenu?.id
	                    ? iconSidebarExpanded
	                      ? 'h-10 w-full justify-start gap-3 rounded-lg bg-rose-600 px-3 text-white shadow-lg shadow-rose-500/25 dark:bg-rose-500 dark:shadow-rose-500/20'
	                      : 'mx-auto h-11 w-11 justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-500/25 dark:bg-rose-500 dark:shadow-rose-500/20'
	                    : iconSidebarExpanded
	                      ? 'h-10 w-full justify-start gap-3 rounded-lg px-3 text-slate-500 hover:bg-white/70 hover:text-slate-950 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-white'
	                      : 'mx-auto h-11 w-11 justify-center rounded-full bg-white/86 text-slate-700 shadow-sm shadow-slate-200/70 hover:bg-white hover:text-slate-950 dark:bg-slate-900/80 dark:text-slate-300 dark:shadow-black/20 dark:hover:bg-slate-800 dark:hover:text-white'
	                }`}
	                aria-label="Open configuration"
	              >
                <GearSix weight="regular" className="h-5 w-5 flex-shrink-0" />
                {iconSidebarExpanded && iconSidebarWidth > 132 && (
	                  <span className="truncate text-sm font-medium text-inherit">Settings</span>
	                )}
	              </button>
	            </div>
	          </div>
	        </div>

	        {!iconSidebarExpanded && railTooltip && (
	          <div
	            className="pointer-events-none fixed z-[9999] rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
	            style={{
	              left: Math.max(iconSidebarWidth, COLLAPSED_ICON_SIDEBAR_WIDTH) + 12,
	              top: railTooltip.top,
	              transform: 'translateY(-50%)',
	            }}
	          >
	            {railTooltip.label}
	            <span className="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-y-4 border-r-4 border-y-transparent border-r-slate-950 dark:border-r-slate-800" />
	          </div>
	        )}
	      </div>

      {/* Main Navigation Sidebar - opens only after selecting a dynamic main menu */}
      <div 
        ref={mainSidebarRef}
        className={`relative flex h-screen min-h-screen shrink-0 flex-col overflow-hidden border-r border-white/70 bg-[#f7f4f4]/92 transition-all duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-900/92 ${
          !showSecondarySidebar ? 'w-0' : ''
        }`}
        style={{ width: showSecondarySidebar ? `${mainSidebarWidth}px` : '0px' }}
        onMouseEnter={handleSecondarySidebarMouseEnter}
        onMouseLeave={handleSecondarySidebarMouseLeave}
      >
        {/* Resize Handle */}
        <div
          className="absolute bottom-0 right-0 top-0 z-10 w-1 cursor-col-resize transition-all duration-200 hover:w-1.5 hover:bg-rose-500 dark:hover:bg-rose-400"
          onMouseDown={handleMainMouseDown}
        />

        {/* Toggle Button - click to collapse/expand the secondary menu */}
        <div className="absolute -right-3 top-6 z-20">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-white bg-white shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            ) : (
              <ChevronLeft className="w-3 h-3 text-gray-600 dark:text-gray-300" />
            )}
          </button>
        </div>

        {showSecondarySidebar && (
          <>
            {/* Header - Company Selector */}
            <div className="flex-shrink-0 border-b border-white/70 p-4 dark:border-slate-800">
              <div className="relative rounded-full bg-white/78 px-3 py-2 shadow-sm shadow-slate-200/60 dark:bg-slate-950/50 dark:shadow-black/20">
                <SearchableSelect
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="w-full cursor-pointer appearance-none border-none bg-transparent pr-6 text-sm font-semibold text-slate-900 focus:ring-0 dark:text-white"
                  placeholder="Search company"
                >
                  <option className="dark:bg-slate-800">Entice Tech Ltd</option>
                  <option className="dark:bg-slate-800">Sample Company 2</option>
                  <option className="dark:bg-slate-800">Sample Company 3</option>
                </SearchableSelect>
              </div>
            </div>

            {/* Second sidebar: submodules of the displayed main menu (hover or selection) */}
              <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              {menuLoading && (
                <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                  <span className="ml-2 text-sm text-gray-500">Loading...</span>
                </div>
              )}
              {!menuLoading && !displayedMainMenu && mainMenus.length > 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2">Select or hover a module</div>
              )}
              {!menuLoading && displayedMainMenu && (
                <>
                  <div className="mb-3 flex-shrink-0 border-b border-white/70 pb-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-white">
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
            <div className="mt-auto flex-shrink-0 border-t border-white/70 p-4 dark:border-slate-800">
              <button className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-all duration-200 hover:bg-white/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">
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
