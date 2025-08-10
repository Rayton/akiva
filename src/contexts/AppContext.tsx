import React, { createContext, useContext, useState, ReactNode } from 'react';
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
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
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
      toggleDarkMode
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