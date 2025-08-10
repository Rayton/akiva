import React, { useState } from 'react';
import { Calendar, Filter, Search, Download } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { mockTransactions } from '../data/mockData';

export function GeneralLedger() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('All');

  const columns = [
    {
      key: 'date',
      header: 'Date',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'reference',
      header: 'Reference',
      className: 'font-mono'
    },
    {
      key: 'description',
      header: 'Description',
      className: 'max-w-xs'
    },
    {
      key: 'debitAccount',
      header: 'Debit Account',
      className: 'font-mono'
    },
    {
      key: 'creditAccount',
      header: 'Credit Account',
      className: 'font-mono'
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => (
        <span className="font-mono font-semibold">
          ${value.toLocaleString()}
        </span>
      ),
      className: 'text-right'
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value === 'Posted' ? 'bg-green-100 text-green-800' :
          value === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">General Ledger</h1>
          <p className="text-gray-600">View and manage all journal entries</p>
        </div>
        <div className="flex space-x-3">
          <Button variant="secondary">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button>
            <Calendar className="w-4 h-4 mr-2" />
            New Entry
          </Button>
        </div>
      </div>

      <Card>
        <div className="mb-6 flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
            />
          </div>
          <div className="flex gap-3">
            <input
              type="date"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="date"
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Button variant="secondary">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </Button>
          </div>
        </div>

        <Table columns={columns} data={mockTransactions} />
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Debits</h3>
          <p className="text-2xl font-bold text-green-600">
            ${mockTransactions.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
          </p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Credits</h3>
          <p className="text-2xl font-bold text-blue-600">
            ${mockTransactions.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
          </p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Balance</h3>
          <p className="text-2xl font-bold text-gray-900">$0.00</p>
        </Card>
      </div>
    </div>
  );
}