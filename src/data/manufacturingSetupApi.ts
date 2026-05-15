import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type {
  ManufacturingSetupForm,
  ManufacturingSetupPayload,
  ManufacturingSetupTab,
  MrpCalendarDay,
  MrpDemandType,
} from '../types/manufacturingSetup';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

interface ManufacturingSetupResponse extends ApiErrorPayload {
  success: boolean;
  data?: ManufacturingSetupPayload & { selectedId?: string | number };
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
  if (payload?.dependencies?.length) {
    messages.push(payload.dependencies.map((dependency) => `${dependency.name}: ${dependency.count}`).join(', '));
  }
  return messages.length > 0 ? messages.join(' | ') : fallback;
}

function normalizePayload(payload: ManufacturingSetupPayload): ManufacturingSetupPayload {
  return {
    calendar: Array.isArray(payload.calendar)
      ? payload.calendar.map((row): MrpCalendarDay => ({
          calendarDate: String(row.calendarDate ?? ''),
          weekday: String(row.weekday ?? ''),
          dayNumber: Number(row.dayNumber ?? 0),
          manufacturingAvailable: Boolean(row.manufacturingAvailable),
        }))
      : [],
    demandTypes: Array.isArray(payload.demandTypes)
      ? payload.demandTypes.map((row): MrpDemandType => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          demandCount: Number(row.demandCount ?? 0),
          requirementCount: Number(row.requirementCount ?? 0),
        }))
      : [],
    stats: {
      calendarDays: Number(payload.stats?.calendarDays ?? 0),
      manufacturingDays: Number(payload.stats?.manufacturingDays ?? 0),
      nonManufacturingDays: Number(payload.stats?.nonManufacturingDays ?? 0),
      demandTypes: Number(payload.stats?.demandTypes ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<ManufacturingSetupResponse> {
  const payload = await parseJson<ManufacturingSetupResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as ManufacturingSetupPayload);
  return payload;
}

export async function fetchManufacturingSetup(): Promise<ManufacturingSetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/manufacturing/setup'));
  return normalizePayload((await readPayload(response, 'Manufacturing setup could not be loaded.')).data as ManufacturingSetupPayload);
}

export async function saveManufacturingSetupRecord(
  tab: ManufacturingSetupTab,
  form: ManufacturingSetupForm,
  id?: string | number
): Promise<ManufacturingSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/manufacturing/setup/${tab}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...form,
      code: form.code?.trim().toUpperCase().replace(/\s+/g, ''),
      name: form.name.trim(),
    }),
  });
  return readPayload(response, 'Manufacturing setup record could not be saved.');
}

export async function deleteManufacturingSetupRecord(tab: ManufacturingSetupTab, id: string | number): Promise<ManufacturingSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/manufacturing/setup/${tab}/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Manufacturing setup record could not be deleted.');
}
