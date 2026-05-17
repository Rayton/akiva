import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type {
  InternalStockCategory,
  InternalStockCategoryRole,
  InternalStockCategoryRoleAssignment,
  InternalStockCategoryRoleForm,
  InternalStockCategoryRolesPayload,
} from '../types/internalStockCategoryRoles';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface InternalStockCategoryRolesResponse extends ApiErrorPayload {
  success: boolean;
  message?: string;
  data?: InternalStockCategoryRolesPayload;
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
  return messages.length > 0 ? messages.join(' | ') : fallback;
}

function normalizeRole(row: InternalStockCategoryRole): InternalStockCategoryRole {
  return {
    roleId: Number(row.roleId ?? 0),
    name: String(row.name ?? ''),
    canViewPrices: Boolean(row.canViewPrices),
    missingRoleRecord: Boolean(row.missingRoleRecord),
  };
}

function normalizeCategory(row: InternalStockCategory): InternalStockCategory {
  return {
    categoryId: String(row.categoryId ?? ''),
    description: String(row.description ?? ''),
    stockType: String(row.stockType ?? ''),
    missingCategoryRecord: Boolean(row.missingCategoryRecord),
  };
}

function normalizeAssignment(row: InternalStockCategoryRoleAssignment): InternalStockCategoryRoleAssignment {
  return {
    roleId: Number(row.roleId ?? 0),
    roleName: String(row.roleName ?? ''),
    roleMissingRecord: Boolean(row.roleMissingRecord),
    categoryId: String(row.categoryId ?? ''),
    categoryDescription: String(row.categoryDescription ?? ''),
    stockType: String(row.stockType ?? ''),
    categoryMissingRecord: Boolean(row.categoryMissingRecord),
  };
}

function normalizePayload(payload: InternalStockCategoryRolesPayload): InternalStockCategoryRolesPayload {
  return {
    roles: Array.isArray(payload.roles) ? payload.roles.map(normalizeRole) : [],
    categories: Array.isArray(payload.categories) ? payload.categories.map(normalizeCategory) : [],
    assignments: Array.isArray(payload.assignments) ? payload.assignments.map(normalizeAssignment) : [],
    defaults: {
      roleId: Number(payload.defaults?.roleId ?? 0),
      categoryId: String(payload.defaults?.categoryId ?? ''),
    },
    stats: {
      roles: Number(payload.stats?.roles ?? 0),
      categories: Number(payload.stats?.categories ?? 0),
      assignments: Number(payload.stats?.assignments ?? 0),
      rolesWithCategories: Number(payload.stats?.rolesWithCategories ?? 0),
      categoriesAssigned: Number(payload.stats?.categoriesAssigned ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<InternalStockCategoryRolesResponse> {
  const payload = await parseJson<InternalStockCategoryRolesResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data);
  return payload;
}

function requestPayload(form: InternalStockCategoryRoleForm): InternalStockCategoryRoleForm {
  return {
    roleId: Number(form.roleId),
    categoryId: form.categoryId.trim().toUpperCase(),
  };
}

export async function fetchInternalStockCategoryRoles(): Promise<InternalStockCategoryRolesPayload> {
  const response = await apiFetch(buildApiUrl('/api/inventory/internal-stock-category-roles/workbench'));
  return normalizePayload((await readPayload(response, 'Internal stock category roles could not be loaded.')).data as InternalStockCategoryRolesPayload);
}

export async function addInternalStockCategoryRole(form: InternalStockCategoryRoleForm): Promise<InternalStockCategoryRolesResponse> {
  const response = await apiFetch(buildApiUrl('/api/inventory/internal-stock-category-roles'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestPayload(form)),
  });

  return readPayload(response, 'Internal stock category role could not be added.');
}

export async function deleteInternalStockCategoryRole(roleId: number, categoryId: string): Promise<InternalStockCategoryRolesResponse> {
  const response = await apiFetch(buildApiUrl(`/api/inventory/internal-stock-category-roles/${encodeURIComponent(String(roleId))}/${encodeURIComponent(categoryId)}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  return readPayload(response, 'Internal stock category role could not be removed.');
}
