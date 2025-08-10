import React, { useState } from 'react';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { mockAccounts } from '../data/mockData';

export function ChartOfAccounts() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('All');

  const filteredAccounts = mockAccounts.filter(account => {
    const matchesSearch = account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         account.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === 'All' || account.type === selectedType;
    return matchesSearch && matchesType;
  });

  const columns = [
    {
      key: 'code',
      header: 'Account Code',
      className: 'font-mono'
    },
    {
      key: 'name',
      header: 'Account Name',
      className: 'font-medium'
    },
    {
      key: 'type',
      header: 'Type',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value === 'Asset' ? 'bg-green-100 text-green-800' :
          value === 'Liability' ? 'bg-red-100 text-red-800' :
          value === 'Equity' ? 'bg-blue-100 text-blue-800' :
          value === 'Revenue' ? 'bg-purple-100 text-purple-800' :
          'bg-orange-100 text-orange-800'
        }`}>
          {value}
        </span>
      )
    },
    {
      key: 'balance',
      header: 'Balance',
      render: (value: number) => (
        <span className="font-mono">
          ${value.toLocaleString()}
        </span>
      ),
      className: 'text-right'
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (value: boolean) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      render: () => (
        <div className="flex space-x-2">
          <button className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
            <Edit className="w-4 h-4" />
          </button>
          <button className="p-1 text-gray-400 hover:text-red-600 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
          <p className="text-gray-600">Manage your company's chart of accounts</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Account
        </Button>
      </div>

      <Card>
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
            />
          </div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="All">All Types</option>
            <option value="Asset">Asset</option>
            <option value="Liability">Liability</option>
            <option value="Equity">Equity</option>
            <option value="Revenue">Revenue</option>
            <option value="Expense">Expense</option>
          </select>
        </div>

        <Table columns={columns} data={filteredAccounts} />
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map((type) => {
          const typeAccounts = mockAccounts.filter(acc => acc.type === type);
          const total = typeAccounts.reduce((sum, acc) => sum + acc.balance, 0);
          
          return (
            <Card key={type} className="text-center">
              <h3 className="font-semibold text-gray-900 mb-2">{type}s</h3>
              <p className="text-2xl font-bold text-blue-600">${total.toLocaleString()}</p>
              <p className="text-sm text-gray-500">{typeAccounts.length} accounts</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}