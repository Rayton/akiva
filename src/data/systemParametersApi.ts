import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { SystemParametersPayload, SystemParameterValues } from '../types/systemParameters';

interface ApiObjectResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

export const EMPTY_SYSTEM_PARAMETER_LOOKUPS: SystemParametersPayload['lookups'] = {
  priceLists: [],
  shippers: [],
  taxCategories: [],
  locations: [],
  periodLocks: [],
};

async function parseResponseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function collectErrorMessages(payload: ApiErrorPayload | null): string[] {
  if (!payload) return [];
  const messages: string[] = [];
  if (payload.message) messages.push(payload.message);

  if (payload.errors) {
    Object.values(payload.errors).forEach((value) => {
      if (Array.isArray(value)) {
        messages.push(...value);
      } else if (typeof value === 'string') {
        messages.push(value);
      }
    });
  }

  return messages;
}

async function assertSuccess(response: Response): Promise<void> {
  if (response.ok) return;

  const payload = await parseResponseJson<ApiErrorPayload>(response);
  const messages = collectErrorMessages(payload);
  throw new Error(messages.length > 0 ? messages.join(' | ') : `Request failed with status ${response.status}`);
}

function normalizePayload(payload: SystemParametersPayload): SystemParametersPayload {
  return {
    parameters: payload.parameters && typeof payload.parameters === 'object' ? payload.parameters : {},
    lookups: {
      priceLists: Array.isArray(payload.lookups?.priceLists) ? payload.lookups.priceLists : [],
      shippers: Array.isArray(payload.lookups?.shippers) ? payload.lookups.shippers : [],
      taxCategories: Array.isArray(payload.lookups?.taxCategories) ? payload.lookups.taxCategories : [],
      locations: Array.isArray(payload.lookups?.locations) ? payload.lookups.locations : [],
      periodLocks: Array.isArray(payload.lookups?.periodLocks) ? payload.lookups.periodLocks : [],
    },
  };
}

export async function fetchSystemParameters(): Promise<SystemParametersPayload> {
  const response = await apiFetch(buildApiUrl('/api/system/parameters'));
  await assertSuccess(response);

  const data = await parseResponseJson<ApiObjectResponse<SystemParametersPayload>>(response);
  if (!data?.success || !data.data) throw new Error('Invalid system settings response payload.');

  return normalizePayload(data.data);
}

export async function updateSystemParameters(parameters: SystemParameterValues): Promise<SystemParametersPayload> {
  const response = await apiFetch(buildApiUrl('/api/system/parameters'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ parameters }),
  });

  await assertSuccess(response);

  const data = await parseResponseJson<ApiObjectResponse<SystemParametersPayload>>(response);
  if (!data?.success || !data.data) throw new Error('Invalid system settings update response payload.');

  return normalizePayload(data.data);
}
