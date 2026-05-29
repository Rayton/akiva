import { createAuthClient } from 'better-auth/react';
import { buildApiUrl } from '../network/apiBase';

const configuredAuthUrl = (import.meta.env.VITE_BETTER_AUTH_URL ?? '').trim();

export const authClient = createAuthClient({
  baseURL: configuredAuthUrl || buildApiUrl('/api/auth'),
});
