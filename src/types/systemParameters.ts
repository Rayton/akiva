export type SystemParameterValues = Record<string, string>;

export interface SystemParameterLookupOption {
  value: string;
  label: string;
}

export interface SystemParameterLookups {
  priceLists: SystemParameterLookupOption[];
  shippers: SystemParameterLookupOption[];
  taxCategories: SystemParameterLookupOption[];
  locations: SystemParameterLookupOption[];
  periodLocks: SystemParameterLookupOption[];
}

export interface SystemParametersPayload {
  parameters: SystemParameterValues;
  lookups: SystemParameterLookups;
}

export type SystemParameterInputType = 'text' | 'number' | 'email' | 'textarea' | 'select';

export interface SystemParameterDefinition {
  name: string;
  label: string;
  category: string;
  type: SystemParameterInputType;
  note: string;
  options?: SystemParameterLookupOption[];
  lookup?: keyof SystemParameterLookups;
  min?: number;
  max?: number;
}
