import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { AccessPermissionsPayload, AccessRoleForm } from '../types/accessPermissions';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface AccessPermissionsResponse extends ApiErrorPayload {
  success: boolean;
  data?: AccessPermissionsPayload & { selectedRoleId?: number };
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

async function readPayload(response: Response, fallback: string): Promise<AccessPermissionsResponse> {
  const payload = await parseJson<AccessPermissionsResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  return payload;
}

function normalizePayload(payload: AccessPermissionsPayload): AccessPermissionsPayload {
  return {
    roles: Array.isArray(payload.roles)
      ? payload.roles.map((role) => {
          const assignedUsers = Array.isArray(role.assignedUsers) ? role.assignedUsers : [];
          const tokenIds = Array.isArray(role.tokenIds) ? role.tokenIds : [];
          return {
            ...role,
            tokenIds,
            tokenNames: Array.isArray(role.tokenNames) ? role.tokenNames : [],
            assignedUsers,
            userCount: assignedUsers.length,
            tokenCount: tokenIds.length,
          };
        })
      : [],
    tokens: Array.isArray(payload.tokens) ? payload.tokens : [],
    stats: {
      totalRoles: Number(payload.stats?.totalRoles ?? 0),
      rolesInUse: Number(payload.stats?.rolesInUse ?? 0),
      rolesWithTokens: Number(payload.stats?.rolesWithTokens ?? 0),
      rolesWithoutTokens: Number(payload.stats?.rolesWithoutTokens ?? 0),
      totalTokens: Number(payload.stats?.totalTokens ?? 0),
      assignedLinks: Number(payload.stats?.assignedLinks ?? 0),
    },
  };
}

export async function fetchAccessPermissions(): Promise<AccessPermissionsPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/users/www-access'));
  return normalizePayload((await readPayload(response, 'Access permissions could not be loaded.')).data as AccessPermissionsPayload);
}

export async function saveAccessRole(form: AccessRoleForm, roleId?: number): Promise<AccessPermissionsResponse> {
  const path = roleId
    ? `/api/configuration/users/www-access/${encodeURIComponent(String(roleId))}`
    : '/api/configuration/users/www-access';

  const response = await apiFetch(buildApiUrl(path), {
    method: roleId ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(form),
  });

  const payload = await readPayload(response, 'Access role could not be saved.');
  payload.data = normalizePayload(payload.data as AccessPermissionsPayload);
  return payload;
}

export async function deleteAccessRole(roleId: number): Promise<AccessPermissionsResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/users/www-access/${encodeURIComponent(String(roleId))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  const payload = await readPayload(response, 'Access role could not be deleted.');
  payload.data = normalizePayload(payload.data as AccessPermissionsPayload);
  return payload;
}
