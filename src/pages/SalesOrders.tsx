import React, { useState } from 'react';
import { Plus, Search, Eye, Edit, Trash2 } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { mockSalesOrders } from '../data/mockData';

export function SalesOrders() {
  const [searchTerm, setSearchTerm] = useState('');

  const columns = [
    {
      key: 'orderNumber',
      header: 'Order Number',
      className: 'font-mono font-medium'
    },
    {
      key: 'customer',
      header: 'Customer',
      className: 'font-medium'
    },
    {
      key: 'date',
      header: 'Order Date',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'dueDate',
      header: 'Due Date',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value === 'Completed' ? 'bg-green-100 text-green-800' :
          value === 'Confirmed' ? 'bg-blue-100 text-blue-800' :
          value === 'Shipped' ? 'bg-purple-100 text-purple-800' :
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

  const totalSales = mockSalesOrders.reduce((sum, order) => sum + order.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
          <p className="text-gray-600">Manage customer orders and sales transactions</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Sales Order
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Orders</h3>
          <p className="text-2xl font-bold text-blue-600">{mockSalesOrders.length}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Sales</h3>
          <p className="text-2xl font-bold text-green-600">${totalSales.toLocaleString()}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Pending Orders</h3>
          <p className="text-2xl font-bold text-orange-600">
            {mockSalesOrders.filter(order => order.status === 'Draft').length}
          </p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Completed Orders</h3>
          <p className="text-2xl font-bold text-purple-600">
            {mockSalesOrders.filter(order => order.status === 'Completed').length}
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
            <option value="Confirmed">Confirmed</option>
            <option value="Shipped">Shipped</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        <Table columns={columns} data={mockSalesOrders} />
      </Card>

      {/* Order Details Modal Placeholder */}
      <Card title="Recent Order Activity">
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
            <div>
              <p className="font-medium text-green-900">Order SO-2024-001 Confirmed</p>
              <p className="text-sm text-green-700">ABC Corporation - $1,299.50</p>
            </div>
            <span className="text-sm text-green-600">2 hours ago</span>
          </div>
          <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
            <div>
              <p className="font-medium text-blue-900">New Order Created</p>
              <p className="text-sm text-blue-700">XYZ Industries - $2,450.00</p>
            </div>
            <span className="text-sm text-blue-600">5 hours ago</span>
          </div>
        </div>
      </Card>
    </div>
  );
}