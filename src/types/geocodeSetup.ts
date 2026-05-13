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
  links: {
    runProcess: string;
    customerMap: string;
    supplierMap: string;
  };
}

export type GeocodeForm = Omit<GeocodeRecord, 'id'>;
