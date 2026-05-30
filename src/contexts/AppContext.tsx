import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { MenuCategory } from '../types/menu';
import { fetchCurrentAuthSession, signOutFromAkiva } from '../lib/auth/authApi';
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  isAuthSessionValid,
  storeAuthSession,
} from '../lib/auth/session';
import type { AkivaAuthSession } from '../lib/auth/session';

interface AppContextType {
  currentUser: User;
  authSession: AkivaAuthSession | null;
  isAuthenticated: boolean;
  setAuthSession: (session: AkivaAuthSession) => void;
  signOut: () => Promise<void>;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  iconSidebarExpanded: boolean;
  setIconSidebarExpanded: (expanded: boolean) => void;
  iconSidebarWidth: number;
  setIconSidebarWidth: (width: number) => void;
  mainSidebarWidth: number;
  setMainSidebarWidth: (width: number) => void;
  currentPage: string;
  setCurrentPage: (page: string) => void;
  activeSection: string;
  setActiveSection: (section: string) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setIsDarkMode: (dark: boolean) => void;
  expandIconSidebar: () => void;
  collapseIconSidebar: () => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  appMenu: MenuCategory[];
  setAppMenu: (menu: MenuCategory[]) => void;
  menuLoading: boolean;
  setMenuLoading: (loading: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

const APP_MENU_CACHE_KEY = 'akiva.menu.tree.v7';

const GUEST_USER: User = {
  id: '',
  name: 'Guest',
  email: '',
  role: 'Unauthenticated',
};

function normalizedPathKey(pathname: string): string {
  return pathname.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function routeSlugFromPath(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const routeSegment = segments[segments.length - 1] ?? '';
  return routeSegment.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function initialPageFromPath(pathname: string): string {
  const normalizedPath = pathname.toLowerCase().replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  if (normalizedPath === '/' || normalizedPath === '/dashboard') return 'dashboard';

  const key = normalizedPathKey(pathname);

  if (key.includes('configurationuserswwwusers')) return 'users';
  if (key.includes('configurationuserswwwaccess')) return 'www-access';
  if (key.includes('configurationusersmenuaccess') || key.includes('configurationusersmenurights')) return 'menu-access';
  if (key.includes('configurationsalesreceivablessetupdiscountmatrix')) return 'discount-matrix';
  if (key.includes('configurationsalesreceivablessetupcogsglpostings') || key.includes('configurationsalesreceivablessetupcogsglposting')) return 'cogs-gl-postings';
  if (key.includes('configurationsalesreceivablessetupsalesglpostings') || key.includes('configurationsalesreceivablessetupsalesglposting')) return 'sales-gl-postings';
  if (key.includes('configurationsalesreceivablessetupareas') || key.includes('configurationsalesreceivablessetupsalesareas')) return 'areas';
  if (key.includes('configurationsalesreceivablessetupsalespeople') || key.includes('configurationsalesreceivablessetupsalesman')) return 'sales-people';
  if (key.includes('configurationsalesreceivablessetuppaymentmethods')) return 'payment-methods';
  if (key.includes('configurationsalesreceivablessetuppaymentterms')) return 'payment-terms';
  if (key.includes('configurationsalesreceivablessetupcreditstatus') || key.includes('configurationsalesreceivablessetupholdreasons')) return 'credit-status';
  if (key.includes('configurationsalesreceivablessetupcustomertypes')) return 'customer-types';
  if (key.includes('configurationsalesreceivablessetupsalestypes')) return 'sales-types';

  if (key.includes('configurationgeneralledgersetup')) {
    if (key.includes('currencies')) return 'currencies';
    if (key.includes('taxauthorities')) return 'tax-authorities';
    if (key.includes('taxgroups')) return 'tax-groups';
    if (key.includes('taxprovinces')) return 'tax-provinces';
    if (key.includes('taxcategories')) return 'tax-categories';
    if (key.includes('periods')) return 'periods';
    return 'general-ledger-setup';
  }

  if (key.includes('configurationenterprise') || key.includes('enterprisecontrols') || key.includes('enterpriseconfiguration')) {
    if (key.includes('fiscalyears')) return 'fiscal-years';
    if (key.includes('fiscalperiods')) return 'fiscal-periods';
    if (key.includes('financialdimensions')) return 'financial-dimensions';
    if (key.includes('grants')) return 'grants';
    if (key.includes('dimensionvalues')) return 'dimension-values';
    if (key.includes('donors')) return 'donors';
    if (key.includes('taxrateversions')) return 'tax-rate-versions';
    if (key.includes('currencyrates')) return 'currency-rates';
    if (key.includes('allocationkeylines')) return 'allocation-key-lines';
    if (key.includes('allocationkeys')) return 'allocation-keys';
    if (key.includes('reporttemplates')) return 'report-templates';
    if (key.includes('auditpolicies')) return 'audit-policies';
    if (key.includes('dashboardtemplates')) return 'dashboard-templates';
    if (key.includes('notificationrules')) return 'notification-rules';
    return 'enterprise-configuration';
  }

  const routeSlug = routeSlugFromPath(pathname);
  return routeSlug ? `menu-route-${routeSlug}` : 'dashboard';
}

function appMenuCacheKey(session: AkivaAuthSession | null): string | null {
  if (!isAuthSessionValid(session)) return null;
  return `${APP_MENU_CACHE_KEY}.${session.company.database}.${session.user.id}`;
}

function readCachedAppMenu(session: AkivaAuthSession | null): MenuCategory[] {
  if (typeof window === 'undefined') return [];

  const cacheKey = appMenuCacheKey(session);
  if (!cacheKey) return [];

  const raw = localStorage.getItem(cacheKey);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as MenuCategory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(cacheKey);
    return [];
  }
}

export function AppProvider({ children }: AppProviderProps) {
  const [authSession, setAuthSessionState] = useState<AkivaAuthSession | null>(() => getStoredAuthSession());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [iconSidebarExpanded, setIconSidebarExpanded] = useState(false);
  const [iconSidebarWidth, setIconSidebarWidth] = useState(88);
  const [mainSidebarWidth, setMainSidebarWidth] = useState(292);
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window === 'undefined') return 'dashboard';
    return initialPageFromPath(window.location.pathname);
  });
  const [activeSection, setActiveSection] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [appMenu, setAppMenu] = useState<MenuCategory[]>(() => readCachedAppMenu(getStoredAuthSession()));
  const [menuLoading, setMenuLoading] = useState(false);
  
