import React, { useState } from 'react';
import { Plus, Search, Edit, Trash2, Shield, User } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';

export function UserManagement() {
  const [searchTerm, setSearchTerm] = useState('');

  const mockUsers = [
    {
      id: '1',
      name: 'John Doe',
      email: 'john@company.com',
      role: 'Administrator',
      status: 'Active',
      lastLogin: '2024-01-20',
      permissions: ['Full Access']
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@company.com',
      role: 'Accountant',
      status: 'Active',
      lastLogin: '2024-01-19',
      permissions: ['Financial Reports', 'General Ledger', 'Accounts']
    },
    {
      id: '3',
      name: 'Mike Johnson',
      email: 'mike@company.com',
      role: 'Sales Manager',
      status: 'Active',
      lastLogin: '2024-01-18',
      permissions: ['Sales Orders', 'Customers', 'Inventory View']
    },
    {
      id: '4',
      name: 'Sarah Wilson',
      email: 'sarah@company.com',
      role: 'Clerk',
      status: 'Inactive',
      lastLogin: '2024-01-15',
      permissions: ['Data Entry', 'Reports View']
    }
  ];

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (value: string, row: any) => (
        <div className="flex items-center">
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
            <User className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{value}</p>
            <p className="text-sm text-gray-500">{row.email}</p>
          </div>
        </div>
      )
    },
    {
      key: 'role',
      header: 'Role',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value === 'Administrator' ? 'bg-red-100 text-red-800' :
          value === 'Accountant' ? 'bg-blue-100 text-blue-800' :
          value === 'Sales Manager' ? 'bg-green-100 text-green-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          value === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {value}
        </span>
      )
    },
    {
      key: 'lastLogin',
      header: 'Last Login',
      render: (value: string) => new Date(value).toLocaleDateString()
    },
    {
      key: 'permissions',
      header: 'Permissions',
      render: (value: string[]) => (
        <div className="flex flex-wrap gap-1">
          {value.slice(0, 2).map((permission, index) => (
            <span key={index} className="px-2 py-1 rounded text-xs bg-blue-50 text-blue-700">
              {permission}
            </span>
          ))}
          {value.length > 2 && (
            <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">
              +{value.length - 2} more
            </span>
          )}
        </div>
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
          <button className="p-1 text-gray-400 hover:text-green-600 transition-colors">
            <Shield className="w-4 h-4" />
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
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Manage system users and their permissions</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add User
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Total Users</h3>
          <p className="text-2xl font-bold text-blue-600">{mockUsers.length}</p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Active Users</h3>
          <p className="text-2xl font-bold text-green-600">
            {mockUsers.filter(user => user.status === 'Active').length}
          </p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Administrators</h3>
          <p className="text-2xl font-bold text-red-600">
            {mockUsers.filter(user => user.role === 'Administrator').length}
          </p>
        </Card>
        <Card className="text-center">
          <h3 className="font-semibold text-gray-900 mb-2">Inactive Users</h3>
          <p className="text-2xl font-bold text-gray-600">
            {mockUsers.filter(user => user.status === 'Inactive').length}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full"
            />
          </div>
          <select className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="">All Roles</option>
            <option value="Administrator">Administrator</option>
            <option value="Accountant">Accountant</option>
            <option value="Sales Manager">Sales Manager</option>
            <option value="Clerk">Clerk</option>
          </select>
          <select className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="">All Status</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <Table columns={columns} data={mockUsers} />
      </Card>

      {/* Role Permissions */}
      <Card title="Role Permissions">
        <div className="space-y-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Administrator</h4>
            <div className="flex flex-wrap gap-2">
              {['Full Access', 'User Management', 'System Configuration', 'All Reports', 'Data Export'].map((perm) => (
                <span key={perm} className="px-3 py-1 rounded-full text-sm bg-red-100 text-red-800">
                  {perm}
                </span>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Accountant</h4>
            <div className="flex flex-wrap gap-2">
              {['Financial Reports', 'General Ledger', 'Accounts Receivable', 'Accounts Payable', 'Chart of Accounts'].map((perm) => (
                <span key={perm} className="px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                  {perm}
                </span>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Sales Manager</h4>
            <div className="flex flex-wrap gap-2">
              {['Sales Orders', 'Customer Management', 'Inventory View', 'Sales Reports'].map((perm) => (
                <span key={perm} className="px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                  {perm}
                </span>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Clerk</h4>
            <div className="flex flex-wrap gap-2">
              {['Data Entry', 'Basic Reports', 'Read Only Access'].map((perm) => (
                <span key={perm} className="px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-800">
                  {perm}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}