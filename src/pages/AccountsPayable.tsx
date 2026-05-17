import React, { useState } from 'react';
import { Plus, Search, Mail, Phone, AlertCircle } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { mockSuppliers } from '../data/mockData';

export function AccountsPayable() {
  const [searchTerm, setSearchTerm] = useState('');

  const columns = [
    {
      key: 'name',
      header: 'Supplier Name',
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
      key: 'status',
      header: 'Payment Status',
      render: (value: any, row: any) => {
        const isOverdue = row.balance > 1000; // Simple logic for demo
        return (
          <div className="flex items-center">
            {isOverdue && (
              <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
            )}
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              isOverdue ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
            }`}>
              {isOverdue ? 'Overdue' : 'Current'}
            </span>
          </div>
        );
      }
    }
  ];

  const totalPayables = mockSuppliers.reduce((sum, supplier) => sum + supplier.balance, 0);
  const overdueCount = mockSuppliers.filter(supplier => supplier.balance > 1000).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Accounts Payable</h1>
          <p className="text-gray-600">Manage supplier accounts and payment obligations</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Payables</h3>
          <p className="text-2xl font-bold text-red-600">${totalPayables.toLocaleString()}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Active Suppliers</h3>
          <p className="text-2xl font-bold text-blue-600">{mockSuppliers.length}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Overdue Payments</h3>
          <p className="text-2xl font-bold text-orange-600">{overdueCount}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Due This Week</h3>
          <p className="text-2xl font-bold text-purple-600">$3,200</p>
        </Card>
      </div>

      <Card>
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
            />
          </div>
        </div>

        <Table columns={columns} data={mockSuppliers} />
      </Card>

      {/* Payment Schedule */}
      <Card title="Upcoming Payments">
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-red-50 rounded-lg border-l-4 border-red-400">
            <div>
              <p className="font-medium text-red-900">Global Supply Co - Invoice #INV-001</p>
              <p className="text-sm text-red-700">Due: January 25, 2024</p>
            </div>
            <span className="font-bold text-red-600">$2,500</span>
          </div>
          <div className="flex justify-between items-center p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
            <div>
              <p className="font-medium text-yellow-900">Premier Materials - Invoice #INV-002</p>
              <p className="text-sm text-yellow-700">Due: January 28, 2024</p>
            </div>
            <span className="font-bold text-yellow-600">$1,750</span>
          </div>
          <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
            <div>
              <p className="font-medium text-blue-900">Office Supplies Inc - Invoice #INV-003</p>
              <p className="text-sm text-blue-700">Due: February 2, 2024</p>
            </div>
            <span className="font-bold text-blue-600">$850</span>
          </div>
        </div>
      </Card>
    </div>
  );
}