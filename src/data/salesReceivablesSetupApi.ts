import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { SalesReceivablesSetupForm, SalesReceivablesSetupPayload, SalesReceivablesSetupTab } from '../types/salesReceivablesSetup';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

interface SalesReceivablesSetupResponse extends ApiErrorPayload {
  success: boolean;
  data?: SalesReceivablesSetupPayload & { selectedId?: string };
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

function normalizePayload(payload: SalesReceivablesSetupPayload): SalesReceivablesSetupPayload {
  return {
    salesTypes: Array.isArray(payload.salesTypes)
      ? payload.salesTypes.map((row) => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
        }))
      : [],
    customerTypes: Array.isArray(payload.customerTypes)
      ? payload.customerTypes.map((row) => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? ''),
        }))
      : [],
    stats: {
      salesTypes: Number(payload.stats?.salesTypes ?? 0),
      customerTypes: Number(payload.stats?.customerTypes ?? 0),
      priceRows: Number(payload.stats?.priceRows ?? 0),
      customers: Number(payload.stats?.customers ?? 0),
      transactions: Number(payload.stats?.transactions ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<SalesReceivablesSetupResponse> {
  const payload = await parseJson<SalesReceivablesSetupResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as SalesReceivablesSetupPayload);
  return payload;
}

export async function fetchSalesReceivablesSetup(): Promise<SalesReceivablesSetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/sales-receivables/setup'));
  return normalizePayload((await readPayload(response, 'Sales and receivables setup could not be loaded.')).data as SalesReceivablesSetupPayload);
}

export async function saveSalesReceivablesSetupRecord(
  tab: SalesReceivablesSetupTab,
  form: SalesReceivablesSetupForm,
  id?: string | number
): Promise<SalesReceivablesSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/sales-receivables/setup/${tab}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...form,
      code: form.code?.trim().toUpperCase().replace(/\s+/g, ''),
      name: form.name.trim(),
    }),
  });
  return readPayload(response, 'Sales and receivables setup record could not be saved.');
}

export async function deleteSalesReceivablesSetupRecord(tab: SalesReceivablesSetupTab, id: string | number): Promise<SalesReceivablesSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/sales-receivables/setup/${tab}/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Sales and receivables setup record could not be deleted.');
}
