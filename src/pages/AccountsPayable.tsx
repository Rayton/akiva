import React, { useEffect, useMemo, useState } from 'react';
import { Search, Mail, Phone, AlertCircle } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { apiClient } from '../lib/network/apiClient';

interface SupplierRow { id:number; supplier_code:string; name:string; email?:string; phone?:string; }
interface ApiPayload { suppliers: SupplierRow[]; summary: { totalPayables:number; activeSuppliers:number; overdueBills:number; dueThisWeek:number; }; }

export function AccountsPayable() {
  const [searchTerm, setSearchTerm] = useState('');
  const [payload, setPayload] = useState<ApiPayload | null>(null);

  useEffect(() => {
    const run = async () => {
      const res = await apiClient.get<{ success:boolean; data:ApiPayload }>(`/payables${searchTerm ? `?q=${encodeURIComponent(searchTerm)}` : ''}`);
      if (res.success) setPayload(res.data);
    };
    run();
  }, [searchTerm]);

  const data = payload?.suppliers ?? [];
  const summary = payload?.summary;

  const columns = useMemo(() => ([
    { key: 'name', header: 'Supplier Name', className: 'font-medium' },
    { key: 'email', header: 'Email', render: (value: string) => <div className="flex items-center"><Mail className="w-4 h-4 mr-2 text-gray-400" /><span className="text-sm">{value || '-'}</span></div> },
    { key: 'phone', header: 'Phone', render: (value: string) => <div className="flex items-center"><Phone className="w-4 h-4 mr-2 text-gray-400" /><span className="text-sm">{value || '-'}</span></div> },
    { key: 'status', header: 'Payment Status', render: () => <div className="flex items-center"><AlertCircle className="w-4 h-4 mr-2 text-amber-500" /><span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Tracked</span></div> }
  ]), []);

  return (
    <div className="space-y-6">
      <div><h1 className="text-lg font-bold text-gray-900">Accounts Payable</h1><p className="text-gray-600">Modern bill capture, approval and payment tracking.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center"><h3 className="font-semibold text-gray-900 mb-2">Total Payables</h3><p className="text-2xl font-bold text-red-600">${(summary?.totalPayables ?? 0).toLocaleString()}</p></Card>
        <Card className="text-center"><h3 className="font-semibold text-gray-900 mb-2">Active Suppliers</h3><p className="text-2xl font-bold text-blue-600">{summary?.activeSuppliers ?? 0}</p></Card>
        <Card className="text-center"><h3 className="font-semibold text-gray-900 mb-2">Overdue Bills</h3><p className="text-2xl font-bold text-orange-600">{summary?.overdueBills ?? 0}</p></Card>
        <Card className="text-center"><h3 className="font-semibold text-gray-900 mb-2">Due This Week</h3><p className="text-2xl font-bold text-purple-600">${(summary?.dueThisWeek ?? 0).toLocaleString()}</p></Card>
      </div>
      <Card>
        <div className="mb-6"><div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" /><input type="text" placeholder="Search suppliers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full" /></div></div>
        <Table columns={columns} data={data} />
      </Card>
    </div>
  );
}
