import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { LabelPayload, LabelTemplate } from '../types/labelTemplate';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface LabelResponse extends ApiErrorPayload {
  success: boolean;
  data?: LabelPayload & { selectedId?: number };
  message?: string;
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

async function readPayload(response: Response, fallback: string): Promise<LabelResponse> {
  const payload = await parseJson<LabelResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  return payload;
}

export async function fetchLabels(): Promise<LabelPayload> {
  const response = await apiFetch(buildApiUrl('/api/labels'));
  return (await readPayload(response, 'Label templates could not be loaded.')).data as LabelPayload;
}

export async function saveLabel(template: LabelTemplate): Promise<LabelResponse> {
  const response = await apiFetch(buildApiUrl(template.id ? `/api/labels/${template.id}` : '/api/labels'), {
    method: template.id ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(template),
  });
  return readPayload(response, 'Label template could not be saved.');
}

export async function archiveLabel(id: number): Promise<LabelResponse> {
  const response = await apiFetch(buildApiUrl(`/api/labels/${id}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Label template could not be archived.');
}
