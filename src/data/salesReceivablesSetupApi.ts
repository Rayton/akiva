import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { SalesReceivablesSetupForm, SalesReceivablesSetupPayload, SalesReceivablesSetupTab } from '../types/salesReceivablesSetup';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

interface SalesReceivablesSetupResponse extends ApiErrorPayload {
  success: boolean;
  data?: SalesReceivablesSetupPayload & { selectedId?: string | number };
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

function normalizePayload(payload: SalesReceivablesSetupPayload): SalesReceivablesSetupPayload {
  return {
    salesTypes: Array.isArray(payload.salesTypes)
      ? payload.salesTypes.map((row) => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
        }))
      : [],
    customerTypes: Array.isArray(payload.customerTypes)
      ? payload.customerTypes.map((row) => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? ''),
        }))
      : [],
    creditStatuses: Array.isArray(payload.creditStatuses)
      ? payload.creditStatuses.map((row) => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? ''),
          disallowInvoices: Number(row.disallowInvoices ?? 0),
        }))
      : [],
    paymentTerms: Array.isArray(payload.paymentTerms)
      ? payload.paymentTerms.map((row) => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          daysBeforeDue: Number(row.daysBeforeDue ?? 0),
          dayInFollowingMonth: Number(row.dayInFollowingMonth ?? 0),
        }))
      : [],
    paymentMethods: Array.isArray(payload.paymentMethods)
      ? payload.paymentMethods.map((row) => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? ''),
          paymentType: Boolean(row.paymentType),
          receiptType: Boolean(row.receiptType),
          usePreprintedStationery: Boolean(row.usePreprintedStationery),
          openCashDrawer: Boolean(row.openCashDrawer),
          percentDiscount: Number(row.percentDiscount ?? 0),
        }))
      : [],
    salesPeople: Array.isArray(payload.salesPeople)
      ? payload.salesPeople.map((row) => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          telephone: String(row.telephone ?? ''),
          fax: String(row.fax ?? ''),
          commissionRate1: Number(row.commissionRate1 ?? 0),
          breakpoint: Number(row.breakpoint ?? 0),
          commissionRate2: Number(row.commissionRate2 ?? 0),
          current: Boolean(row.current),
        }))
      : [],
    areas: Array.isArray(payload.areas)
      ? payload.areas.map((row) => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
        }))
      : [],
    salesGlPostings: Array.isArray(payload.salesGlPostings)
      ? payload.salesGlPostings.map((row) => ({
          id: Number(row.id ?? 0),
          area: String(row.area ?? ''),
          areaName: String(row.areaName ?? ''),
          stockCategory: String(row.stockCategory ?? ''),
          stockCategoryName: String(row.stockCategoryName ?? ''),
          salesType: String(row.salesType ?? ''),
          salesTypeName: String(row.salesTypeName ?? ''),
          salesGlCode: String(row.salesGlCode ?? ''),
          salesGlName: String(row.salesGlName ?? ''),
          discountGlCode: String(row.discountGlCode ?? ''),
          discountGlName: String(row.discountGlName ?? ''),
          hasInvalidAccounts: Boolean(row.hasInvalidAccounts),
        }))
      : [],
    cogsGlPostings: Array.isArray(payload.cogsGlPostings)
      ? payload.cogsGlPostings.map((row) => ({
          id: Number(row.id ?? 0),
          area: String(row.area ?? ''),
          areaName: String(row.areaName ?? ''),
          stockCategory: String(row.stockCategory ?? ''),
          stockCategoryName: String(row.stockCategoryName ?? ''),
          salesType: String(row.salesType ?? ''),
          salesTypeName: String(row.salesTypeName ?? ''),
          cogsGlCode: String(row.cogsGlCode ?? ''),
          cogsGlName: String(row.cogsGlName ?? ''),
          hasInvalidAccount: Boolean(row.hasInvalidAccount),
        }))
      : [],
    discountMatrix: Array.isArray(payload.discountMatrix)
      ? payload.discountMatrix.map((row) => ({
          id: String(row.id ?? ''),
          salesType: String(row.salesType ?? ''),
          salesTypeName: String(row.salesTypeName ?? ''),
          discountCategory: String(row.discountCategory ?? ''),
          quantityBreak: Number(row.quantityBreak ?? 0),
          discountRate: Number(row.discountRate ?? 0),
          discountRatePercent: Number(row.discountRatePercent ?? 0),
        }))
      : [],
    lookups: {
      stockCategories: Array.isArray(payload.lookups?.stockCategories)
        ? payload.lookups.stockCategories.map((row) => ({
            code: String(row.code ?? ''),
            name: String(row.name ?? ''),
          }))
        : [],
      profitLossAccounts: Array.isArray(payload.lookups?.profitLossAccounts)
        ? payload.lookups.profitLossAccounts.map((row) => ({
            code: String(row.code ?? ''),
            name: String(row.name ?? ''),
          }))
        : [],
      discountCategories: Array.isArray(payload.lookups?.discountCategories)
        ? payload.lookups.discountCategories.map((row) => ({
            code: String(row.code ?? ''),
            name: String(row.name ?? ''),
          }))
        : [],
    },
    stats: {
      salesTypes: Number(payload.stats?.salesTypes ?? 0),
      customerTypes: Number(payload.stats?.customerTypes ?? 0),
      creditStatuses: Number(payload.stats?.creditStatuses ?? 0),
      paymentTerms: Number(payload.stats?.paymentTerms ?? 0),
      paymentMethods: Number(payload.stats?.paymentMethods ?? 0),
      salesPeople: Number(payload.stats?.salesPeople ?? 0),
      areas: Number(payload.stats?.areas ?? 0),
      salesGlPostings: Number(payload.stats?.salesGlPostings ?? 0),
      cogsGlPostings: Number(payload.stats?.cogsGlPostings ?? 0),
      discountMatrix: Number(payload.stats?.discountMatrix ?? 0),
      priceRows: Number(payload.stats?.priceRows ?? 0),
      customers: Number(payload.stats?.customers ?? 0),
      suppliers: Number(payload.stats?.suppliers ?? 0),
      bankTransactions: Number(payload.stats?.bankTransactions ?? 0),
      transactions: Number(payload.stats?.transactions ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<SalesReceivablesSetupResponse> {
  const payload = await parseJson<SalesReceivablesSetupResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as SalesReceivablesSetupPayload);
  return payload;
}

export async function fetchSalesReceivablesSetup(): Promise<SalesReceivablesSetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/sales-receivables/setup'));
  return normalizePayload((await readPayload(response, 'Sales and receivables setup could not be loaded.')).data as SalesReceivablesSetupPayload);
}

