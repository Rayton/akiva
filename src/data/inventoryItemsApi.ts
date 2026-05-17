import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { InventoryItem, InventoryItemForm, InventoryItemLookupOption, InventoryItemsPayload } from '../types/inventoryItems';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface InventoryItemsResponse extends ApiErrorPayload {
  success: boolean;
  data?: InventoryItemsPayload;
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

function normalizeLookup(rows: InventoryItemLookupOption[] | undefined): InventoryItemLookupOption[] {
  return Array.isArray(rows) ? rows.map((row) => ({ code: String(row.code ?? ''), name: String(row.name ?? '') })) : [];
}

function normalizeItem(row: InventoryItem): InventoryItem {
  return {
    stockId: String(row.stockId ?? ''),
    categoryId: String(row.categoryId ?? ''),
    categoryName: String(row.categoryName ?? ''),
    description: String(row.description ?? ''),
    longDescription: String(row.longDescription ?? ''),
    units: String(row.units ?? ''),
    mbFlag: String(row.mbFlag ?? 'B'),
    mbFlagLabel: String(row.mbFlagLabel ?? row.mbFlag ?? 'B'),
    actualCost: Number(row.actualCost ?? 0),
    lastCost: Number(row.lastCost ?? 0),
    materialCost: Number(row.materialCost ?? 0),
    labourCost: Number(row.labourCost ?? 0),
    overheadCost: Number(row.overheadCost ?? 0),
    discontinued: Boolean(row.discontinued),
    controlled: Boolean(row.controlled),
    eoq: Number(row.eoq ?? 0),
    volume: Number(row.volume ?? 0),
    grossWeight: Number(row.grossWeight ?? 0),
    kgs: Number(row.kgs ?? 0),
    barcode: String(row.barcode ?? ''),
    discountCategory: String(row.discountCategory ?? ''),
    discountCategoryName: String(row.discountCategoryName ?? ''),
    taxCatId: Number(row.taxCatId ?? 1),
    taxCategoryName: String(row.taxCategoryName ?? ''),
    serialised: Boolean(row.serialised),
    perishable: Boolean(row.perishable),
    decimalPlaces: Number(row.decimalPlaces ?? 0),
    netWeight: Number(row.netWeight ?? 0),
    onHand: Number(row.onHand ?? 0),
    locationCount: Number(row.locationCount ?? 0),
    priceCount: Number(row.priceCount ?? 0),
    supplierCount: Number(row.supplierCount ?? 0),
  };
}

function normalizePayload(payload: InventoryItemsPayload): InventoryItemsPayload {
  return {
    items: Array.isArray(payload.items) ? payload.items.map(normalizeItem) : [],
    lookups: {
      categories: normalizeLookup(payload.lookups?.categories),
      units: normalizeLookup(payload.lookups?.units),
      taxCategories: normalizeLookup(payload.lookups?.taxCategories),
      discountCategories: normalizeLookup(payload.lookups?.discountCategories),
      itemTypes: normalizeLookup(payload.lookups?.itemTypes),
    },
    stats: {
      totalItems: Number(payload.stats?.totalItems ?? 0),
      activeItems: Number(payload.stats?.activeItems ?? 0),
      discontinuedItems: Number(payload.stats?.discontinuedItems ?? 0),
      controlledItems: Number(payload.stats?.controlledItems ?? 0),
      serialisedItems: Number(payload.stats?.serialisedItems ?? 0),
      categories: Number(payload.stats?.categories ?? 0),
    },
    selectedId: payload.selectedId ? String(payload.selectedId) : undefined,
  };
}

async function readPayload(response: Response, fallback: string): Promise<InventoryItemsResponse> {
  const payload = await parseJson<InventoryItemsResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data);
  return payload;
}

export async function fetchInventoryItems(): Promise<InventoryItemsPayload> {
  const response = await apiFetch(buildApiUrl('/api/inventory/items/workbench?limit=5000'));
  return normalizePayload((await readPayload(response, 'Inventory items could not be loaded.')).data as InventoryItemsPayload);
}

export async function saveInventoryItem(form: InventoryItemForm, stockId?: string): Promise<InventoryItemsResponse> {
  const response = await apiFetch(buildApiUrl(`/api/inventory/items${stockId ? `/${encodeURIComponent(stockId)}` : ''}`), {
    method: stockId ? 'PUT' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...form,
      stockId: form.stockId.trim().toUpperCase().replace(/\s+/g, ''),
      description: form.description.trim(),
      longDescription: form.longDescription.trim(),
      categoryId: form.categoryId.trim().toUpperCase(),
      units: form.units.trim(),
      mbFlag: form.mbFlag.trim().toUpperCase(),
      discountCategory: form.discountCategory.trim().toUpperCase(),
      barcode: form.barcode.trim(),
    }),
  });

  return readPayload(response, 'Inventory item could not be saved.');
}
