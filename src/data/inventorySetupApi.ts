import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type {
  DiscountCategory,
  InventoryLocation,
  InventoryLookupOption,
  InventorySetupForm,
  InventorySetupPayload,
  InventorySetupTab,
  StockCategory,
  UnitOfMeasure,
} from '../types/inventorySetup';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

interface InventorySetupResponse extends ApiErrorPayload {
  success: boolean;
  data?: InventorySetupPayload & { selectedId?: string | number };
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

function normalizeLookup(rows: InventoryLookupOption[] | undefined): InventoryLookupOption[] {
  return Array.isArray(rows) ? rows.map((row) => ({ code: String(row.code ?? ''), name: String(row.name ?? '') })) : [];
}

function normalizePayload(payload: InventorySetupPayload): InventorySetupPayload {
  return {
    stockCategories: Array.isArray(payload.stockCategories)
      ? payload.stockCategories.map((row): StockCategory => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          stockType: String(row.stockType ?? 'F'),
          stockAct: String(row.stockAct ?? ''),
          adjustmentAct: String(row.adjustmentAct ?? ''),
          issueAct: String(row.issueAct ?? ''),
          purchasePriceVarianceAct: String(row.purchasePriceVarianceAct ?? ''),
          materialUsageVarianceAct: String(row.materialUsageVarianceAct ?? ''),
          wipAct: String(row.wipAct ?? ''),
          defaultTaxCategoryId: Number(row.defaultTaxCategoryId ?? 1),
        }))
      : [],
    locations: Array.isArray(payload.locations)
      ? payload.locations.map((row): InventoryLocation => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          address1: String(row.address1 ?? ''),
          address2: String(row.address2 ?? ''),
          address3: String(row.address3 ?? ''),
          address4: String(row.address4 ?? ''),
          address5: String(row.address5 ?? ''),
          address6: String(row.address6 ?? ''),
          telephone: String(row.telephone ?? ''),
          fax: String(row.fax ?? ''),
          email: String(row.email ?? ''),
          contact: String(row.contact ?? ''),
          taxProvinceId: Number(row.taxProvinceId ?? 1),
          managed: Boolean(row.managed),
          internalRequest: Boolean(row.internalRequest),
          usedForWorkOrders: Boolean(row.usedForWorkOrders),
          glAccountCode: String(row.glAccountCode ?? ''),
          allowInvoicing: Boolean(row.allowInvoicing),
        }))
      : [],
    discountCategories: Array.isArray(payload.discountCategories)
      ? payload.discountCategories.map((row): DiscountCategory => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          stockItemCount: Number(row.stockItemCount ?? 0),
          discountMatrixCount: Number(row.discountMatrixCount ?? 0),
        }))
      : [],
    unitsOfMeasure: Array.isArray(payload.unitsOfMeasure)
      ? payload.unitsOfMeasure.map((row): UnitOfMeasure => ({ id: Number(row.id ?? 0), name: String(row.name ?? '') }))
      : [],
    lookups: {
      accounts: normalizeLookup(payload.lookups?.accounts),
      taxCategories: normalizeLookup(payload.lookups?.taxCategories),
      taxProvinces: normalizeLookup(payload.lookups?.taxProvinces),
    },
    stats: {
      stockCategories: Number(payload.stats?.stockCategories ?? 0),
      locations: Number(payload.stats?.locations ?? 0),
      discountCategories: Number(payload.stats?.discountCategories ?? 0),
      unitsOfMeasure: Number(payload.stats?.unitsOfMeasure ?? 0),
      stockItems: Number(payload.stats?.stockItems ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<InventorySetupResponse> {
  const payload = await parseJson<InventorySetupResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as InventorySetupPayload);
  return payload;
}

export async function fetchInventorySetup(): Promise<InventorySetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/inventory/setup'));
  return normalizePayload((await readPayload(response, 'Inventory setup could not be loaded.')).data as InventorySetupPayload);
}

export async function saveInventorySetupRecord(
  tab: InventorySetupTab,
  form: InventorySetupForm,
  id?: string | number
): Promise<InventorySetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/inventory/setup/${tab}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...form,
      code: form.code?.trim().toUpperCase().replace(/\s+/g, ''),
      name: form.name.trim(),
      stockType: form.stockType?.trim().toUpperCase(),
      stockAct: form.stockAct?.trim(),
      adjustmentAct: form.adjustmentAct?.trim(),
      issueAct: form.issueAct?.trim(),
      purchasePriceVarianceAct: form.purchasePriceVarianceAct?.trim(),
      materialUsageVarianceAct: form.materialUsageVarianceAct?.trim(),
      wipAct: form.wipAct?.trim(),
      glAccountCode: form.glAccountCode?.trim(),
    }),
  });
  return readPayload(response, 'Inventory setup record could not be saved.');
}

export async function deleteInventorySetupRecord(tab: InventorySetupTab, id: string | number): Promise<InventorySetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/inventory/setup/${tab}/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Inventory setup record could not be deleted.');
}
