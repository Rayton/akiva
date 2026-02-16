import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';

interface AppContextType {
  currentUser: User;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [iconSidebarExpanded, setIconSidebarExpanded] = useState(false);
  const [iconSidebarWidth, setIconSidebarWidth] = useState(64);
  const [mainSidebarWidth, setMainSidebarWidth] = useState(256);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [activeSection, setActiveSection] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
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

  const expandIconSidebar = () => {
    setIconSidebarExpanded(true);
    setIconSidebarWidth(200);
  };

  const collapseIconSidebar = () => {
    setIconSidebarExpanded(false);
    setIconSidebarWidth(64);
  };

  const currentUser: User = {
    id: '1',
    name: 'John Doe',
    email: 'john@company.com',
    role: 'Administrator',
    avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=64&h=64&dpr=1'
  };

  return (
    <AppContext.Provider value={{
      currentUser,
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
      setMobileSidebarOpen
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
