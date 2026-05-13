import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import type { CompanyPreferencesForm, CompanyPreferencesPayload } from '../types/companyPreferences';

interface ApiObjectResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: Record<string, string[] | string>;
}

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
}

export const DEFAULT_COMPANY_PREFERENCES: CompanyPreferencesForm = {
  coyName: "ST.WALBURG'S NYANGAO HOSPITAL_INV.MANAGEM",
  companyNumber: 'NYANGAO',
  gstNo: 'not entered yet',
  regOffice1: 'P.O. Box 1002',
  regOffice2: '',
  regOffice3: '',
  regOffice4: '',
  regOffice5: 'LINDI',
  regOffice6: 'Tanzania',
  telephone: '+255',
  fax: '+255',
  email: 'nyangao.hospital@gmail.com',
  location1: '',
  location2: '',
  office1: '',
  office2: '',
  fax2: '',
  telephone2: '',
  website: '',
  currencyDefault: 'TZS',
  debtorsAct: '1250',
  creditorsAct: '2230',
  payrollAct: '2119',
  grnAct: '2210',
  retainedEarnings: '2340',
  freightAct: '1',
  exchangeDiffAct: '3216',
  purchasesExchangeDiffAct: '3216',
  pytDiscountAct: '3216',
  glLinkDebtors: true,
  glLinkCreditors: true,
  glLinkStock: true,
};

export const DEFAULT_COMPANY_PREFERENCES_PAYLOAD: CompanyPreferencesPayload = {
  preferences: DEFAULT_COMPANY_PREFERENCES,
  currencies: [{ code: 'TZS', name: 'Tanzanian shilling' }],
  balanceSheetAccounts: [
    { code: '1250', name: 'Accounts Receivables', label: 'Accounts Receivables (1250)' },
    { code: '2230', name: 'Trade and Other Payables', label: 'Trade and Other Payables (2230)' },
    { code: '2119', name: 'Ney salaries Payable', label: 'Ney salaries Payable (2119)' },
    { code: '2210', name: 'GRN Suspense A/C', label: 'GRN Suspense A/C (2210)' },
    { code: '2340', name: 'Retained Earnings_Prior YR', label: 'Retained Earnings_Prior YR (2340)' },
  ],
  profitLossAccounts: [
    { code: '1', name: 'Default Sales', label: 'Default Sales (1)' },
    { code: '3216', name: 'Gain/Loss exchange rate', label: 'Gain/Loss exchange rate (3216)' },
  ],
};

async function parseResponseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function collectErrorMessages(payload: ApiErrorPayload | null): string[] {
  if (!payload) return [];

  const messages: string[] = [];
  if (payload.message) messages.push(payload.message);

  if (payload.errors) {
    Object.values(payload.errors).forEach((value) => {
      if (Array.isArray(value)) {
        messages.push(...value);
      } else if (typeof value === 'string') {
        messages.push(value);
      }
    });
  }

  return messages;
}

async function assertSuccess(response: Response): Promise<void> {
  if (response.ok) return;

  const payload = await parseResponseJson<ApiErrorPayload>(response);
  const messages = collectErrorMessages(payload);
  throw new Error(messages.length > 0 ? messages.join(' | ') : `Request failed with status ${response.status}`);
}

function normalizePayload(payload: CompanyPreferencesPayload): CompanyPreferencesPayload {
  return {
    preferences: {
      ...DEFAULT_COMPANY_PREFERENCES,
      ...payload.preferences,
      glLinkDebtors: Boolean(payload.preferences?.glLinkDebtors),
      glLinkCreditors: Boolean(payload.preferences?.glLinkCreditors),
      glLinkStock: Boolean(payload.preferences?.glLinkStock),
    },
    currencies: Array.isArray(payload.currencies) ? payload.currencies : [],
    balanceSheetAccounts: Array.isArray(payload.balanceSheetAccounts) ? payload.balanceSheetAccounts : [],
    profitLossAccounts: Array.isArray(payload.profitLossAccounts) ? payload.profitLossAccounts : [],
  };
}

export async function fetchCompanyPreferences(): Promise<CompanyPreferencesPayload> {
  const response = await apiFetch(buildApiUrl('/api/company/preferences'));
  await assertSuccess(response);

  const data = await parseResponseJson<ApiObjectResponse<CompanyPreferencesPayload>>(response);
  if (!data?.success || !data.data) throw new Error('Invalid company preferences response payload.');

  return normalizePayload(data.data);
}

export async function updateCompanyPreferences(payload: CompanyPreferencesForm): Promise<CompanyPreferencesPayload> {
  const response = await apiFetch(buildApiUrl('/api/company/preferences'), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  await assertSuccess(response);

  const data = await parseResponseJson<ApiObjectResponse<CompanyPreferencesPayload>>(response);
  if (!data?.success || !data.data) throw new Error('Invalid company preferences update response payload.');

  return normalizePayload(data.data);
}
