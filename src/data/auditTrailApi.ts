import { buildApiUrl } from '../lib/network/apiBase';
import { apiFetch } from '../lib/network/apiClient';
import type { AuditTrailFilters, AuditTrailPayload } from '../types/auditTrail';

interface AuditTrailResponse {
  success: boolean;
  data: AuditTrailPayload;
  message?: string;
}

export async function fetchAuditTrail(filters: AuditTrailFilters): Promise<AuditTrailPayload> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== 0) {
      const apiKey = key === 'perPage' ? 'per_page' : key === 'sortDir' ? 'sort_dir' : key;
      params.set(apiKey, String(value));
    }
  });

  const response = await apiFetch(buildApiUrl(`/api/audit-trail?${params.toString()}`));
  const payload: AuditTrailResponse = await response.json();

  if (!response.ok || !payload.success) {
    throw new Error(payload.message ?? 'Audit trail could not be loaded.');
  }

  return payload.data;
}
