export interface LabelField {
  id?: number;
  fieldValue: string;
  vPos: number;
  hPos: number;
  fontSize: number;
  barcode: boolean;
}

export interface LabelTemplate {
  id?: number;
  description: string;
  pageWidth: number;
  pageHeight: number;
  height: number;
  width: number;
  topMargin: number;
  leftMargin: number;
  rowHeight: number;
  columnWidth: number;
  rows?: number;
  columns?: number;
  fields: LabelField[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabelPaperSize {
  name: string;
  pageWidth: number;
  pageHeight: number;
}

export interface LabelFieldType {
  value: string;
  label: string;
}

export interface LabelPreset {
  key: string;
  description: string;
  pageWidth: number;
  pageHeight: number;
  height: number;
  width: number;
  topMargin: number;
  leftMargin: number;
  rowHeight: number;
  columnWidth: number;
}

export interface LabelLookups {
  paperSizes: LabelPaperSize[];
  fieldTypes: LabelFieldType[];
  presets: LabelPreset[];
}

export interface LabelPayload {
  labels: LabelTemplate[];
  lookups: LabelLookups;
  stats: {
    templates: number;
    fields: number;
  };
}
