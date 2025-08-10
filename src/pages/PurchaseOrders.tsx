import React, { useState } from 'react';
import { Plus, Search, Eye, Edit, Trash2 } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { mockPurchaseOrders } from '../data/mockData';

export function PurchaseOrders() {
  const [searchTerm, setSearchTerm] = useState('');

  const columns = [
    {
      key: 'orderNumber',
      header: 'Order Number',
      className: 'font-mono font-medium'
    },
    {
      key: 'supplier',
      header: 'Supplier',
      className: 'font-medium'
    },
    {
      key: 'date',
      header: 'Order Date',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'expectedDate',
      header: 'Expected Date',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value === 'Completed' ? 'bg-green-100 text-green-800' :
          value === 'Approved' ? 'bg-blue-100 text-blue-800' :
          value === 'Received' ? 'bg-purple-100 text-purple-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      )
    },
    {
      key: 'total',
      header: 'Total Amount',
      render: (value: number) => (
        <span className="font-mono font-semibold">
          ${value.toLocaleString()}
        </span>
      ),
      className: 'text-right'
    },
    {
      key: 'actions',
      header: 'Actions',
      render: () => (
        <div className="flex space-x-2">
          <button className="p-1 text-gray-400 hover:text-blue-600 transition-colors">
            <Eye className="w-4 h-4" />
          </button>
          <button className="p-1 text-gray-400 hover:text-green-600 transition-colors">
            <Edit className="w-4 h-4" />
          </button>
          <button className="p-1 text-gray-400 hover:text-red-600 transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )
    }
  ];

  const totalPurchases = mockPurchaseOrders.reduce((sum, order) => sum + order.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-gray-600">Manage supplier orders and procurement</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Purchase Order
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Orders</h3>
          <p className="text-2xl font-bold text-blue-600">{mockPurchaseOrders.length}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Purchases</h3>
          <p className="text-2xl font-bold text-green-600">${totalPurchases.toLocaleString()}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Pending Orders</h3>
          <p className="text-2xl font-bold text-orange-600">
            {mockPurchaseOrders.filter(order => order.status === 'Draft').length}
          </p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Received Orders</h3>
          <p className="text-2xl font-bold text-purple-600">
            {mockPurchaseOrders.filter(order => order.status === 'Received').length}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
            />
          </div>
          <select className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="">All Status</option>
            <option value="Draft">Draft</option>
            <option value="Approved">Approved</option>
            <option value="Received">Received</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <Table columns={columns} data={mockPurchaseOrders} />
      </Card>

      {/* Expected Deliveries */}
      <Card title="Expected Deliveries">
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
            <div>
              <p className="font-medium text-blue-900">PO-2024-001 - Global Supply Co</p>
              <p className="text-sm text-blue-700">Premium Widget A - 100 units</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-blue-600">$2,598.00</p>
              <p className="text-sm text-blue-500">Expected: Jan 25, 2024</p>
            </div>
          </div>
          <div className="flex justify-between items-center p-4 bg-yellow-50 rounded-lg">
            <div>
              <p className="font-medium text-yellow-900">PO-2024-002 - Premier Materials</p>
              <p className="text-sm text-yellow-700">Standard Widget B - 200 units</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-yellow-600">$3,198.00</p>
              <p className="text-sm text-yellow-500">Expected: Jan 30, 2024</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}