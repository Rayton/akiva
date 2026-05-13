export interface AuditTrailLookupOption {
  value: string;
  label: string;
}

export interface AuditTrailRecord {
  transactionDate: string;
  userId: string;
  event: string;
  source: string;
  tableName: string;
  auditableType: string;
  auditableId: string;
  queryString: string;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  url: string;
  requestMethod: string;
  ipAddress: string;
  executionMs: number | null;
}

export interface AuditTrailSummary {
  from: string;
  to: string;
  total: number;
  latest: string;
}

export interface AuditTrailPagination {
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
}

export interface AuditTrailFilters {
  from: string;
  to: string;
  user: string;
  table: string;
  event: string;
  text: string;
  page: number;
  perPage: number;
}

export interface AuditTrailPayload {
  records: AuditTrailRecord[];
  summary: AuditTrailSummary;
  lookups: {
    users: AuditTrailLookupOption[];
    tables: AuditTrailLookupOption[];
  };
  pagination: AuditTrailPagination;
}
