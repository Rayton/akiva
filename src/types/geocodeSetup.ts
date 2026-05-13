export interface GeocodeRecord {
  id: number;
  geocodeKey: string;
  centerLong: string;
  centerLat: string;
  mapHeight: string;
  mapWidth: string;
  mapHost: string;
}

export interface GeocodeStatsItem {
  total: number;
  geocoded: number;
  missing: number;
}

export interface GeocodeSetupPayload {
  enabled: boolean;
  records: GeocodeRecord[];
  stats: {
    customerBranches: GeocodeStatsItem;
    suppliers: GeocodeStatsItem;
  };
  defaults: Omit<GeocodeRecord, 'id'>;
}

export type GeocodeForm = Omit<GeocodeRecord, 'id'>;

export type GeocodeRunTarget = 'all' | 'customers' | 'suppliers';

export interface GeocodeRunResult {
  type: 'customer' | 'supplier';
  id: string;
  name: string;
  address: string;
  status: 'updated' | 'failed' | 'skipped';
  message: string;
  lat: number | null;
  lng: number | null;
}

export interface GeocodeRunSummary {
  updated: number;
  failed: number;
  skipped: number;
  processed: number;
  results: GeocodeRunResult[];
}

export interface GeocodeRunPayload extends GeocodeSetupPayload {
  run: GeocodeRunSummary;
}

export interface GeocodeLocation {
  type: 'customer' | 'supplier';
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  mapUrl: string;
  embedUrl: string;
}
