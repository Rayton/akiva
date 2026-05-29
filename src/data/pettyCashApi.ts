import { buildApiUrl } from '../lib/network/apiBase';
import { apiFetch } from '../lib/network/apiClient';
import type { PettyCashDashboard } from '../types/pettyCash';

interface PettyCashDashboardResponse {
  success: boolean;
  data: PettyCashDashboard;
  message?: string;
}

export interface PettyCashFilters {
  q?: string;
  tab?: string;
  status?: string;
  from?: string;
  to?: string;
}

export async function fetchPettyCashDashboard(filters: PettyCashFilters = {}): Promise<PettyCashDashboard> {
  const query = new URLSearchParams();

  if (filters.q) query.set('q', filters.q);
  if (filters.tab && filters.tab !== 'all') query.set('tab', filters.tab);
  if (filters.status && filters.status !== 'all') query.set('status', filters.status);
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiFetch(buildApiUrl(`/api/petty-cash/dashboard${suffix}`));
  const payload = (await response.json()) as PettyCashDashboardResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Petty cash dashboard could not be loaded.');
  }

  return payload.data;
}
