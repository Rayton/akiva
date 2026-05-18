export type EnterpriseEntityKey =
  | 'fiscal-years'
  | 'fiscal-periods'
  | 'financial-dimensions'
  | 'dimension-values'
  | 'donors'
  | 'grants'
  | 'currency-rates'
  | 'tax-rate-versions'
  | 'allocation-keys'
  | 'allocation-key-lines'
  | 'report-templates'
  | 'audit-policies'
  | 'dashboard-templates'
  | 'notification-rules';

export interface EnterpriseFieldDefinition {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[] | null;
}

export interface EnterpriseEntityDefinition {
  label: string;
  singular: string;
  fields: EnterpriseFieldDefinition[];
}

export interface EnterpriseLookupOption {
  value: string | number;
  label: string;
  [key: string]: unknown;
}

export type EnterpriseRowValue = string | number | boolean | null | undefined;

export interface EnterpriseRow {
  id: number;
  [key: string]: EnterpriseRowValue;
}

export type EnterpriseForm = Record<string, string | number | boolean | null>;

export interface EnterpriseConfigurationPayload {
  definitions: Record<EnterpriseEntityKey, EnterpriseEntityDefinition>;
  entities: Record<EnterpriseEntityKey, EnterpriseRow[]>;
  lookups: {
    accounts: EnterpriseLookupOption[];
    currencies: EnterpriseLookupOption[];
    fiscalYears: EnterpriseLookupOption[];
    fiscalPeriods: EnterpriseLookupOption[];
    dimensions: EnterpriseLookupOption[];
    dimensionValues: EnterpriseLookupOption[];
    donors: EnterpriseLookupOption[];
    allocationKeys: EnterpriseLookupOption[];
    taxAuthorities: EnterpriseLookupOption[];
    taxCategories: EnterpriseLookupOption[];
    taxProvinces: EnterpriseLookupOption[];
  };
  stats: Record<EnterpriseEntityKey, number>;
  controls?: {
    fiscalPeriodEnforcement: boolean;
    dimensionCaptureReady: boolean;
    taxRateVersioningReady: boolean;
    fxRateHistoryReady: boolean;
  };
}

export interface EnterpriseConfigurationResponse {
  success: boolean;
  message?: string;
  data?: EnterpriseConfigurationPayload & {
    selectedEntity?: EnterpriseEntityKey;
    selectedId?: number;
  };
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}
