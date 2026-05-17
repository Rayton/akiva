import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { DepartmentAuthorization, DepartmentAuthorizationForm, DepartmentLocation, DepartmentsPayload, DepartmentUser } from '../types/departments';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface DepartmentsResponse extends ApiErrorPayload {
  success: boolean;
  message?: string;
  data?: DepartmentsPayload;
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

function normalizeUser(row: DepartmentUser): DepartmentUser {
  return {
    userId: String(row.userId ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    defaultLocation: String(row.defaultLocation ?? ''),
    blocked: Boolean(row.blocked),
    missingUserRecord: Boolean(row.missingUserRecord),
  };
}

function normalizeLocation(row: DepartmentLocation): DepartmentLocation {
  return {
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
  };
}

function normalizeAuthorization(row: DepartmentAuthorization): DepartmentAuthorization {
  return {
    userId: String(row.userId ?? ''),
    userName: String(row.userName ?? ''),
    userEmail: String(row.userEmail ?? ''),
    userBlocked: Boolean(row.userBlocked),
    userMissingRecord: Boolean(row.userMissingRecord),
    locationCode: String(row.locationCode ?? ''),
    locationName: String(row.locationName ?? ''),
    canCreate: Boolean(row.canCreate),
    canAuthorise: Boolean(row.canAuthorise),
    canFulfill: Boolean(row.canFulfill),
  };
}

function normalizePayload(payload: DepartmentsPayload): DepartmentsPayload {
  return {
    users: Array.isArray(payload.users) ? payload.users.map(normalizeUser) : [],
    locations: Array.isArray(payload.locations) ? payload.locations.map(normalizeLocation) : [],
    authorizations: Array.isArray(payload.authorizations) ? payload.authorizations.map(normalizeAuthorization) : [],
    defaults: {
      userId: String(payload.defaults?.userId ?? ''),
      locationCode: String(payload.defaults?.locationCode ?? ''),
      canCreate: payload.defaults?.canCreate === undefined ? true : Boolean(payload.defaults.canCreate),
      canAuthorise: payload.defaults?.canAuthorise === undefined ? true : Boolean(payload.defaults.canAuthorise),
      canFulfill: payload.defaults?.canFulfill === undefined ? true : Boolean(payload.defaults.canFulfill),
    },
    stats: {
      users: Number(payload.stats?.users ?? 0),
      locations: Number(payload.stats?.locations ?? 0),
      authorizations: Number(payload.stats?.authorizations ?? 0),
      locationsWithUsers: Number(payload.stats?.locationsWithUsers ?? 0),
      createAccess: Number(payload.stats?.createAccess ?? 0),
      authoriseAccess: Number(payload.stats?.authoriseAccess ?? 0),
      fulfillAccess: Number(payload.stats?.fulfillAccess ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<DepartmentsResponse> {
  const payload = await parseJson<DepartmentsResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data);
  return payload;
}

function requestPayload(form: DepartmentAuthorizationForm): DepartmentAuthorizationForm {
  return {
    userId: form.userId.trim(),
    locationCode: form.locationCode.trim().toUpperCase(),
    canCreate: Boolean(form.canCreate),
    canAuthorise: Boolean(form.canAuthorise),
    canFulfill: Boolean(form.canFulfill),
  };
}

export async function fetchDepartments(): Promise<DepartmentsPayload> {
  const response = await apiFetch(buildApiUrl('/api/inventory/departments/workbench'));
  return normalizePayload((await readPayload(response, 'Departments could not be loaded.')).data as DepartmentsPayload);
}

export async function addDepartmentAuthorization(form: DepartmentAuthorizationForm): Promise<DepartmentsResponse> {
  const response = await apiFetch(buildApiUrl('/api/inventory/departments/authorizations'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestPayload(form)),
  });

  return readPayload(response, 'Department authorisation could not be added.');
}

export async function updateDepartmentAuthorization(form: DepartmentAuthorizationForm): Promise<DepartmentsResponse> {
  const payload = requestPayload(form);
  const response = await apiFetch(buildApiUrl(`/api/inventory/departments/authorizations/${encodeURIComponent(payload.locationCode)}/${encodeURIComponent(payload.userId)}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return readPayload(response, 'Department authorisation could not be updated.');
}

export async function deleteDepartmentAuthorization(locationCode: string, userId: string): Promise<DepartmentsResponse> {
  const response = await apiFetch(buildApiUrl(`/api/inventory/departments/authorizations/${encodeURIComponent(locationCode)}/${encodeURIComponent(userId)}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  return readPayload(response, 'Department authorisation could not be removed.');
}
