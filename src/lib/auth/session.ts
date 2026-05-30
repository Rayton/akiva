import type { User } from '../../types';

export interface AkivaAuthSession {
  token: string;
  expiresAt: string;
  user: User;
  company: AkivaCompany;
}

export interface AkivaCompany {
  database: string;
  name: string;
  isDefault?: boolean;
}

const AUTH_SESSION_KEY = 'akiva.auth.session.v1';

function isSessionShape(value: unknown): value is AkivaAuthSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<AkivaAuthSession>;
  return (
    typeof session.token === 'string' &&
    typeof session.expiresAt === 'string' &&
    !!session.user &&
    typeof session.user.id === 'string' &&
    typeof session.user.name === 'string' &&
    !!session.company &&
    typeof session.company.database === 'string' &&
    typeof session.company.name === 'string'
  );
}

export function isAuthSessionValid(session: AkivaAuthSession | null): session is AkivaAuthSession {
  if (!session) return false;
  const expiry = Date.parse(session.expiresAt);
  return Number.isFinite(expiry) && expiry > Date.now();
}

export function getStoredAuthSession(): AkivaAuthSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isSessionShape(parsed) || !isAuthSessionValid(parsed)) {
      clearStoredAuthSession();
      return null;
    }
    return parsed;
  } catch {
    clearStoredAuthSession();
    return null;
  }
}

export function storeAuthSession(session: AkivaAuthSession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredAuthSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_SESSION_KEY);
}

export function getAuthToken(): string {
  return getStoredAuthSession()?.token ?? '';
}

export function getAuthUserId(): string {
  return getStoredAuthSession()?.user.id ?? '';
}
