import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { WwwUserForm, WwwUsersPayload } from '../types/wwwUsers';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface WwwUsersResponse extends ApiErrorPayload {
  success: boolean;
  data?: WwwUsersPayload & { selectedUserId?: string };
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

async function readPayload(response: Response, fallback: string): Promise<WwwUsersResponse> {
  const payload = await parseJson<WwwUsersResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  return payload;
}

function normalizePayload(payload: WwwUsersPayload): WwwUsersPayload {
  const moduleCount = payload.lookups?.modules?.length ?? 12;

  return {
    users: Array.isArray(payload.users) ? payload.users : [],
    defaults: {
      ...payload.defaults,
      password: '',
      modulesAllowed: Array.isArray(payload.defaults?.modulesAllowed)
        ? payload.defaults.modulesAllowed
        : Array.from({ length: moduleCount }, () => true),
    },
    lookups: {
      securityRoles: Array.isArray(payload.lookups?.securityRoles) ? payload.lookups.securityRoles : [],
      locations: Array.isArray(payload.lookups?.locations) ? payload.lookups.locations : [],
      salespeople: Array.isArray(payload.lookups?.salespeople) ? payload.lookups.salespeople : [],
      departments: Array.isArray(payload.lookups?.departments) ? payload.lookups.departments : [],
      pageSizes: Array.isArray(payload.lookups?.pageSizes) ? payload.lookups.pageSizes : [],
      themes: Array.isArray(payload.lookups?.themes) ? payload.lookups.themes : [],
      languages: Array.isArray(payload.lookups?.languages) ? payload.lookups.languages : [],
      pdfLanguages: Array.isArray(payload.lookups?.pdfLanguages) ? payload.lookups.pdfLanguages : [],
      modules: Array.isArray(payload.lookups?.modules) ? payload.lookups.modules : [],
    },
    stats: {
      total: Number(payload.stats?.total ?? 0),
      open: Number(payload.stats?.open ?? 0),
      blocked: Number(payload.stats?.blocked ?? 0),
      withRecentLogin: Number(payload.stats?.withRecentLogin ?? 0),
    },
  };
}

export async function fetchWwwUsers(): Promise<WwwUsersPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/users/www-users'));
  return normalizePayload((await readPayload(response, 'Users could not be loaded.')).data as WwwUsersPayload);
}

export async function saveWwwUser(form: WwwUserForm, existingUserId?: string): Promise<WwwUsersResponse> {
  const path = existingUserId
    ? `/api/configuration/users/www-users/${encodeURIComponent(existingUserId)}`
    : '/api/configuration/users/www-users';

  const response = await apiFetch(buildApiUrl(path), {
    method: existingUserId ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(form),
  });

  const payload = await readPayload(response, 'User could not be saved.');
  payload.data = normalizePayload(payload.data as WwwUsersPayload);
  return payload;
}

export async function deleteWwwUser(userId: string): Promise<WwwUsersResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/users/www-users/${encodeURIComponent(userId)}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  const payload = await readPayload(response, 'User could not be deleted.');
  payload.data = normalizePayload(payload.data as WwwUsersPayload);
  return payload;
}
