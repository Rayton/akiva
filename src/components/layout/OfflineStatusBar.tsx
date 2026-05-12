import { useEffect, useMemo, useState } from 'react';
import { Database, Wifi, WifiOff } from 'lucide-react';
import { AKIVA_OFFLINE_META_EVENT, readOfflineMeta, type OfflineMeta } from '../../lib/network/offlineMeta';

interface OfflineStatusBarProps {
  compact?: boolean;
}

interface StorageState {
  usageBytes: number;
  quotaBytes: number;
  persisted: boolean | null;
}

function formatWhen(value: string | null): string {
  if (!value) return 'Not yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not yet';
  return date.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function OfflineStatusBar({ compact = false }: OfflineStatusBarProps) {
  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  const [meta, setMeta] = useState<OfflineMeta>(() => readOfflineMeta());
  const [serviceWorkerActive, setServiceWorkerActive] = useState<boolean>(() =>
    Boolean(navigator.serviceWorker?.controller)
  );
  const [storage, setStorage] = useState<StorageState>({
    usageBytes: 0,
    quotaBytes: 0,
    persisted: null,
  });

  const storageRatio = useMemo(() => {
    if (!storage.quotaBytes) return 0;
    return Math.min(100, Math.round((storage.usageBytes / storage.quotaBytes) * 100));
  }, [storage.quotaBytes, storage.usageBytes]);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    const updateMeta = () => setMeta(readOfflineMeta());
    const updateServiceWorkerStatus = () => {
      setServiceWorkerActive(Boolean(navigator.serviceWorker?.controller));
    };

    const refreshStorage = async () => {
      if (!('storage' in navigator) || !navigator.storage?.estimate) return;
      try {
        const [estimate, persisted] = await Promise.all([
          navigator.storage.estimate(),
          navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null),
        ]);
        setStorage({
          usageBytes: estimate.usage ?? 0,
          quotaBytes: estimate.quota ?? 0,
          persisted,
        });
      } catch {
        // Ignore storage estimate failures.
      }
    };

    updateConnection();
    updateMeta();
    updateServiceWorkerStatus();
    refreshStorage().catch(() => undefined);

    const storageTimer = window.setInterval(() => {
      refreshStorage().catch(() => undefined);
    }, 30000);

    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener(AKIVA_OFFLINE_META_EVENT, updateMeta as EventListener);
    window.addEventListener('storage', updateMeta);
    document.addEventListener('visibilitychange', refreshStorage);
    navigator.serviceWorker?.addEventListener('controllerchange', updateServiceWorkerStatus);

    return () => {
      window.clearInterval(storageTimer);
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener(AKIVA_OFFLINE_META_EVENT, updateMeta as EventListener);
      window.removeEventListener('storage', updateMeta);
      document.removeEventListener('visibilitychange', refreshStorage);
      navigator.serviceWorker?.removeEventListener('controllerchange', updateServiceWorkerStatus);
    };
  }, []);

  return (
    <div className="border-b border-akiva-border bg-akiva-accent-soft text-akiva-text">
      <div className={`${compact ? 'px-4 py-1.5' : 'px-6 py-1.5'} flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs`}>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
            isOnline
              ? 'bg-akiva-surface-raised text-akiva-accent-text'
              : 'bg-akiva-surface-muted text-akiva-text-muted'
          }`}
        >
          {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isOnline ? 'Online' : 'Offline'}
        </span>

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
            serviceWorkerActive
              ? 'bg-akiva-surface-raised text-akiva-accent-text'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          }`}
        >
          <Database className="h-3 w-3" />
          SW: {serviceWorkerActive ? 'Active' : 'Not Active'}
        </span>

        <span className="text-akiva-text-muted">Last sync: {formatWhen(meta.lastNetworkSyncAt)}</span>
        <span className="text-akiva-text-muted">Last cached read: {formatWhen(meta.lastApiReadAt)}</span>
        <span className="text-akiva-text-muted">
          Cache: {formatBytes(storage.usageBytes)}
          {storage.quotaBytes ? ` / ${formatBytes(storage.quotaBytes)} (${storageRatio}%)` : ''}
          {storage.persisted === true ? ' persisted' : ''}
        </span>
      </div>
    </div>
  );
}
