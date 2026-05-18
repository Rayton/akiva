import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type {
  EnterpriseConfigurationPayload,
  EnterpriseConfigurationResponse,
  EnterpriseEntityKey,
  EnterpriseForm,
} from '../types/enterpriseConfiguration';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function errorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  const messages: string[] = [];
  if (payload?.message) messages.push(payload.message);
  if (payload?.errors) {
    Object.values(payload.errors).forEach((value) => {
      if (Array.isArray(value)) messages.push(...value);
      else if (typeof value === 'string') messages.push(value);
    });
  }
  if (payload?.dependencies?.length) {
    messages.push(payload.dependencies.map((dependency) => `${dependency.name}: ${dependency.count}`).join(', '));
  }
  return messages.length > 0 ? messages.join(' | ') : fallback;
}

function normalizePayload(payload: EnterpriseConfigurationPayload): EnterpriseConfigurationPayload {
  const entities = payload.entities ?? {};
  const definitions = payload.definitions ?? {};
  const stats = payload.stats ?? {};

  return {
    definitions: definitions as EnterpriseConfigurationPayload['definitions'],
    entities: entities as EnterpriseConfigurationPayload['entities'],
    lookups: {
      accounts: Array.isArray(payload.lookups?.accounts) ? payload.lookups.accounts : [],
      currencies: Array.isArray(payload.lookups?.currencies) ? payload.lookups.currencies : [],
      fiscalYears: Array.isArray(payload.lookups?.fiscalYears) ? payload.lookups.fiscalYears : [],
      fiscalPeriods: Array.isArray(payload.lookups?.fiscalPeriods) ? payload.lookups.fiscalPeriods : [],
      dimensions: Array.isArray(payload.lookups?.dimensions) ? payload.lookups.dimensions : [],
      dimensionValues: Array.isArray(payload.lookups?.dimensionValues) ? payload.lookups.dimensionValues : [],
      donors: Array.isArray(payload.lookups?.donors) ? payload.lookups.donors : [],
      allocationKeys: Array.isArray(payload.lookups?.allocationKeys) ? payload.lookups.allocationKeys : [],
      taxAuthorities: Array.isArray(payload.lookups?.taxAuthorities) ? payload.lookups.taxAuthorities : [],
      taxCategories: Array.isArray(payload.lookups?.taxCategories) ? payload.lookups.taxCategories : [],
      taxProvinces: Array.isArray(payload.lookups?.taxProvinces) ? payload.lookups.taxProvinces : [],
    },
    stats: stats as EnterpriseConfigurationPayload['stats'],
    controls: payload.controls,
  };
}

async function readPayload(response: Response, fallback: string): Promise<EnterpriseConfigurationResponse> {
  const payload = await parseJson<EnterpriseConfigurationResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as EnterpriseConfigurationPayload);
  return payload;
}

export async function fetchEnterpriseConfiguration(): Promise<EnterpriseConfigurationPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/enterprise'));
  return normalizePayload((await readPayload(response, 'Enterprise configuration could not be loaded.')).data as EnterpriseConfigurationPayload);
}

export async function saveEnterpriseConfigurationRecord(
  entity: EnterpriseEntityKey,
  form: EnterpriseForm,
  id?: number
): Promise<EnterpriseConfigurationResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/enterprise/${entity}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(form),
  });
  return readPayload(response, 'Enterprise configuration record could not be saved.');
}

export async function deleteEnterpriseConfigurationRecord(entity: EnterpriseEntityKey, id: number): Promise<EnterpriseConfigurationResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/enterprise/${entity}/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Enterprise configuration record could not be deleted.');
}

export async function updateFiscalPeriodStatus(id: number, action: 'open' | 'close' | 'lock' | 'adjustment', reason?: string): Promise<EnterpriseConfigurationResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/enterprise/fiscal-periods/${id}/${action}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ reason: reason ?? '' }),
  });
  return readPayload(response, 'Fiscal period status could not be updated.');
}
