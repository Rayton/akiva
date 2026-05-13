import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type {
  GeocodeForm,
  GeocodeLocation,
  GeocodeRunPayload,
  GeocodeRunTarget,
  GeocodeSetupPayload,
} from '../types/geocodeSetup';

interface ApiResponse {
  success: boolean;
  data: GeocodeSetupPayload & { selectedId?: number };
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
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

async function readPayload(response: Response, fallback: string): Promise<ApiResponse> {
  const payload = await parseJson<ApiResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  return payload;
}

export async function fetchGeocodeSetup(): Promise<GeocodeSetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/geocode/setup'));
  return (await readPayload(response, 'Geocode setup could not be loaded.')).data;
}

export async function saveGeocodeRecord(form: GeocodeForm, id?: number): Promise<ApiResponse> {
  const response = await apiFetch(buildApiUrl(id ? `/api/geocode/setup/${id}` : '/api/geocode/setup'), {
    method: id ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(form),
  });
  return readPayload(response, 'Geocode setup could not be saved.');
}

export async function deleteGeocodeRecord(id: number): Promise<ApiResponse> {
  const response = await apiFetch(buildApiUrl(`/api/geocode/setup/${id}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Geocode setup could not be deleted.');
}

export async function updateGeocodeEnabled(enabled: boolean): Promise<GeocodeSetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/geocode/setup/settings'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  return (await readPayload(response, 'Geocode integration setting could not be saved.')).data;
}

export async function runGeocodeProcess(options: {
  target: GeocodeRunTarget;
  limit: number;
  missingOnly: boolean;
}): Promise<ApiResponse & { data: GeocodeRunPayload }> {
  const response = await apiFetch(buildApiUrl('/api/geocode/setup/run'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(options),
  });
  return readPayload(response, 'Geocode process could not be completed.') as Promise<ApiResponse & { data: GeocodeRunPayload }>;
}

export async function fetchGeocodeLocations(options: {
  target: GeocodeRunTarget;
  limit: number;
}): Promise<GeocodeLocation[]> {
  const params = new URLSearchParams({
    target: options.target,
    limit: String(options.limit),
  });
  const response = await apiFetch(buildApiUrl(`/api/geocode/setup/locations?${params.toString()}`));
  const payload = await parseJson<{ success: boolean; data: { locations: GeocodeLocation[] }; message?: string }>(response);

  if (!response.ok || !payload?.success) {
    throw new Error(errorMessage(payload, 'Geocode locations could not be loaded.'));
  }

  return Array.isArray(payload.data?.locations) ? payload.data.locations : [];
}
