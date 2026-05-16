import { emitOfflineMetaUpdate, writeOfflineMeta } from './offlineMeta';
import { buildApiCandidates } from './apiBase';

function resolveRequestMeta(input: RequestInfo | URL, init?: RequestInit): { method: string; url: string } {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  return { method, url };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim() !== '')));
}

function extractApiPath(url: string): string {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}

function shouldRetryApiResponse(response: Response, method: string): boolean {
  if (response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504) {
    return true;
  }

  if (method !== 'GET') return false;

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (response.status >= 200 && response.status < 300 && contentType.includes('text/html')) {
    return true;
  }

  return false;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { method, url } = resolveRequestMeta(input, init);
  const apiPath = extractApiPath(url);
  const isApiRequest = apiPath.includes('/api/');
  const attempts = isApiRequest ? unique([url, ...buildApiCandidates(apiPath)]) : [url];
  let lastError: unknown = null;
  let lastUrl = url;

  for (let index = 0; index < attempts.length; index += 1) {
    const candidate = attempts[index];
    lastUrl = candidate;

    try {
      const response = await fetch(candidate, init);
      const shouldRetry = isApiRequest && index < attempts.length - 1 && shouldRetryApiResponse(response, method);
      if (shouldRetry) {
        continue;
      }

      if (response.ok) {
        const now = new Date().toISOString();
        writeOfflineMeta({
          lastApiReadAt: now,
          lastApiUrl: candidate,
          lastApiMethod: method,
          lastNetworkSyncAt: navigator.onLine ? now : undefined,
          lastErrorAt: '',
          lastErrorMessage: '',
        });
        emitOfflineMetaUpdate();
      }

      return response;
    } catch (error) {
      lastError = error;
    }
  }

  writeOfflineMeta({
    lastErrorAt: new Date().toISOString(),
    lastErrorMessage:
      lastError instanceof Error
        ? lastError.message
        : `API request failed after trying ${attempts.length} base URL(s).`,
    lastApiUrl: lastUrl,
    lastApiMethod: method,
  });
  emitOfflineMetaUpdate();
  if (lastError instanceof Error) {
    throw new Error(`${lastError.message} (tried: ${attempts.join(', ')})`);
  }
  throw new Error(`API request failed (${method} ${apiPath}) after trying: ${attempts.join(', ')}`);
}
