import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { SystemCheckPayload } from '../types/systemCheck';

interface SystemCheckResponse {
  success: boolean;
  data: SystemCheckPayload;
  message?: string;
}

export async function fetchSystemCheck(): Promise<SystemCheckPayload> {
  const response = await apiFetch(buildApiUrl('/api/system/check'));
  const payload: SystemCheckResponse = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload.message ?? 'System check could not be loaded.');
  }

  return payload.data;
}
