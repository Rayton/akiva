export const AKIVA_OFFLINE_META_EVENT = 'akiva:offline-meta-update';

const META_PREFIX = 'akiva.offline.';

export const OFFLINE_META_KEYS = {
  lastApiReadAt: `${META_PREFIX}lastApiReadAt`,
  lastNetworkSyncAt: `${META_PREFIX}lastNetworkSyncAt`,
  lastApiUrl: `${META_PREFIX}lastApiUrl`,
  lastApiMethod: `${META_PREFIX}lastApiMethod`,
  lastErrorAt: `${META_PREFIX}lastErrorAt`,
  lastErrorMessage: `${META_PREFIX}lastErrorMessage`,
} as const;

export interface OfflineMeta {
  lastApiReadAt: string | null;
  lastNetworkSyncAt: string | null;
  lastApiUrl: string | null;
  lastApiMethod: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
}

function safeRead(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (e.g. strict privacy mode).
  }
}

export function readOfflineMeta(): OfflineMeta {
  return {
    lastApiReadAt: safeRead(OFFLINE_META_KEYS.lastApiReadAt),
    lastNetworkSyncAt: safeRead(OFFLINE_META_KEYS.lastNetworkSyncAt),
    lastApiUrl: safeRead(OFFLINE_META_KEYS.lastApiUrl),
    lastApiMethod: safeRead(OFFLINE_META_KEYS.lastApiMethod),
    lastErrorAt: safeRead(OFFLINE_META_KEYS.lastErrorAt),
    lastErrorMessage: safeRead(OFFLINE_META_KEYS.lastErrorMessage),
  };
}

export function writeOfflineMeta(partial: Partial<OfflineMeta>) {
  if (partial.lastApiReadAt !== undefined && partial.lastApiReadAt !== null) {
    safeWrite(OFFLINE_META_KEYS.lastApiReadAt, partial.lastApiReadAt);
  }
  if (partial.lastNetworkSyncAt !== undefined && partial.lastNetworkSyncAt !== null) {
    safeWrite(OFFLINE_META_KEYS.lastNetworkSyncAt, partial.lastNetworkSyncAt);
  }
  if (partial.lastApiUrl !== undefined && partial.lastApiUrl !== null) {
    safeWrite(OFFLINE_META_KEYS.lastApiUrl, partial.lastApiUrl);
  }
  if (partial.lastApiMethod !== undefined && partial.lastApiMethod !== null) {
    safeWrite(OFFLINE_META_KEYS.lastApiMethod, partial.lastApiMethod);
  }
  if (partial.lastErrorAt !== undefined && partial.lastErrorAt !== null) {
    safeWrite(OFFLINE_META_KEYS.lastErrorAt, partial.lastErrorAt);
  }
  if (partial.lastErrorMessage !== undefined && partial.lastErrorMessage !== null) {
    safeWrite(OFFLINE_META_KEYS.lastErrorMessage, partial.lastErrorMessage);
  }
}

export function emitOfflineMetaUpdate() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AKIVA_OFFLINE_META_EVENT));
}
