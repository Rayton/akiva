import { emitOfflineMetaUpdate, writeOfflineMeta } from './offlineMeta';

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

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { method, url } = resolveRequestMeta(input, init);

  try {
    const response = await fetch(input, init);

    if (response.ok) {
      const now = new Date().toISOString();
      writeOfflineMeta({
        lastApiReadAt: now,
        lastApiUrl: url,
        lastApiMethod: method,
        lastNetworkSyncAt: navigator.onLine ? now : undefined,
        lastErrorAt: '',
        lastErrorMessage: '',
      });
      emitOfflineMetaUpdate();
    }

    return response;
  } catch (error) {
    writeOfflineMeta({
      lastErrorAt: new Date().toISOString(),
      lastErrorMessage: String(error),
      lastApiUrl: url,
      lastApiMethod: method,
    });
    emitOfflineMetaUpdate();
    throw error;
  }
}
