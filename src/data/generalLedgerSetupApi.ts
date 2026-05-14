import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { GeneralLedgerSetupForm, GeneralLedgerSetupPayload, GeneralLedgerSetupTab } from '../types/generalLedgerSetup';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

interface GeneralLedgerSetupResponse extends ApiErrorPayload {
  success: boolean;
  data?: GeneralLedgerSetupPayload & { selectedId?: string | number };
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

function normalizePayload(payload: GeneralLedgerSetupPayload): GeneralLedgerSetupPayload {
  return {
    bankAccounts: Array.isArray(payload.bankAccounts) ? payload.bankAccounts : [],
    currencies: Array.isArray(payload.currencies)
      ? payload.currencies.map((currency) => ({ ...currency, rate: Number(currency.rate ?? 0), decimalPlaces: Number(currency.decimalPlaces ?? 2), webcart: Boolean(currency.webcart) }))
      : [],
    taxAuthorities: Array.isArray(payload.taxAuthorities) ? payload.taxAuthorities : [],
    taxGroups: Array.isArray(payload.taxGroups) ? payload.taxGroups : [],
    taxProvinces: Array.isArray(payload.taxProvinces) ? payload.taxProvinces : [],
    taxCategories: Array.isArray(payload.taxCategories) ? payload.taxCategories : [],
    periods: Array.isArray(payload.periods) ? payload.periods : [],
    lookups: {
      accounts: Array.isArray(payload.lookups?.accounts) ? payload.lookups.accounts : [],
      currencies: Array.isArray(payload.lookups?.currencies) ? payload.lookups.currencies : [],
    },
    stats: {
      bankAccounts: Number(payload.stats?.bankAccounts ?? 0),
      currencies: Number(payload.stats?.currencies ?? 0),
      taxAuthorities: Number(payload.stats?.taxAuthorities ?? 0),
      taxGroups: Number(payload.stats?.taxGroups ?? 0),
      taxProvinces: Number(payload.stats?.taxProvinces ?? 0),
      taxCategories: Number(payload.stats?.taxCategories ?? 0),
      periods: Number(payload.stats?.periods ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<GeneralLedgerSetupResponse> {
  const payload = await parseJson<GeneralLedgerSetupResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as GeneralLedgerSetupPayload);
  return payload;
}

export async function fetchGeneralLedgerSetup(): Promise<GeneralLedgerSetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/general-ledger/setup'));
  return normalizePayload((await readPayload(response, 'General ledger setup could not be loaded.')).data as GeneralLedgerSetupPayload);
}

export async function saveGeneralLedgerSetupRecord(
  tab: GeneralLedgerSetupTab,
  form: GeneralLedgerSetupForm,
  id?: string | number
): Promise<GeneralLedgerSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/general-ledger/setup/${tab}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(form),
  });
  return readPayload(response, 'Setup record could not be saved.');
}

export async function deleteGeneralLedgerSetupRecord(tab: GeneralLedgerSetupTab, id: string | number): Promise<GeneralLedgerSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/general-ledger/setup/${tab}/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Setup record could not be deleted.');
}
