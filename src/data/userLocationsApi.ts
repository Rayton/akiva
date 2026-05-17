import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { UserLocationAssignment, UserLocationForm, UserLocationLocation, UserLocationsPayload, UserLocationUser } from '../types/userLocations';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface UserLocationsResponse extends ApiErrorPayload {
  success: boolean;
  message?: string;
  data?: UserLocationsPayload;
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

function normalizeUser(row: UserLocationUser): UserLocationUser {
  return {
    userId: String(row.userId ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    defaultLocation: String(row.defaultLocation ?? ''),
    blocked: Boolean(row.blocked),
    missingUserRecord: Boolean(row.missingUserRecord),
  };
}

function normalizeLocation(row: UserLocationLocation): UserLocationLocation {
  return {
    code: String(row.code ?? ''),
    name: String(row.name ?? ''),
  };
}

function normalizeAssignment(row: UserLocationAssignment): UserLocationAssignment {
  return {
    userId: String(row.userId ?? ''),
    userName: String(row.userName ?? ''),
    userEmail: String(row.userEmail ?? ''),
    userBlocked: Boolean(row.userBlocked),
    userMissingRecord: Boolean(row.userMissingRecord),
    locationCode: String(row.locationCode ?? ''),
    locationName: String(row.locationName ?? ''),
    canView: Boolean(row.canView),
    canUpdate: Boolean(row.canUpdate),
  };
}

function normalizePayload(payload: UserLocationsPayload): UserLocationsPayload {
  return {
    users: Array.isArray(payload.users) ? payload.users.map(normalizeUser) : [],
    locations: Array.isArray(payload.locations) ? payload.locations.map(normalizeLocation) : [],
    assignments: Array.isArray(payload.assignments) ? payload.assignments.map(normalizeAssignment) : [],
    defaults: {
      userId: String(payload.defaults?.userId ?? ''),
      locationCode: String(payload.defaults?.locationCode ?? ''),
      canView: payload.defaults?.canView === undefined ? true : Boolean(payload.defaults.canView),
      canUpdate: payload.defaults?.canUpdate === undefined ? true : Boolean(payload.defaults.canUpdate),
    },
    stats: {
      users: Number(payload.stats?.users ?? 0),
      locations: Number(payload.stats?.locations ?? 0),
      assignments: Number(payload.stats?.assignments ?? 0),
      usersWithLocations: Number(payload.stats?.usersWithLocations ?? 0),
      locationsWithUsers: Number(payload.stats?.locationsWithUsers ?? 0),
      updateAccess: Number(payload.stats?.updateAccess ?? 0),
      viewOnly: Number(payload.stats?.viewOnly ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<UserLocationsResponse> {
  const payload = await parseJson<UserLocationsResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data);
  return payload;
}

function requestPayload(form: UserLocationForm): UserLocationForm {
  const canUpdate = Boolean(form.canUpdate);
  return {
    userId: form.userId.trim(),
    locationCode: form.locationCode.trim().toUpperCase(),
    canView: Boolean(form.canView) || canUpdate,
    canUpdate,
  };
}

export async function fetchUserLocations(): Promise<UserLocationsPayload> {
  const response = await apiFetch(buildApiUrl('/api/inventory/user-locations/workbench'));
  return normalizePayload((await readPayload(response, 'User location access could not be loaded.')).data as UserLocationsPayload);
}

export async function addUserLocation(form: UserLocationForm): Promise<UserLocationsResponse> {
  const response = await apiFetch(buildApiUrl('/api/inventory/user-locations'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestPayload(form)),
  });

  return readPayload(response, 'User location access could not be added.');
}

export async function updateUserLocation(form: UserLocationForm): Promise<UserLocationsResponse> {
  const payload = requestPayload(form);
  const response = await apiFetch(buildApiUrl(`/api/inventory/user-locations/${encodeURIComponent(payload.userId)}/${encodeURIComponent(payload.locationCode)}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return readPayload(response, 'User location access could not be updated.');
}

export async function deleteUserLocation(userId: string, locationCode: string): Promise<UserLocationsResponse> {
  const response = await apiFetch(buildApiUrl(`/api/inventory/user-locations/${encodeURIComponent(userId)}/${encodeURIComponent(locationCode)}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });

  return readPayload(response, 'User location access could not be removed.');
}
