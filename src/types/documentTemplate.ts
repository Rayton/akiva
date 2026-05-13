export type TemplateSection = 'header' | 'body' | 'footer';

export type TemplateStatus = 'active' | 'draft' | 'archived';

export type TemplateOrientation = 'portrait' | 'landscape';

export interface TemplateOption {
  value: string;
  label: string;
}

export interface DocumentTemplateBlock {
  id: string;
  type: string;
  label: string;
  content: string;
  token: string;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  width: 'full' | 'half' | 'third';
  emphasis: boolean;
  visible: boolean;
  columns?: TemplateTableColumn[];
  height?: number;
}

export interface TemplateTableColumn {
  label: string;
  token: string;
}

export interface DocumentTemplateLayout {
  schemaVersion: number;
  sections: Record<TemplateSection, DocumentTemplateBlock[]>;
}

export interface DocumentTemplate {
  id?: number;
  code: string;
  name: string;
  documentType: string;
  description: string;
  paperSize: string;
  orientation: TemplateOrientation;
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  layoutJson: DocumentTemplateLayout;
  status: TemplateStatus;
  version: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DocumentTemplateLookups {
  paperSizes: string[];
  orientations: TemplateOrientation[];
  statuses: TemplateStatus[];
  documentTypes: TemplateOption[];
  blockTypes: TemplateOption[];
  tokens: string[];
}

export interface DocumentTemplatePayload {
  templates: DocumentTemplate[];
  lookups: DocumentTemplateLookups;
}
