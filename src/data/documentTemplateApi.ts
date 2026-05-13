import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { DocumentTemplate, DocumentTemplateLookups, DocumentTemplatePayload } from '../types/documentTemplate';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface ListResponse extends ApiErrorPayload {
  success: boolean;
  data?: DocumentTemplatePayload;
}

interface TemplateResponse extends ApiErrorPayload {
  success: boolean;
  data?: {
    template?: DocumentTemplate;
    templates?: DocumentTemplate[];
    lookups: DocumentTemplateLookups;
  };
  message?: string;
}

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function errorMessage(payload: ApiErrorPayload | null, fallback: string): string {
  const messages: string[] = [];
  if (payload?.message) messages.push(payload.message);
  if (payload?.errors) {
    Object.values(payload.errors).forEach((value) => {
      if (Array.isArray(value)) messages.push(...value);
      else if (typeof value === 'string') messages.push(value);
    });
  }
  return messages.length > 0 ? messages.join(' | ') : fallback;
}

export async function fetchDocumentTemplates(): Promise<DocumentTemplatePayload> {
  const response = await apiFetch(buildApiUrl('/api/document-templates'));
  const payload = await parseJson<ListResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, 'Document templates could not be loaded.'));
  }
  return payload.data;
}

export async function saveDocumentTemplate(template: DocumentTemplate): Promise<TemplateResponse> {
  const path = template.id ? `/api/document-templates/${template.id}` : '/api/document-templates';
  const response = await apiFetch(buildApiUrl(path), {
    method: template.id ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(template),
  });
  const payload = await parseJson<TemplateResponse>(response);
  if (!response.ok || !payload?.success || !payload.data?.template) {
    throw new Error(errorMessage(payload, 'Document template could not be saved.'));
  }
  return payload;
}

export async function duplicateDocumentTemplate(id: number): Promise<TemplateResponse> {
  const response = await apiFetch(buildApiUrl(`/api/document-templates/${id}/duplicate`), {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  const payload = await parseJson<TemplateResponse>(response);
  if (!response.ok || !payload?.success || !payload.data?.template) {
    throw new Error(errorMessage(payload, 'Document template could not be duplicated.'));
  }
  return payload;
}

export async function archiveDocumentTemplate(id: number): Promise<TemplateResponse> {
  const response = await apiFetch(buildApiUrl(`/api/document-templates/${id}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  const payload = await parseJson<TemplateResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, 'Document template could not be archived.'));
  }
  return payload;
}