export async function saveSalesReceivablesSetupRecord(
  tab: SalesReceivablesSetupTab,
  form: SalesReceivablesSetupForm,
  id?: string | number
): Promise<SalesReceivablesSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/sales-receivables/setup/${tab}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...form,
      code: tab === 'sales-types' || tab === 'sales-people' || tab === 'areas'
        ? form.code?.trim().toUpperCase().replace(/\s+/g, '')
        : form.code?.trim().replace(/\s+/g, ''),
      name: form.name.trim(),
      disallowInvoices: form.disallowInvoices,
      dueMode: form.dueMode,
      dayNumber: form.dayNumber,
      paymentType: form.paymentType,
      receiptType: form.receiptType,
      usePreprintedStationery: form.usePreprintedStationery,
      openCashDrawer: form.openCashDrawer,
      percentDiscount: form.percentDiscount,
      telephone: form.telephone?.trim(),
      fax: form.fax?.trim(),
      commissionRate1: form.commissionRate1,
      breakpoint: form.breakpoint,
      commissionRate2: form.commissionRate2,
      current: form.current,
      area: form.area?.trim().toUpperCase().replace(/\s+/g, ''),
      stockCategory: form.stockCategory?.trim().toUpperCase().replace(/\s+/g, ''),
      salesType: form.salesType?.trim().toUpperCase().replace(/\s+/g, ''),
      salesGlCode: form.salesGlCode?.trim(),
      discountGlCode: form.discountGlCode?.trim(),
      cogsGlCode: form.cogsGlCode?.trim(),
      discountCategory: form.discountCategory?.trim().toUpperCase().replace(/\s+/g, ''),
      quantityBreak: form.quantityBreak,
      discountRatePercent: form.discountRatePercent,
    }),
  });
  return readPayload(response, 'Sales and receivables setup record could not be saved.');
}

export async function deleteSalesReceivablesSetupRecord(tab: SalesReceivablesSetupTab, id: string | number): Promise<SalesReceivablesSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/sales-receivables/setup/${tab}/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Sales and receivables setup record could not be deleted.');
}
