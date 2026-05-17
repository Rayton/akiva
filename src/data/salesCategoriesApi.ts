import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { SalesCategoriesPayload, SalesCategory, SalesCategoryForm, SalesCategoryLookupOption } from '../types/salesCategories';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

interface SalesCategoriesResponse extends ApiErrorPayload {
  success: boolean;
  data?: SalesCategoriesPayload;
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

function normalizeLookup(rows: SalesCategoryLookupOption[] | undefined): SalesCategoryLookupOption[] {
  return Array.isArray(rows) ? rows.map((row) => ({ code: String(row.code ?? ''), name: String(row.name ?? '') })) : [];
}

function normalizeCategory(row: SalesCategory): SalesCategory {
  return {
    id: Number(row.id ?? 0),
    name: String(row.name ?? ''),
    parentId: row.parentId === null || row.parentId === undefined ? null : Number(row.parentId),
    parentName: String(row.parentName ?? ''),
    active: Boolean(row.active),
    productCount: Number(row.productCount ?? 0),
    childCount: Number(row.childCount ?? 0),
    path: String(row.path ?? row.name ?? ''),
  };
}

function normalizePayload(payload: SalesCategoriesPayload): SalesCategoriesPayload {
  return {
    categories: Array.isArray(payload.categories) ? payload.categories.map(normalizeCategory) : [],
    lookups: {
      parents: normalizeLookup(payload.lookups?.parents),
    },
    stats: {
      total: Number(payload.stats?.total ?? 0),
      active: Number(payload.stats?.active ?? 0),
      inactive: Number(payload.stats?.inactive ?? 0),
      productLinks: Number(payload.stats?.productLinks ?? 0),
    },
    selectedId: payload.selectedId === undefined ? undefined : Number(payload.selectedId),
  };
}

async function readPayload(response: Response, fallback: string): Promise<SalesCategoriesResponse> {
  const payload = await parseJson<SalesCategoriesResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data);
  return payload;
}

export async function fetchSalesCategories(): Promise<SalesCategoriesPayload> {
  const response = await apiFetch(buildApiUrl('/api/inventory/sales-categories'));
  return normalizePayload((await readPayload(response, 'Sales categories could not be loaded.')).data as SalesCategoriesPayload);
}

export async function saveSalesCategory(form: SalesCategoryForm, id?: number): Promise<SalesCategoriesResponse> {
  const response = await apiFetch(buildApiUrl(`/api/inventory/sales-categories${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: form.name.trim(),
      parentId: form.parentId === 'root' ? null : Number(form.parentId),
      active: form.active,
    }),
  });

  return readPayload(response, 'Sales category could not be saved.');
}

export async function deleteSalesCategory(id: number): Promise<SalesCategoriesResponse> {
  const response = await apiFetch(buildApiUrl(`/api/inventory/sales-categories/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  return readPayload(response, 'Sales category could not be deleted.');
}
