import React, { useState } from 'react';
import { Search, Menu, MoreHorizontal, Download, Share, Filter, Sun, Moon, Bell, Settings } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

export function Header() {
  const { currentUser, isDarkMode, toggleDarkMode } = useApp();
  const [timeframe, setTimeframe] = useState('Sep 1 - Nov 30, 2023');

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 transition-colors">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left side - Logo and search */}
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center">
                <span className="text-white dark:text-gray-900 font-bold text-sm">C</span>
              </div>
              <span className="font-medium text-gray-900 dark:text-white">webERP Pro</span>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder='Search transactions, reports...'
                className="pl-10 pr-4 py-2 w-80 bg-gray-50 dark:bg-gray-800 border-0 rounded-lg focus:ring-2 focus:ring-blue-500 focus:bg-white dark:focus:bg-gray-700 transition-colors text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>
          </div>
          
          {/* Right side - Actions and user */}
          <div className="flex items-center space-x-4">
            {/* Theme Toggle */}
            <button 
              onClick={toggleDarkMode}
              className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            
            {/* Notifications */}
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 relative">
              <Bell className="w-5 h-5" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-medium">3</span>
              </div>
            </button>
            
            {/* Settings */}
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <Settings className="w-5 h-5" />
            </button>
            
            {/* User Avatar */}
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">JD</span>
            </div>
            
            <button className="w-8 h-8 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center text-white transition-colors">
              <span className="text-lg font-light">+</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Secondary header with user avatars and timeframe */}
      <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <span className="text-lg font-light">+</span>
            </button>
            
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img src="https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1" alt="Armin A." className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img src="https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1" alt="Eren Y." className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img src="https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1" alt="Mikasa A." className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center">
                <span className="text-white dark:text-gray-900 text-xs font-medium">JD</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white transition-colors">
              <Filter className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white transition-colors">
              <Download className="w-4 h-4" />
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300 dark:hover:text-white transition-colors">
              <Share className="w-4 h-4" />
            </button>
            
            <div className="flex items-center space-x-2">
              <div className="w-6 h-3 bg-gray-300 dark:bg-gray-600 rounded-full relative">
                <div className="w-3 h-3 bg-gray-900 dark:bg-white rounded-full absolute right-0 top-0"></div>
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