  // Initialize dark mode from localStorage or system preference
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('darkMode');
      if (stored !== null) {
        return stored === 'true';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Handle dark mode toggle with smooth transition
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  // Apply dark mode class and save to localStorage
  useEffect(() => {
    const html = document.documentElement;
    
    if (isDarkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    
    localStorage.setItem('darkMode', String(isDarkMode));
  }, [isDarkMode]);

  // Remove transitions on initial load to prevent flash
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('no-transitions');
    
    // Apply initial theme
    if (isDarkMode) {
      html.classList.add('dark');
    }
    
    // Enable transitions after a brief delay
    const timer = setTimeout(() => {
      html.classList.remove('no-transitions');
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cacheKey = appMenuCacheKey(authSession);
    if (!cacheKey) return;
    if (!Array.isArray(appMenu) || appMenu.length === 0) {
      localStorage.removeItem(cacheKey);
      return;
    }
    localStorage.setItem(cacheKey, JSON.stringify(appMenu));
  }, [appMenu, authSession]);

  useEffect(() => {
    if (!authSession || !isAuthSessionValid(authSession)) {
      clearStoredAuthSession();
      setAuthSessionState(null);
      setAppMenu([]);
      return;
    }

    storeAuthSession(authSession);
  }, [authSession]);

  useEffect(() => {
    if (!authSession) return;
    let cancelled = false;

    fetchCurrentAuthSession()
      .then((session) => {
        if (!cancelled) setAuthSessionState(session);
      })
      .catch(() => {
        if (!cancelled) {
          clearStoredAuthSession();
          setAuthSessionState(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setAuthSession = (session: AkivaAuthSession) => {
    storeAuthSession(session);
    setAppMenu([]);
    setAuthSessionState(session);
  };

  const signOut = async () => {
    const token = authSession?.token ?? '';
    const cacheKey = appMenuCacheKey(authSession);
    if (typeof window !== 'undefined' && cacheKey) {
      localStorage.removeItem(cacheKey);
    }
    clearStoredAuthSession();
    setAuthSessionState(null);
    setAppMenu([]);
    if (token) {
      try {
        await signOutFromAkiva(token);
      } catch {
        // Local sign-out should still complete if the network is unavailable.
      }
    }
  };

  const expandIconSidebar = () => {
    setIconSidebarExpanded(true);
    setIconSidebarWidth(240);
  };

  const collapseIconSidebar = () => {
    setIconSidebarExpanded(false);
    setIconSidebarWidth(88);
  };

  const currentUser = authSession?.user ?? GUEST_USER;
  const isAuthenticated = Boolean(authSession && isAuthSessionValid(authSession));

  return (
    <AppContext.Provider value={{
      currentUser,
      authSession,
      isAuthenticated,
      setAuthSession,
      signOut,
      sidebarCollapsed,
      setSidebarCollapsed,
      iconSidebarExpanded,
      setIconSidebarExpanded,
      iconSidebarWidth,
      setIconSidebarWidth,
      mainSidebarWidth,
      setMainSidebarWidth,
      currentPage,
      setCurrentPage,
      activeSection,
      setActiveSection,
      isDarkMode,
      toggleDarkMode,
      setIsDarkMode,
      expandIconSidebar,
      collapseIconSidebar,
      mobileSidebarOpen,
      setMobileSidebarOpen,
      appMenu,
      setAppMenu,
      menuLoading,
      setMenuLoading
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
