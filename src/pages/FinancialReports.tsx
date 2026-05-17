import React, { useState } from 'react';
import { Download, FileText, Calendar, TrendingUp } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { DateRangePicker, formatDateRangeDisplay, getDefaultDateRange } from '../components/common/DateRangePicker';
import { useSystemDateFormat } from '../lib/dateFormat';

export function FinancialReports() {
  const [selectedReport, setSelectedReport] = useState('balance-sheet');
  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const dateFormat = useSystemDateFormat();

  const reports = [
    {
      id: 'balance-sheet',
      name: 'Balance Sheet',
      description: 'Statement of financial position',
      icon: FileText,
      color: 'text-blue-600'
    },
    {
      id: 'income-statement',
      name: 'Income Statement',
      description: 'Profit and loss statement',
      icon: TrendingUp,
      color: 'text-green-600'
    },
    {
      id: 'cash-flow',
      name: 'Cash Flow Statement',
      description: 'Cash inflows and outflows',
      icon: Calendar,
      color: 'text-purple-600'
    },
    {
      id: 'trial-balance',
      name: 'Trial Balance',
      description: 'List of all general ledger accounts',
      icon: FileText,
      color: 'text-orange-600'
    }
  ];

  const balanceSheetData = {
    assets: {
      current: [
        { name: 'Cash', amount: 50000 },
        { name: 'Accounts Receivable', amount: 25000 },
        { name: 'Inventory', amount: 75000 }
      ],
      nonCurrent: [
        { name: 'Equipment', amount: 100000 },
        { name: 'Accumulated Depreciation', amount: -20000 }
      ]
    },
    liabilities: {
      current: [
        { name: 'Accounts Payable', amount: 15000 },
        { name: 'Short-term Notes', amount: 10000 }
      ],
      longTerm: [
        { name: 'Long-term Debt', amount: 30000 }
      ]
    },
    equity: [
      { name: 'Owner\'s Capital', amount: 150000 },
      { name: 'Retained Earnings', amount: 15000 }
    ]
  };

  const incomeStatementData = [
    { category: 'Revenue', items: [
      { name: 'Sales Revenue', amount: 200000 },
      { name: 'Service Revenue', amount: 50000 }
    ]},
    { category: 'Cost of Goods Sold', items: [
      { name: 'Cost of Goods Sold', amount: 120000 }
    ]},
    { category: 'Operating Expenses', items: [
      { name: 'Salaries Expense', amount: 45000 },
      { name: 'Rent Expense', amount: 12000 },
      { name: 'Utilities Expense', amount: 3000 }
    ]}
  ];

  const renderBalanceSheet = () => {
    const totalCurrentAssets = balanceSheetData.assets.current.reduce((sum, item) => sum + item.amount, 0);
    const totalNonCurrentAssets = balanceSheetData.assets.nonCurrent.reduce((sum, item) => sum + item.amount, 0);
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    const totalCurrentLiabilities = balanceSheetData.liabilities.current.reduce((sum, item) => sum + item.amount, 0);
    const totalLongTermLiabilities = balanceSheetData.liabilities.longTerm.reduce((sum, item) => sum + item.amount, 0);
    const totalLiabilities = totalCurrentLiabilities + totalLongTermLiabilities;

    const totalEquity = balanceSheetData.equity.reduce((sum, item) => sum + item.amount, 0);

    return (
      <div className="space-y-8">
        {/* Assets */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">ASSETS</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Current Assets</h4>
              {balanceSheetData.assets.current.map((item, index) => (
                <div key={index} className="flex justify-between py-2">
                  <span className="text-gray-600">{item.name}</span>
                  <span className="font-mono">${item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-t font-semibold">
                <span>Total Current Assets</span>
                <span className="font-mono">${totalCurrentAssets.toLocaleString()}</span>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Non-Current Assets</h4>
              {balanceSheetData.assets.nonCurrent.map((item, index) => (
                <div key={index} className="flex justify-between py-2">
                  <span className="text-gray-600">{item.name}</span>
                  <span className="font-mono">${item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-t font-semibold">
                <span>Total Non-Current Assets</span>
                <span className="font-mono">${totalNonCurrentAssets.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-between py-3 border-t-2 font-bold text-lg mt-4">
            <span>TOTAL ASSETS</span>
            <span className="font-mono">${totalAssets.toLocaleString()}</span>
          </div>
        </div>

        {/* Liabilities & Equity */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">LIABILITIES & EQUITY</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Current Liabilities</h4>
              {balanceSheetData.liabilities.current.map((item, index) => (
                <div key={index} className="flex justify-between py-2">
                  <span className="text-gray-600">{item.name}</span>
                  <span className="font-mono">${item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-t font-semibold">
                <span>Total Current Liabilities</span>
                <span className="font-mono">${totalCurrentLiabilities.toLocaleString()}</span>
              </div>
              
              <h4 className="font-medium text-gray-700 mb-3 mt-6">Long-term Liabilities</h4>
              {balanceSheetData.liabilities.longTerm.map((item, index) => (
                <div key={index} className="flex justify-between py-2">
                  <span className="text-gray-600">{item.name}</span>
                  <span className="font-mono">${item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-t font-semibold">
                <span>Total Liabilities</span>
                <span className="font-mono">${totalLiabilities.toLocaleString()}</span>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Equity</h4>
              {balanceSheetData.equity.map((item, index) => (
                <div key={index} className="flex justify-between py-2">
                  <span className="text-gray-600">{item.name}</span>
                  <span className="font-mono">${item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-t font-semibold">
                <span>Total Equity</span>
                <span className="font-mono">${totalEquity.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-between py-3 border-t-2 font-bold text-lg mt-4">
            <span>TOTAL LIABILITIES & EQUITY</span>
            <span className="font-mono">${(totalLiabilities + totalEquity).toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderIncomeStatement = () => {
    const revenue = incomeStatementData[0].items.reduce((sum, item) => sum + item.amount, 0);
    const cogs = incomeStatementData[1].items.reduce((sum, item) => sum + item.amount, 0);
    const expenses = incomeStatementData[2].items.reduce((sum, item) => sum + item.amount, 0);
    const grossProfit = revenue - cogs;
    const netIncome = grossProfit - expenses;

    return (
      <div className="space-y-6">
        <div>
          <h4 className="font-medium text-gray-700 mb-3">Revenue</h4>
          {incomeStatementData[0].items.map((item, index) => (
            <div key={index} className="flex justify-between py-2">
              <span className="text-gray-600">{item.name}</span>
              <span className="font-mono">${item.amount.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 border-t font-semibold">
            <span>Total Revenue</span>
            <span className="font-mono">${revenue.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-700 mb-3">Cost of Goods Sold</h4>
          {incomeStatementData[1].items.map((item, index) => (
            <div key={index} className="flex justify-between py-2">
              <span className="text-gray-600">{item.name}</span>
              <span className="font-mono">${item.amount.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 border-t font-semibold text-green-600">
            <span>Gross Profit</span>
            <span className="font-mono">${grossProfit.toLocaleString()}</span>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-700 mb-3">Operating Expenses</h4>
          {incomeStatementData[2].items.map((item, index) => (
            <div key={index} className="flex justify-between py-2">
              <span className="text-gray-600">{item.name}</span>
              <span className="font-mono">${item.amount.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 border-t font-semibold">
            <span>Total Operating Expenses</span>
            <span className="font-mono">${expenses.toLocaleString()}</span>
          </div>
        </div>

        <div className="flex justify-between py-3 border-t-2 font-bold text-lg">
          <span>NET INCOME</span>
          <span className={`font-mono ${netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${netIncome.toLocaleString()}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-600">Generate and view comprehensive financial reports</p>
        </div>
        <Button>
          <Download className="w-4 h-4 mr-2" />
          Export PDF
        </Button>
      </div>

      {/* Report Selection */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedReport === report.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
              }`}
            >
              <div
                className="text-center"
                onClick={() => setSelectedReport(report.id)}
              >
                <Icon className={`w-8 h-8 mx-auto mb-2 ${report.color}`} />
                <h3 className="font-semibold text-gray-900">{report.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{report.description}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Period Selection */}
      <Card>
        <DateRangePicker value={dateRange} onChange={setDateRange} className="max-w-2xl" />
      </Card>

      {/* Report Content */}
      <Card>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
            AccounTech Pro
          </h2>
          <h3 className="text-lg font-semibold text-gray-700 text-center mb-1">
            {reports.find(r => r.id === selectedReport)?.name}
          </h3>
          <p className="text-center text-gray-600">
            {formatDateRangeDisplay(dateRange.from, dateRange.to, dateFormat)}
          </p>
        </div>

        <div className="border-t pt-6">
          {selectedReport === 'balance-sheet' && renderBalanceSheet()}
          {selectedReport === 'income-statement' && renderIncomeStatement()}
          {(selectedReport === 'cash-flow' || selectedReport === 'trial-balance') && (
            <div className="text-center py-12">
              <p className="text-gray-500">
                {reports.find(r => r.id === selectedReport)?.name} report will be displayed here
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
