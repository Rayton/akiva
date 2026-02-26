import {
  CreateSalesOrderPayload,
  CreateSalesOrderResult,
  OnlineSalesOrder,
  SalesContractDetail,
  SalesContractLookups,
  SalesContractPayload,
  SalesContractQuoteResult,
  SalesContractSummary,
  SalesCustomer,
  SalesDailySalesRow,
  SalesLowGrossRow,
  SalesOrderStatusRow,
  SalesOutstandingOrder,
  SalesPickingCandidate,
  SalesPriceListItem,
  SalesReportSummary,
  SalesRecurringProcessResult,
  SalesRecurringTemplate,
  SalesSettings,
  SalesStockItem,
  SalesTopItem,
  SalesTransaction,
} from '../types/sales';
import { apiFetch } from '../lib/network/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8877';

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
}

interface ApiObjectResponse<T> {
  success: boolean;
  data: T;
}

export async function fetchOnlineSalesOrders(limit = 250): Promise<OnlineSalesOrder[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/orders?limit=${limit}`);
    if (!response.ok) return [];

    const data: ApiListResponse<OnlineSalesOrder> = await response.json();
    if (!data.success || !Array.isArray(data.data)) return [];
    return data.data;
  } catch (error) {
    console.error('Failed to fetch online sales orders:', error);
    return [];
  }
}

export async function fetchSalesTransactions(limit = 250, search = ''): Promise<SalesTransaction[]> {
  try {
    const query = new URLSearchParams({
      limit: String(limit),
      q: search,
    });
    const response = await apiFetch(`${API_BASE_URL}/api/sales/transactions?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesTransaction> = await response.json();
    return data.success && Array.isArray(data.data) ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch sales transactions:', error);
    return [];
  }
}

export async function fetchSalesReportSummary(months = 12): Promise<SalesReportSummary | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/reports/summary?months=${months}`);
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesReportSummary> = await response.json();
    return data.success && data.data ? data.data : null;
  } catch (error) {
    console.error('Failed to fetch sales report summary:', error);
    return null;
  }
}

export async function fetchSalesSettings(): Promise<SalesSettings | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/settings`);
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesSettings> = await response.json();
    return data.success && data.data ? data.data : null;
  } catch (error) {
    console.error('Failed to fetch sales settings:', error);
    return null;
  }
}

export async function fetchSalesCustomers(search = ''): Promise<SalesCustomer[]> {
  try {
    const query = new URLSearchParams({ q: search, limit: '50' });
    const response = await apiFetch(`${API_BASE_URL}/api/sales/customers?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesCustomer> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch sales customers:', error);
    return [];
  }
}

export async function fetchSalesItems(search = ''): Promise<SalesStockItem[]> {
  try {
    const query = new URLSearchParams({ q: search, limit: '80' });
    const response = await apiFetch(`${API_BASE_URL}/api/sales/items?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesStockItem> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch sales items:', error);
    return [];
  }
}

export async function createSalesOrderOnline(
  payload: CreateSalesOrderPayload
): Promise<CreateSalesOrderResult | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const data: ApiObjectResponse<CreateSalesOrderResult> = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to create sales order:', error);
    return null;
  }
}

