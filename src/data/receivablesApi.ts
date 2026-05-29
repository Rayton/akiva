import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { ReceivablesDashboardPayload } from '../types/receivables';

interface ApiObjectResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export async function fetchReceivablesDashboard(limit = 8): Promise<ReceivablesDashboardPayload | null> {
  try {
    const response = await apiFetch(buildApiUrl(`/api/receivables/dashboard?limit=${limit}`));
    if (!response.ok) return null;

    const payload: ApiObjectResponse<ReceivablesDashboardPayload> = await response.json();
    return payload.success && payload.data ? payload.data : null;
  } catch (error) {
    console.error('Failed to fetch receivables dashboard:', error);
    return null;
  }
}
