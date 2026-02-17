import React, { useState } from 'react';
import { Search, Menu, MoreHorizontal, Download, Share, Filter, Sun, Moon, Bell, Settings } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

export function Header() {
  const { currentUser, isDarkMode, toggleDarkMode } = useApp();
  const [timeframe, setTimeframe] = useState('Sep 1 - Nov 30, 2023');

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 transition-colors duration-300">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left side - Search only */}
          <div className="flex items-center space-x-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4" />
              <input
                type="text"
                placeholder='Search transactions, reports...'
                className="pl-10 pr-4 py-2 w-80 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-pink-500 focus:bg-white dark:focus:bg-slate-700 transition-all duration-300 text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>
          </div>
          
          {/* Right side - Actions and user */}
          <div className="flex items-center space-x-4">
            {/* Theme Toggle - Enhanced with smooth animation */}
            <button 
              onClick={toggleDarkMode}
              className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 group relative overflow-hidden"
              aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <div className="relative z-10">
                {isDarkMode ? (
                  <Sun className="w-5 h-5 text-amber-400 group-hover:text-amber-300 transition-colors duration-300" />
                ) : (
                  <Moon className="w-5 h-5 group-hover:text-indigo-400 transition-colors duration-300" />
                )}
              </div>
              {/* Hover glow effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
            
            {/* Notifications */}
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 relative">
              <Bell className="w-5 h-5" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center shadow-sm">
                <span className="text-white text-xs font-medium">3</span>
              </div>
            </button>
            
            {/* Settings */}
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
              <Settings className="w-5 h-5" />
            </button>
            
            {/* User Avatar */}
            <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center shadow-md">
              <span className="text-white text-sm font-medium">JD</span>
            </div>
            
            <button className="w-8 h-8 bg-pink-500 hover:bg-pink-600 dark:bg-pink-600 dark:hover:bg-pink-500 rounded-full flex items-center justify-center text-white transition-all duration-300 shadow-md hover:shadow-lg">
              <span className="text-lg font-light">+</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Secondary header with user avatars and timeframe */}
      <div className="px-6 py-3 border-b border-gray-100 dark:border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button className="w-8 h-8 bg-gray-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all duration-300 hover:bg-gray-200 dark:hover:bg-slate-700">
              <span className="text-lg font-light">+</span>
            </button>
            
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-slate-600">
                <img src="https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1" alt="Armin A." className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-slate-600">
                <img src="https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1" alt="Eren Y." className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-slate-600">
                <img src="https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1" alt="Mikasa A." className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center ring-2 ring-gray-300 dark:ring-slate-500">
                <span className="text-white dark:text-gray-900 text-xs font-medium">JD</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
              <Download className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-white transition-all duration-300 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800">
              <Share className="w-4 h-4" />
            </button>
            
            <div className="flex items-center space-x-2">
              <div className="w-6 h-3 bg-gray-300 dark:bg-slate-600 rounded-full relative">
                <div className="w-3 h-3 bg-gray-900 dark:bg-white rounded-full absolute right-0 top-0 shadow-sm"></div>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">Timeframe</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">{timeframe}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
