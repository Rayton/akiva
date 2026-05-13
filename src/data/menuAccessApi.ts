import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { MenuAccessPayload, MenuAccessSaveForm } from '../types/menuAccess';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface MenuAccessResponse extends ApiErrorPayload {
  success: boolean;
  data?: MenuAccessPayload & { selectedUserId?: string };
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

function normalizePayload(payload: MenuAccessPayload): MenuAccessPayload {
  const users = Array.isArray(payload.users)
    ? payload.users.map((user) => {
        const allowedMenuIds = Array.isArray(user.allowedMenuIds) ? user.allowedMenuIds.map(Number) : [];
        return {
          ...user,
          allowedMenuIds,
          allowedCount: allowedMenuIds.length,
          blocked: Boolean(user.blocked),
        };
      })
    : [];

  return {
    users,
    menu: Array.isArray(payload.menu) ? payload.menu : [],
    stats: {
      totalUsers: Number(payload.stats?.totalUsers ?? users.length),
      usersWithAccess: Number(payload.stats?.usersWithAccess ?? 0),
      usersWithoutAccess: Number(payload.stats?.usersWithoutAccess ?? 0),
      blockedUsers: Number(payload.stats?.blockedUsers ?? 0),
      menuItems: Number(payload.stats?.menuItems ?? 0),
      assignedLinks: Number(payload.stats?.assignedLinks ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<MenuAccessResponse> {
  const payload = await parseJson<MenuAccessResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as MenuAccessPayload);
  return payload;
}

export async function fetchMenuAccess(): Promise<MenuAccessPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/users/menu-access'));
  return normalizePayload((await readPayload(response, 'Menu access could not be loaded.')).data as MenuAccessPayload);
}

export async function saveMenuAccess(userId: string, form: MenuAccessSaveForm): Promise<MenuAccessResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/users/menu-access/${encodeURIComponent(userId)}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(form),
  });

  return readPayload(response, 'Menu access could not be saved.');
}
