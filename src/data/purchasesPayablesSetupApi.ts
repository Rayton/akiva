import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type {
  FreightCost,
  PaymentMethod,
  PaymentTerm,
  PoAuthorisationLevel,
  PurchasesPayablesLookupOption,
  PurchasesPayablesSetupForm,
  PurchasesPayablesSetupPayload,
  PurchasesPayablesSetupTab,
  Shipper,
  SupplierType,
} from '../types/purchasesPayablesSetup';

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
}

interface PurchasesPayablesSetupResponse extends ApiErrorPayload {
  success: boolean;
  data?: PurchasesPayablesSetupPayload & { selectedId?: string | number };
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

function lookupRows(rows: PurchasesPayablesLookupOption[] | undefined): PurchasesPayablesLookupOption[] {
  return Array.isArray(rows) ? rows.map((row) => ({ code: String(row.code ?? ''), name: String(row.name ?? '') })) : [];
}

function normalizePayload(payload: PurchasesPayablesSetupPayload): PurchasesPayablesSetupPayload {
  return {
    supplierTypes: Array.isArray(payload.supplierTypes)
      ? payload.supplierTypes.map((row): SupplierType => ({ id: Number(row.id ?? 0), name: String(row.name ?? '') }))
      : [],
    paymentTerms: Array.isArray(payload.paymentTerms)
      ? payload.paymentTerms.map((row): PaymentTerm => ({
          code: String(row.code ?? ''),
          name: String(row.name ?? ''),
          daysBeforeDue: Number(row.daysBeforeDue ?? 0),
          dayInFollowingMonth: Number(row.dayInFollowingMonth ?? 0),
        }))
      : [],
    poAuthorisationLevels: Array.isArray(payload.poAuthorisationLevels)
      ? payload.poAuthorisationLevels.map((row): PoAuthorisationLevel => ({
          id: String(row.id ?? ''),
          userId: String(row.userId ?? ''),
          userName: String(row.userName ?? ''),
          currencyCode: String(row.currencyCode ?? ''),
          currencyName: String(row.currencyName ?? ''),
          canCreate: Boolean(row.canCreate),
          canReview: Boolean(row.canReview),
          authLevel: Number(row.authLevel ?? 0),
          offHold: Boolean(row.offHold),
        }))
      : [],
    paymentMethods: Array.isArray(payload.paymentMethods)
      ? payload.paymentMethods.map((row): PaymentMethod => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? ''),
          paymentType: Boolean(row.paymentType),
          receiptType: Boolean(row.receiptType),
          usePreprintedStationery: Boolean(row.usePreprintedStationery),
          openCashDrawer: Boolean(row.openCashDrawer),
          percentDiscount: Number(row.percentDiscount ?? 0),
        }))
      : [],
    shippers: Array.isArray(payload.shippers)
      ? payload.shippers.map((row): Shipper => ({
          id: Number(row.id ?? 0),
          name: String(row.name ?? ''),
          minimumCharge: Number(row.minimumCharge ?? 0),
        }))
      : [],
    freightCosts: Array.isArray(payload.freightCosts)
      ? payload.freightCosts.map((row): FreightCost => ({
          id: Number(row.id ?? 0),
          locationFrom: String(row.locationFrom ?? ''),
          locationName: String(row.locationName ?? ''),
          destinationCountry: String(row.destinationCountry ?? ''),
          destination: String(row.destination ?? ''),
          shipperId: Number(row.shipperId ?? 0),
          shipperName: String(row.shipperName ?? ''),
          cubRate: Number(row.cubRate ?? 0),
          kgRate: Number(row.kgRate ?? 0),
          maxKgs: Number(row.maxKgs ?? 0),
          maxCub: Number(row.maxCub ?? 0),
          fixedPrice: Number(row.fixedPrice ?? 0),
          minimumCharge: Number(row.minimumCharge ?? 0),
        }))
      : [],
    lookups: {
      users: lookupRows(payload.lookups?.users),
      currencies: lookupRows(payload.lookups?.currencies),
      locations: lookupRows(payload.lookups?.locations),
    },
    stats: {
      supplierTypes: Number(payload.stats?.supplierTypes ?? 0),
      paymentTerms: Number(payload.stats?.paymentTerms ?? 0),
      poAuthorisationLevels: Number(payload.stats?.poAuthorisationLevels ?? 0),
      paymentMethods: Number(payload.stats?.paymentMethods ?? 0),
      shippers: Number(payload.stats?.shippers ?? 0),
      freightCosts: Number(payload.stats?.freightCosts ?? 0),
      suppliers: Number(payload.stats?.suppliers ?? 0),
      bankTransactions: Number(payload.stats?.bankTransactions ?? 0),
    },
  };
}

async function readPayload(response: Response, fallback: string): Promise<PurchasesPayablesSetupResponse> {
  const payload = await parseJson<PurchasesPayablesSetupResponse>(response);
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(errorMessage(payload, fallback));
  }
  payload.data = normalizePayload(payload.data as PurchasesPayablesSetupPayload);
  return payload;
}

export async function fetchPurchasesPayablesSetup(): Promise<PurchasesPayablesSetupPayload> {
  const response = await apiFetch(buildApiUrl('/api/configuration/purchases-payables/setup'));
  return normalizePayload((await readPayload(response, 'Purchases and payables setup could not be loaded.')).data as PurchasesPayablesSetupPayload);
}

export async function savePurchasesPayablesSetupRecord(
  tab: PurchasesPayablesSetupTab,
  form: PurchasesPayablesSetupForm,
  id?: string | number
): Promise<PurchasesPayablesSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/purchases-payables/setup/${tab}${id === undefined ? '' : `/${encodeURIComponent(String(id))}`}`), {
    method: id === undefined ? 'POST' : 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      ...form,
      code: form.code?.trim().toUpperCase().replace(/\s+/g, ''),
      name: form.name.trim(),
      userId: form.userId?.trim(),
      currencyCode: form.currencyCode?.trim().toUpperCase(),
      locationFrom: form.locationFrom?.trim().toUpperCase(),
      destinationCountry: form.destinationCountry?.trim(),
      destination: form.destination?.trim(),
    }),
  });
  return readPayload(response, 'Purchases and payables setup record could not be saved.');
}

export async function deletePurchasesPayablesSetupRecord(tab: PurchasesPayablesSetupTab, id: string | number): Promise<PurchasesPayablesSetupResponse> {
  const response = await apiFetch(buildApiUrl(`/api/configuration/purchases-payables/setup/${tab}/${encodeURIComponent(String(id))}`), {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  return readPayload(response, 'Purchases and payables setup record could not be deleted.');
}
