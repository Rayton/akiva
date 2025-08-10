import React, { useState } from 'react';
import { Plus, Search, Package, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { mockProducts } from '../data/mockData';

export function Inventory() {
  const [searchTerm, setSearchTerm] = useState('');

  const columns = [
    {
      key: 'code',
      header: 'Product Code',
      className: 'font-mono'
    },
    {
      key: 'name',
      header: 'Product Name',
      className: 'font-medium'
    },
    {
      key: 'category',
      header: 'Category',
      render: (value: string) => (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {value}
        </span>
      )
    },
    {
      key: 'unitPrice',
      header: 'Unit Price',
      render: (value: number) => (
        <span className="font-mono">
          ${value.toFixed(2)}
        </span>
      ),
      className: 'text-right'
    },
    {
      key: 'stockLevel',
      header: 'Stock Level',
      render: (value: number, row: any) => (
        <div className="flex items-center">
          <span className={`font-medium ${
            value <= row.reorderLevel ? 'text-red-600' : 'text-green-600'
          }`}>
            {value}
          </span>
          {value <= row.reorderLevel && (
            <AlertTriangle className="w-4 h-4 ml-2 text-red-500" />
          )}
        </div>
      )
    },
    {
      key: 'reorderLevel',
      header: 'Reorder Level',
      className: 'text-center'
    },
    {
      key: 'value',
      header: 'Total Value',
      render: (value: any, row: any) => (
        <span className="font-mono font-semibold">
          ${(row.stockLevel * row.unitPrice).toLocaleString()}
        </span>
      ),
      className: 'text-right'
    }
  ];

  const totalValue = mockProducts.reduce((sum, product) => sum + (product.stockLevel * product.unitPrice), 0);
  const lowStockItems = mockProducts.filter(product => product.stockLevel <= product.reorderLevel);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-600">Track and manage your product inventory</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Product
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Package className="w-6 h-6 text-blue-600 mr-2" />
            <h3 className="font-semibold text-gray-900">Total Products</h3>
          </div>
          <p className="text-2xl font-bold text-blue-600">{mockProducts.length}</p>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center mb-2">
            <TrendingUp className="w-6 h-6 text-green-600 mr-2" />
            <h3 className="font-semibold text-gray-900">Total Value</h3>
          </div>
          <p className="text-2xl font-bold text-green-600">${totalValue.toLocaleString()}</p>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center mb-2">
            <AlertTriangle className="w-6 h-6 text-red-600 mr-2" />
            <h3 className="font-semibold text-gray-900">Low Stock Items</h3>
          </div>
          <p className="text-2xl font-bold text-red-600">{lowStockItems.length}</p>
        </Card>
        <Card className="text-center">
          <div className="flex items-center justify-center mb-2">
            <TrendingDown className="w-6 h-6 text-orange-600 mr-2" />
            <h3 className="font-semibold text-gray-900">Out of Stock</h3>
          </div>
          <p className="text-2xl font-bold text-orange-600">0</p>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-l-4 border-red-400 bg-red-50">
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-red-600 mr-3" />
            <div>
              <h3 className="font-semibold text-red-900">Low Stock Alert</h3>
              <p className="text-red-700">
                {lowStockItems.length} product{lowStockItems.length !== 1 ? 's' : ''} below reorder level
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
            />
          </div>
        </div>

        <Table columns={columns} data={mockProducts} />
      </Card>

      {/* Inventory Movements */}
      <Card title="Recent Inventory Movements">
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
            <div>
              <p className="font-medium text-green-900">Stock Receipt - Premium Widget A</p>
              <p className="text-sm text-green-700">Received from Global Supply Co</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-green-600">+50 units</p>
              <p className="text-sm text-green-500">Jan 20, 2024</p>
            </div>
          </div>
          <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
            <div>
              <p className="font-medium text-red-900">Sale - Standard Widget B</p>
              <p className="text-sm text-red-700">Sold to ABC Corporation</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-red-600">-25 units</p>
              <p className="text-sm text-red-500">Jan 19, 2024</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}