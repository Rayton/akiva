import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { AssetManagerDashboard } from '../types/assetManager';

interface AssetManagerDashboardResponse {
  success: boolean;
  data: AssetManagerDashboard;
  message?: string;
}

export interface AssetManagerFilters {
  q?: string;
  category?: string;
  location?: string;
  status?: string;
}

export async function fetchAssetManagerDashboard(filters: AssetManagerFilters = {}): Promise<AssetManagerDashboard> {
  const query = new URLSearchParams();

  if (filters.q) query.set('q', filters.q);
  if (filters.category && filters.category !== 'all') query.set('category', filters.category);
  if (filters.location && filters.location !== 'all') query.set('location', filters.location);
  if (filters.status && filters.status !== 'all') query.set('status', filters.status);

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiFetch(buildApiUrl(`/api/asset-manager/dashboard${suffix}`));
  const payload = (await response.json()) as AssetManagerDashboardResponse;

  if (!response.ok || !payload.success) {
    throw new Error(payload.message || 'Asset manager dashboard could not be loaded.');
  }

  return payload.data;
}
