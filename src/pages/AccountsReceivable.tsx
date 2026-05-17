import React, { useState } from 'react';
import { Plus, Search, Mail, Phone } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { mockCustomers } from '../data/mockData';

export function AccountsReceivable() {
  const [searchTerm, setSearchTerm] = useState('');

  const columns = [
    {
      key: 'name',
      header: 'Customer Name',
      className: 'font-medium'
    },
    {
      key: 'email',
      header: 'Email',
      render: (value: string) => (
        <div className="flex items-center">
          <Mail className="w-4 h-4 mr-2 text-gray-400" />
          <span className="text-sm">{value}</span>
        </div>
      )
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (value: string) => (
        <div className="flex items-center">
          <Phone className="w-4 h-4 mr-2 text-gray-400" />
          <span className="text-sm">{value}</span>
        </div>
      )
    },
    {
      key: 'balance',
      header: 'Outstanding Balance',
      render: (value: number) => (
        <span className={`font-mono font-semibold ${
          value > 0 ? 'text-red-600' : 'text-green-600'
        }`}>
          ${value.toLocaleString()}
        </span>
      ),
      className: 'text-right'
    },
    {
      key: 'creditLimit',
      header: 'Credit Limit',
      render: (value: number) => (
        <span className="font-mono">
          ${value.toLocaleString()}
        </span>
      ),
      className: 'text-right'
    },
    {
      key: 'utilization',
      header: 'Credit Utilization',
      render: (value: any, row: any) => {
        const utilization = (row.balance / row.creditLimit) * 100;
        return (
          <div className="w-full">
            <div className="flex justify-between text-sm mb-1">
              <span>{utilization.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  utilization > 80 ? 'bg-red-500' :
                  utilization > 60 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(utilization, 100)}%` }}
              ></div>
            </div>
          </div>
        );
      }
    }
  ];

  const totalReceivables = mockCustomers.reduce((sum, customer) => sum + customer.balance, 0);
  const overdue = mockCustomers.filter(customer => customer.balance > customer.creditLimit * 0.8).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Accounts Receivable</h1>
          <p className="text-gray-600">Manage customer accounts and outstanding balances</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Customer
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Receivables</h3>
          <p className="text-2xl font-bold text-blue-600">${totalReceivables.toLocaleString()}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Active Customers</h3>
          <p className="text-2xl font-bold text-green-600">{mockCustomers.length}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Overdue Accounts</h3>
          <p className="text-2xl font-bold text-red-600">{overdue}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Average Balance</h3>
          <p className="text-2xl font-bold text-purple-600">
            ${(totalReceivables / mockCustomers.length).toLocaleString()}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
            />
          </div>
        </div>

        <Table columns={columns} data={mockCustomers} />
      </Card>

      {/* Aging Report */}
      <Card title="Aging Report">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-sm font-medium text-green-800">Current (0-30 days)</p>
            <p className="text-xl font-bold text-green-600">$15,450</p>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-sm font-medium text-yellow-800">31-60 days</p>
            <p className="text-xl font-bold text-yellow-600">$5,200</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-sm font-medium text-orange-800">61-90 days</p>
            <p className="text-xl font-bold text-orange-600">$2,100</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-sm font-medium text-red-800">90+ days</p>
            <p className="text-xl font-bold text-red-600">$750</p>
          </div>
        </div>
      </Card>
    </div>
  );
}