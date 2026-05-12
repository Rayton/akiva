function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== '')));
}

function defaultCandidateBases(): string[] {
  if (typeof window === 'undefined') {
    return ['http://localhost:8877', 'http://localhost:8000'];
  }

  const origin = trimTrailingSlash(window.location.origin);
  const host = window.location.hostname;
  const protocol = window.location.protocol;

  return unique([
    trimTrailingSlash(`${protocol}//${host}:8877`),
    trimTrailingSlash(`${protocol}//${host}:8000`),
    origin,
    trimTrailingSlash(`${origin}/api/public`),
    trimTrailingSlash(`${origin}/akiva/api/public`),
    trimTrailingSlash(`${origin}/akiva/api`),
  ]);
}

export function resolveApiBaseCandidates(): string[] {
  const configuredPrimary = trimTrailingSlash((import.meta.env.VITE_API_URL ?? '').trim());
  const configuredFallbacks = (import.meta.env.VITE_API_FALLBACK_URLS ?? '')
    .split(',')
    .map((value) => trimTrailingSlash(value.trim()))
    .filter((value) => value !== '');

  if (configuredPrimary !== '') {
    return unique([configuredPrimary, ...configuredFallbacks]);
  }

  return defaultCandidateBases();
}

export function resolveApiBaseUrl(): string {
  const [first] = resolveApiBaseCandidates();
  return first || 'http://localhost:8877';
}

export function buildApiCandidates(path: string): string[] {
  if (/^https?:\/\//i.test(path)) {
    return unique([path]);
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return unique(resolveApiBaseCandidates().map((base) => `${base}${normalizedPath}`));
}

export function buildApiUrl(path: string): string {
  const [first] = buildApiCandidates(path);
  return first || path;
}