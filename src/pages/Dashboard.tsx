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
    <div className="p-6 bg-white dark:bg-gray-900 min-h-screen transition-colors">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Financial Dashboard</h1>
        </div>

        {/* Main Revenue Section */}
        <div className="grid grid-cols-12 gap-6">
          {/* Revenue Card */}
          <div className="col-span-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Total Revenue</h2>
                <div className="flex items-baseline space-x-3">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">$528,976</span>
                  <span className="text-2xl font-light text-gray-400 dark:text-gray-500">.82</span>
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2 py-1 rounded text-sm font-medium bg-red-100 text-red-800">
                      <TrendingDown className="w-3 h-3 mr-1" />
                      7.9%
                    </span>
                    <span className="text-sm text-red-600">$27,335.09</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">vs prev. $501,641.73 Jun 1 - Aug 31, 2023</p>
              </div>

              {/* Top Sales and Best Deal */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Top sales</p>
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">72</span>
                    <div className="w-6 h-6 rounded-full overflow-hidden">
                      <img src="https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=24&h=24&dpr=1" alt="Mikasa" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm text-gray-600 dark:text-gray-300">Mikasa</span>
                  </div>
                </div>
                
                <div className="bg-gray-900 dark:bg-gray-700 text-white p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-300 dark:text-gray-400">Best deal</span>
                    <Star className="w-4 h-4 text-yellow-400" />
                  </div>
                  <div className="text-xl font-bold">$42,300</div>
                  <div className="text-sm text-gray-300 dark:text-gray-400">Rolf Inc.</div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Deals</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">250</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Value</span>
                    <span className="text-sm font-medium text-red-600">528k</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">Win rate</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">44%</span>
                  </div>
                </div>
              </div>

              {/* Performance List */}
              <div className="space-y-3 mb-6">
                {topPerformers.map((performer, index) => (
                  <div key={index} className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full overflow-hidden">
                        <img src={performer.avatar} alt={performer.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-sm font-medium text-gray-900">{performer.revenue}</span>
                      <span className="text-sm text-gray-500">{performer.percentage}</span>
                    </div>
                    <button className="px-3 py-1 bg-gray-900 text-white rounded text-sm">Details</button>
                  </div>
                ))}
              </div>

              {/* Filter Buttons */}
              <div className="flex items-center space-x-4 mb-6">
                <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <BarChart3 className="w-4 h-4" />
                  <span>Filters</span>
                </button>
                <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg text-sm">
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                </button>
              </div>

              {/* Company Performance */}
              <div className="space-y-4">
                {companies.map((company, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 ${company.color} rounded-lg flex items-center justify-center`}>
                        {company.name === 'Dribbble' && <span className="text-white text-xs font-bold">D</span>}
                        {company.name === 'Instagram' && <span className="text-white text-xs font-bold">I</span>}
                        {company.name === 'Behance' && <span className="text-white text-xs font-bold">B</span>}
                        {company.name === 'Google' && <span className="text-white text-xs font-bold">G</span>}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{company.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">{company.amount}</div>
                      <div className="text-sm text-gray-500">{company.percentage}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="col-span-4 space-y-6">
            {/* Performance Table */}
            <div className="bg-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex space-x-6 text-sm">
                  <span className="text-gray-500">Sales</span>
                  <span className="text-gray-500">Revenue</span>
                  <span className="text-gray-500">Leads</span>
                  <span className="text-gray-500">KPI</span>
                  <span className="text-gray-500">W/L</span>
                </div>
              </div>
              
              <div className="space-y-3">
                {topPerformers.map((performer, index) => (
                  <div key={index} className="flex items-center justify-between py-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full overflow-hidden">
                        <img src={performer.avatar} alt={performer.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-sm font-medium">{performer.name}</span>
                    </div>
                    <div className="flex items-center space-x-3 text-sm">
                      <span>{performer.revenue}</span>
                      <span className="w-6 h-6 bg-gray-900 text-white rounded text-xs flex items-center justify-center">{performer.deals}</span>
                      <span>{performer.conversion}</span>
                      <span>{performer.score}</span>
                      <span>{performer.winRate}</span>
                      <span className="w-6 h-6 bg-gray-900 text-white rounded text-xs flex items-center justify-center">{performer.badge}</span>
                      <span className="text-gray-900">{index === 0 ? '29' : index === 1 ? '33' : '15'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform Integration */}
            <div className="bg-white">
              <div className="flex items-center space-x-2 mb-4">
                <span className="text-sm font-medium">Top sales 💪</span>
                <span className="text-sm font-medium">Sales streak 🔥</span>
                <span className="text-sm font-medium">Top review 👍</span>
              </div>
              
              <div className="mb-4">
                <p className="text-sm font-medium text-gray-900 mb-2">Work with platforms</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-pink-600">❤️ 3</span>
                  <span className="text-sm font-semibold text-pink-600">$156,841</span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-pink-500 rounded"></div>
                    <span>Dribbble</span>
                  </div>
                  <span className="text-gray-500">14.1% $22,114</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-pink-500 rounded"></div>
                    <span>Instagram</span>
                  </div>
                  <span className="text-gray-500">28.1% $44,072</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-gray-900 rounded"></div>
                    <span>Other</span>
                  </div>
                  <span className="text-gray-500">7.1% $11,135</span>
                </div>
              </div>
            </div>

            {/* Sales Dynamic Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Financial Trends</h3>
              <div className="h-32 bg-gray-50 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <span className="text-gray-400 dark:text-gray-500 text-sm">Chart visualization</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}