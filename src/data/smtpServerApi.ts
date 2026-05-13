import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { SmtpPayload, SmtpSettings, SmtpTestResult } from '../types/smtpServer';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface SmtpResponse extends ApiErrorPayload {
  success: boolean;
  data?: SmtpPayload & { test?: SmtpTestResult };
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

async function readPayload(response: Response, fallback: string): Promise<SmtpResponse> {
  const payload = await parseJson<SmtpResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  return payload;
}

export async function fetchSmtpServer(): Promise<SmtpPayload> {
  const response = await apiFetch(buildApiUrl('/api/smtp/server'));
  return (await readPayload(response, 'SMTP server settings could not be loaded.')).data as SmtpPayload;
}

export async function saveSmtpServer(settings: SmtpSettings): Promise<SmtpResponse> {
  const response = await apiFetch(buildApiUrl('/api/smtp/server'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(settings),
  });
  return readPayload(response, 'SMTP server settings could not be saved.');
}

export async function testSmtpServer(settings: SmtpSettings): Promise<SmtpResponse> {
  const response = await apiFetch(buildApiUrl('/api/smtp/server/test'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(settings),
  });
  return readPayload(response, 'SMTP server could not be reached.');
}
