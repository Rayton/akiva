import React from 'react';
import { TrendingUp, TrendingDown, Star, MoreHorizontal, Filter, BarChart3 } from 'lucide-react';
import { Card } from '../components/common/Card';

export function Dashboard() {
  const topPerformers = [
    { 
      name: 'Armin A.', 
      avatar: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1',
      revenue: '$209,633',
      percentage: '39.63%',
      deals: 41,
      conversion: 118,
      score: '0.84',
      winRate: '31%',
      badge: 12
    },
    { 
      name: 'Mikasa A.', 
      avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1',
      revenue: '$156,841',
      percentage: '29.65%',
      deals: 54,
      conversion: 103,
      score: '0.89',
      winRate: '39%',
      badge: 21
    },
    { 
      name: 'Eren Y.', 
      avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&dpr=1',
      revenue: '$117,115',
      percentage: '22.14%',
      deals: 22,
      conversion: 84,
      score: '0.79',
      winRate: '32%',
      badge: 7
    }
  ];

  const companies = [
    { name: 'Dribbble', amount: '$227,459', percentage: '43%', color: 'bg-pink-500' },
    { name: 'Instagram', amount: '$142,823', percentage: '27%', color: 'bg-gradient-to-r from-purple-500 to-pink-500' },
    { name: 'Behance', amount: '$89,935', percentage: '11%', color: 'bg-blue-500' },
    { name: 'Google', amount: '$37,028', percentage: '7%', color: 'bg-green-500' }
  ];

  return (
    <div className="p-4 md:p-6 bg-gray-50 dark:bg-slate-900 min-h-screen transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">Financial Dashboard</h1>
        </div>

        {/* Main Revenue Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
          {/* Revenue Card */}
          <div className="md:col-span-8">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-slate-700 transition-colors duration-300">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Total Revenue</h2>
                <div className="flex items-baseline space-x-3">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">$528,976</span>
                  <span className="text-2xl font-light text-gray-400 dark:text-gray-500">.82</span>
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      7.9%
                    </span>
                    <span className="text-sm text-red-600 dark:text-red-400">$27,335.09</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">vs prev. $501,641.73 Jun 1 - Aug 31, 2023</p>
              </div>

              {/* Top Sales and Best Deal */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
                <div className="bg-gray-50 dark:bg-slate-700/50 p-3 md:p-4 rounded-lg">
                  <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mb-1 md:mb-2">Top sales</p>
                  <div className="flex items-center space-x-2">
                    <span className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">72</span>
                    <div className="w-5 h-5 md:w-6 md:h-6 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-slate-600">
                      <img src="https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=24&h=24&dpr=1" alt="Mikasa" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-xs md:text-sm text-gray-600 dark:text-gray-300">Mikasa</span>
                  </div>
                </div>
                
                <div className="bg-gray-900 dark:bg-slate-700 text-white dark:text-gray-100 p-3 md:p-4 rounded-lg shadow-lg">
                  <div className="flex items-center justify-between mb-1 md:mb-2">
                    <span className="text-xs md:text-sm text-gray-300 dark:text-gray-400">Best deal</span>
                    <Star className="w-3 h-3 md:w-4 md:h-4 text-yellow-400" />
                  </div>
                  <div className="text-lg md:text-xl font-bold">$42,300</div>
                  <div className="text-xs md:text-sm text-gray-300 dark:text-gray-400">Rolf Inc.</div>
                </div>
                
                <div className="bg-gray-50 dark:bg-slate-700/50 p-3 md:p-4 rounded-lg space-y-1 md:space-y-2">
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Deals</span>
                    <span className="text-xs md:text-sm font-medium text-gray-900 dark:text-white">250</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Value</span>
                    <span className="text-xs md:text-sm font-medium text-red-600 dark:text-red-400">528k</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Win rate</span>
                    <span className="text-xs md:text-sm font-medium text-gray-900 dark:text-white">44%</span>
                  </div>
                </div>
              </div>

              {/* Performance List */}
              <div className="space-y-3 mb-6">
                {topPerformers.map((performer, index) => (
                  <div key={index} className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-slate-600">
                        <img src={performer.avatar} alt={performer.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{performer.revenue}</span>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{performer.percentage}</span>
                    </div>
                    <button className="px-3 py-1 bg-gray-900 dark:bg-slate-700 text-white dark:text-gray-100 rounded text-sm hover:bg-gray-800 dark:hover:bg-slate-600 transition-colors">Details</button>
                  </div>
                ))}
              </div>

              {/* Filter Buttons */}
              <div className="flex items-center space-x-4 mb-6">
                <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <BarChart3 className="w-4 h-4" />
                  <span>Filters</span>
                </button>
                <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                </button>
              </div>

              {/* Company Performance */}
              <div className="space-y-4">
                {companies.map((company, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 ${company.color} rounded-lg flex items-center justify-center shadow-md`}>
                        {company.name === 'Dribbble' && <span className="text-white text-xs font-bold">D</span>}
                        {company.name === 'Instagram' && <span className="text-white text-xs font-bold">I</span>}
                        {company.name === 'Behance' && <span className="text-white text-xs font-bold">B</span>}
                        {company.name === 'Google' && <span className="text-white text-xs font-bold">G</span>}
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{company.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{company.amount}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{company.percentage}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="md:col-span-4 space-y-4 md:space-y-6">
            {/* Performance Table */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 md:p-6 shadow-sm border border-gray-200 dark:border-slate-700 transition-colors duration-300">
              <div className="flex items-center justify-between mb-4 overflow-x-auto">
                <div className="flex space-x-2 md:space-x-6 text-xs md:text-sm">
                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Sales</span>
                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Revenue</span>
                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">Leads</span>
                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">KPI</span>
                  <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">W/L</span>
                </div>
              </div>
              
              <div className="space-y-3">
                {topPerformers.map((performer, index) => (
                  <div key={index} className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-gray-200 dark:ring-slate-600">
                        <img src={performer.avatar} alt={performer.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{performer.name}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{performer.revenue}</span>
                      <span className="w-6 h-6 bg-gray-900 dark:bg-slate-600 text-white dark:text-gray-100 rounded text-xs flex items-center justify-center">{performer.deals}</span>
                      <span className="text-gray-600 dark:text-gray-400">{performer.conversion}</span>
                      <span className="text-gray-600 dark:text-gray-400">{performer.score}</span>
                      <span className="text-gray-600 dark:text-gray-400">{performer.winRate}</span>
                      <span className="w-6 h-6 bg-gray-900 dark:bg-slate-600 text-white dark:text-gray-100 rounded text-xs flex items-center justify-center">{performer.badge}</span>
                      <span className="text-gray-900 dark:text-white font-medium">{index === 0 ? '29' : index === 1 ? '33' : '15'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Integration */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 md:p-6 shadow-sm border border-gray-200 dark:border-slate-700 transition-colors duration-300">
              <div className="flex flex-wrap gap-2 md:gap-0 md:space-x-2 mb-3 md:mb-4">
                <span className="text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300">Top sales 💪</span>
                <span className="text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300">Sales streak 🔥</span>
                <span className="text-xs md:text-sm font-medium text-gray-700 dark:text-gray-300">Top review 👍</span>
              </div>
              
              <div className="mb-3 md:mb-4">
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1 md:mb-2">Work with platforms</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-pink-600 dark:text-pink-400">❤️ 3</span>
                  <span className="text-sm font-semibold text-pink-600 dark:text-pink-400">$156,841</span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-pink-500 rounded"></div>
                    <span className="text-gray-700 dark:text-gray-300">Dribbble</span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">14.1% $22,114</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-pink-500 rounded"></div>
                    <span className="text-gray-700 dark:text-gray-300">Instagram</span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">28.1% $44,072</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-gray-900 dark:bg-slate-600 rounded"></div>
                    <span className="text-gray-700 dark:text-gray-300">Other</span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400">7.1% $11,135</span>
                </div>
              </div>
            </div>

            {/* Sales Dynamic Chart */}
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 md:p-6 shadow-sm border border-gray-200 dark:border-slate-700 transition-colors duration-300">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 md:mb-4">Financial Trends</h3>
              <div className="h-24 md:h-32 bg-gray-50 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                <span className="text-gray-400 dark:text-gray-500 text-sm">Chart visualization</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