export async function fetchOutstandingSalesOrders(search = ''): Promise<SalesOutstandingOrder[]> {
  try {
    const query = new URLSearchParams({ q: search, limit: '120' });
    const response = await apiFetch(`${API_BASE_URL}/api/sales/outstanding-orders?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesOutstandingOrder> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch outstanding sales orders:', error);
    return [];
  }
}

export async function fetchPickingListCandidates(search = ''): Promise<SalesPickingCandidate[]> {
  try {
    const query = new URLSearchParams({ q: search, limit: '120' });
    const response = await apiFetch(`${API_BASE_URL}/api/sales/picking-lists?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesPickingCandidate> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch picking list candidates:', error);
    return [];
  }
}

export async function fetchRecurringTemplates(search = ''): Promise<SalesRecurringTemplate[]> {
  try {
    const query = new URLSearchParams({ q: search, limit: '120' });
    const response = await apiFetch(`${API_BASE_URL}/api/sales/recurring/templates?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesRecurringTemplate> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch recurring templates:', error);
    return [];
  }
}

export async function processRecurringOrders(templateIds: number[]): Promise<SalesRecurringProcessResult | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/recurring/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateIds }),
    });
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesRecurringProcessResult> = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to process recurring orders:', error);
    return null;
  }
}

export async function fetchSalesPriceList(limit = 200): Promise<SalesPriceListItem[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/reports/price-list?limit=${limit}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesPriceListItem> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch sales price list:', error);
    return [];
  }
}

export async function fetchSalesOrderStatus(search = ''): Promise<SalesOrderStatusRow[]> {
  try {
    const query = new URLSearchParams({ q: search, limit: '120' });
    const response = await apiFetch(`${API_BASE_URL}/api/sales/reports/order-status?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesOrderStatusRow> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch sales order status:', error);
    return [];
  }
}

export async function fetchSalesDailyInquiry(days = 30): Promise<SalesDailySalesRow[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/reports/daily-inquiry?days=${days}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesDailySalesRow> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch daily sales inquiry:', error);
    return [];
  }
}

export async function fetchSalesTopItems(limit = 20): Promise<SalesTopItem[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/reports/top-items?limit=${limit}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesTopItem> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch top sales items:', error);
    return [];
  }
}

export async function fetchSalesLowGrossReport(limit = 20): Promise<SalesLowGrossRow[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/reports/low-gross?limit=${limit}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesLowGrossRow> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch low gross report:', error);
    return [];
  }
}

export async function fetchSalesContractLookups(): Promise<SalesContractLookups | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/contracts/lookups`);
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesContractLookups> = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to fetch sales contract lookups:', error);
    return null;
  }
}

export async function fetchSalesContracts(params?: {
  q?: string;
  status?: number;
  debtorNo?: string;
  limit?: number;
}): Promise<SalesContractSummary[]> {
  try {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.status !== undefined) query.set('status', String(params.status));
    if (params?.debtorNo) query.set('debtorNo', params.debtorNo);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(`${API_BASE_URL}/api/sales/contracts?${query.toString()}`);
    if (!response.ok) return [];
    const data: ApiListResponse<SalesContractSummary> = await response.json();
    return data.success ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch sales contracts:', error);
    return [];
  }
}

export async function fetchSalesContractDetail(contractRef: string): Promise<SalesContractDetail | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/contracts/${encodeURIComponent(contractRef)}`);
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesContractDetail> = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to fetch sales contract detail:', error);
    return null;
  }
}

export async function createSalesContract(payload: SalesContractPayload): Promise<SalesContractDetail | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesContractDetail> = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to create sales contract:', error);
    return null;
  }
}

export async function updateSalesContract(
  contractRef: string,
  payload: Omit<SalesContractPayload, 'contractRef'>
): Promise<SalesContractDetail | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/contracts/${encodeURIComponent(contractRef)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesContractDetail> = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to update sales contract:', error);
    return null;
  }
}

export async function quoteSalesContract(contractRef: string): Promise<SalesContractQuoteResult | null> {
  try {
    const response = await apiFetch(
      `${API_BASE_URL}/api/sales/contracts/${encodeURIComponent(contractRef)}/quote`,
      { method: 'POST' }
    );
    if (!response.ok) return null;
    const data: ApiObjectResponse<SalesContractQuoteResult> = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Failed to quote sales contract:', error);
    return null;
  }
}

export async function cancelSalesContract(contractRef: string): Promise<boolean> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/sales/contracts/${encodeURIComponent(contractRef)}`, {
      method: 'DELETE',
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.success);
  } catch (error) {
    console.error('Failed to cancel sales contract:', error);
    return false;
  }
}
