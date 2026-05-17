import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type {
  MarkupPriceForm,
  MarkupPriceLookupOption,
  MarkupPriceRow,
  MarkupPriceRunPayload,
  MarkupPriceSummary,
  MarkupPriceWorkbenchPayload,
} from '../types/markupPrices';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface WorkbenchResponse extends ApiErrorPayload {
  success: boolean;
  data?: MarkupPriceWorkbenchPayload;
}

interface RunResponse extends ApiErrorPayload {
  success: boolean;
  message?: string;
  data?: MarkupPriceRunPayload;
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

function normalizeLookup(rows: MarkupPriceLookupOption[] | undefined): MarkupPriceLookupOption[] {
  return Array.isArray(rows)
    ? rows.map((row) => ({
        code: String(row.code ?? ''),
        name: String(row.name ?? ''),
        rate: row.rate === undefined ? undefined : Number(row.rate),
      }))
    : [];
}

function normalizeForm(form: Partial<MarkupPriceForm> | undefined): MarkupPriceForm {
  return {
    priceList: String(form?.priceList ?? ''),
    currency: String(form?.currency ?? ''),
    costBasis: form?.costBasis ?? 'standard-cost',
    basePriceList: String(form?.basePriceList ?? ''),
    categoryFrom: String(form?.categoryFrom ?? ''),
    categoryTo: String(form?.categoryTo ?? ''),
    roundingFactor: Number(form?.roundingFactor ?? 0.01),
    markupPercent: Number(form?.markupPercent ?? 0),
    startDate: String(form?.startDate ?? ''),
    endDate: String(form?.endDate ?? ''),
  };
}

function normalizeRow(row: MarkupPriceRow): MarkupPriceRow {
  return {
    stockId: String(row.stockId ?? ''),
    description: String(row.description ?? ''),
    categoryId: String(row.categoryId ?? ''),
    categoryName: String(row.categoryName ?? ''),
    units: String(row.units ?? ''),
    decimalPlaces: Number(row.decimalPlaces ?? 0),
    basisCost: row.basisCost === null || row.basisCost === undefined ? null : Number(row.basisCost),
    currentPrice: row.currentPrice === null || row.currentPrice === undefined ? null : Number(row.currentPrice),
    currentStartDate: row.currentStartDate === null || row.currentStartDate === undefined ? null : String(row.currentStartDate),
    currentEndDate: row.currentEndDate === null || row.currentEndDate === undefined ? null : String(row.currentEndDate),
    newPrice: row.newPrice === null || row.newPrice === undefined ? null : Number(row.newPrice),
    currency: String(row.currency ?? ''),
    status: row.status === 'ready' ? 'ready' : 'skipped',
    action: ['insert', 'replace', 'update', 'skipped'].includes(row.action) ? row.action : 'skipped',
    reason: String(row.reason ?? ''),
  };
}

function normalizeSummary(summary: Partial<MarkupPriceSummary> | undefined): MarkupPriceSummary {
  return {
    candidateCount: Number(summary?.candidateCount ?? 0),
    readyCount: Number(summary?.readyCount ?? 0),
    skippedCount: Number(summary?.skippedCount ?? 0),
    insertCount: Number(summary?.insertCount ?? 0),
    replaceCount: Number(summary?.replaceCount ?? 0),
    updateCount: Number(summary?.updateCount ?? 0),
    currentRowsClosed: Number(summary?.currentRowsClosed ?? 0),
    insertedCount: Number(summary?.insertedCount ?? 0),
    updatedPriceCount: Number(summary?.updatedPriceCount ?? 0),
  };
}

function normalizeWorkbench(payload: MarkupPriceWorkbenchPayload): MarkupPriceWorkbenchPayload {
  return {
    lookups: {
      priceLists: normalizeLookup(payload.lookups?.priceLists),
      currencies: normalizeLookup(payload.lookups?.currencies),
      categories: normalizeLookup(payload.lookups?.categories),
      costBasisOptions: normalizeLookup(payload.lookups?.costBasisOptions),
    },
    defaults: normalizeForm(payload.defaults),
    stats: {
      totalItems: Number(payload.stats?.totalItems ?? 0),
      priceRows: Number(payload.stats?.priceRows ?? 0),
      pricedItems: Number(payload.stats?.pricedItems ?? 0),
      priceLists: Number(payload.stats?.priceLists ?? 0),
      currencies: Number(payload.stats?.currencies ?? 0),
      categories: Number(payload.stats?.categories ?? 0),
    },
  };
}

function normalizeRun(payload: MarkupPriceRunPayload): MarkupPriceRunPayload {
  return {
    form: normalizeForm(payload.form),
    rows: Array.isArray(payload.rows) ? payload.rows.map(normalizeRow) : [],
    summary: normalizeSummary(payload.summary),
  };
}

async function readWorkbench(response: Response, fallback: string): Promise<MarkupPriceWorkbenchPayload> {
  const payload = await parseJson<WorkbenchResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  return normalizeWorkbench(payload.data);
}

async function readRun(response: Response, fallback: string): Promise<RunResponse> {
  const payload = await parseJson<RunResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizeRun(payload.data);
  return payload;
}

function requestPayload(form: MarkupPriceForm) {
  return {
    priceList: form.priceList.trim().toUpperCase(),
    currency: form.currency.trim().toUpperCase(),
    costBasis: form.costBasis,
    basePriceList: form.basePriceList.trim().toUpperCase(),
    categoryFrom: form.categoryFrom.trim().toUpperCase(),
    categoryTo: form.categoryTo.trim().toUpperCase(),
    roundingFactor: Number(form.roundingFactor || 0),
    markupPercent: Number(form.markupPercent || 0),
    startDate: form.startDate,
    endDate: form.endDate,
  };
}

export async function fetchMarkupPriceWorkbench(): Promise<MarkupPriceWorkbenchPayload> {
  const response = await apiFetch(buildApiUrl('/api/inventory/prices/markup/workbench'));
  return readWorkbench(response, 'Markup price workbench could not be loaded.');
}

export async function previewMarkupPrices(form: MarkupPriceForm): Promise<RunResponse> {
  const response = await apiFetch(buildApiUrl('/api/inventory/prices/markup/preview'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestPayload(form)),
  });

  return readRun(response, 'Markup price preview could not be calculated.');
}

export async function applyMarkupPrices(form: MarkupPriceForm): Promise<RunResponse> {
  const response = await apiFetch(buildApiUrl('/api/inventory/prices/markup/apply'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(requestPayload(form)),
  });

  return readRun(response, 'Markup prices could not be applied.');
}
