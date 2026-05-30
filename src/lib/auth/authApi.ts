import { buildApiUrl } from '../network/apiBase';
import { apiFetch } from '../network/apiClient';
import type { AkivaAuthSession } from './session';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface AuthResponse extends ApiErrorPayload {
  success: boolean;
  data?: AkivaAuthSession & {
    url?: string;
    message?: string;
  };
}

export interface SignInPayload {
  identifier: string;
  password: string;
  rememberMe: boolean;
  callbackURL?: string;
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

function normalizeSession(data: AuthResponse['data']): AkivaAuthSession {
  if (!data?.token || !data.expiresAt || !data.user || !data.company) {
    throw new Error('Authentication response was missing session details.');
  }

  return {
    token: String(data.token),
    expiresAt: String(data.expiresAt),
    user: data.user,
    company: data.company,
  };
}

export async function signInWithAkiva(payload: SignInPayload): Promise<{ session: AkivaAuthSession; url: string }> {
  const response = await apiFetch(buildApiUrl('/api/auth/sign-in/email'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email: payload.identifier,
      password: payload.password,
      rememberMe: payload.rememberMe,
      callbackURL: payload.callbackURL ?? '/dashboard',
    }),
  });

  const data = await parseJson<AuthResponse>(response);
  if (!response.ok || !data?.success) {
    throw new Error(errorMessage(data, 'Unable to sign in.'));
  }

  return {
    session: normalizeSession(data.data),
    url: data.data?.url || '/dashboard',
  };
}

export async function fetchCurrentAuthSession(): Promise<AkivaAuthSession> {
  const response = await apiFetch(buildApiUrl('/api/auth/session'), {
    headers: { Accept: 'application/json' },
  });

  const data = await parseJson<AuthResponse>(response);
  if (!response.ok || !data?.success) {
    throw new Error(errorMessage(data, 'No active Akiva session.'));
  }

  return normalizeSession(data.data);
}

export async function signOutFromAkiva(token: string): Promise<void> {
  await apiFetch(buildApiUrl('/api/auth/sign-out'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function requestAkivaPasswordReset(identifier: string): Promise<string> {
  const response = await apiFetch(buildApiUrl('/api/auth/request-password-reset'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email: identifier }),
  });

  const data = await parseJson<AuthResponse>(response);
  if (!response.ok || !data?.success) {
    throw new Error(errorMessage(data, 'Password reset could not be requested.'));
  }

  return data.data?.message || data.message || 'Password reset request received.';
}
