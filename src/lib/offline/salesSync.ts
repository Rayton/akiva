import PouchDB from 'pouchdb-browser';
import { getSalesDb } from './salesDb';

export interface SalesSyncConfig {
  remoteUrl: string;
  username?: string;
  password?: string;
}

export interface SalesSyncCallbacks {
  onPaused?: () => void;
  onActive?: () => void;
  onChange?: (pending: number) => void;
  onError?: (message: string) => void;
}

export interface SalesSyncController {
  stop: () => void;
}

export function startSalesSync(
  config: SalesSyncConfig,
  callbacks: SalesSyncCallbacks = {}
): SalesSyncController {
  const localDb = getSalesDb();
  const remoteDb = new PouchDB(config.remoteUrl, {
    skip_setup: true,
    auth:
      config.username || config.password
        ? {
            username: config.username ?? '',
            password: config.password ?? '',
          }
        : undefined,
  });

  const sync = localDb
    .sync(remoteDb, {
      live: true,
      retry: true,
    })
    .on('active', () => callbacks.onActive?.())
    .on('paused', () => callbacks.onPaused?.())
    .on('change', (info) => callbacks.onChange?.(info.pending ?? 0))
    .on('error', (error) => callbacks.onError?.(String(error)));

  return {
    stop: () => {
      sync.cancel();
    },
  };
}
