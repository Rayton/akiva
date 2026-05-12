import { apiFetch } from '../lib/network/apiClient';
import { buildApiUrl } from '../lib/network/apiBase';
import {
  GlAccount,
  GlAccountInquiryRow,
  GlAccountUserPermission,
  GlAccountsResponseMeta,
  GlAccountTrendRow,
  GlBankAccount,
  GlBankAccountPayload,
  GlBankImportResult,
  GlBankTransactionCreatePayload,
  GlBankTransaction,
  GlBudgetRow,
  GlCashFlowRow,
  GlFinancialStatementRow,
  GlGroup,
  GlHorizontalAnalysisRow,
  GlTagRow,
  GlTaxRow,
  GlTrialBalanceRow,
  GlTrialBalanceSummary,
  GlSettings,
  GlLookups,
  GlSection,
  GlJournalLineInput,
  GlTransaction,
  GlTransactionsPagination,
  GlTransactionSummary,
} from '../types/gl';

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  message?: string;
}

interface ApiObjectResponse<T, M = unknown> {
  success: boolean;
  data: T;
  message?: string;
  meta?: M;
}

interface ApiMessageResponse {
  success: boolean;
  message?: string;
}

interface ApiErrorPayload {
  message?: string;
  errors?: Record<string, string[] | string>;
  dependencies?: { name: string; count: number }[];
  accountsUsingGroup?: number;
  childGroupCount?: number;
  groupCount?: number;
}

export const DEFAULT_GL_SETTINGS: GlSettings = {
  companyCode: 1,
  companyName: 'Company',
  currencyCode: 'USD',
  currencyName: 'US Dollar',
  currencyDecimalPlaces: 2,
  hundredsName: 'Cents',
  dateFormat: 'Y-m-d',
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

  if (payload.message) {
    messages.push(payload.message);
  }

  if (payload.errors) {
    Object.values(payload.errors).forEach((value) => {
      if (Array.isArray(value)) {
        messages.push(...value);
      } else if (typeof value === 'string') {
        messages.push(value);
      }
    });
  }

  if (payload.dependencies && payload.dependencies.length > 0) {
    const dependencyText = payload.dependencies
      .map((dep) => `${dep.name}: ${dep.count}`)
      .join(', ');
    messages.push(`Dependencies: ${dependencyText}`);
  }

  if (typeof payload.accountsUsingGroup === 'number' && payload.accountsUsingGroup > 0) {
    messages.push(`Accounts using group: ${payload.accountsUsingGroup}`);
  }

  if (typeof payload.childGroupCount === 'number' && payload.childGroupCount > 0) {
    messages.push(`Child groups: ${payload.childGroupCount}`);
  }

  if (typeof payload.groupCount === 'number' && payload.groupCount > 0) {
    messages.push(`Groups using section: ${payload.groupCount}`);
  }

  return messages;
}

async function assertSuccess(response: Response): Promise<void> {
  if (response.ok) return;

  const payload = await parseResponseJson<ApiErrorPayload>(response);
  const messages = collectErrorMessages(payload);
  throw new Error(messages.length > 0 ? messages.join(' | ') : `Request failed with status ${response.status}`);
}

export async function fetchGlLookups(): Promise<GlLookups> {
  try {
    const response = await apiFetch(buildApiUrl('/api/gl/lookups'));
    await assertSuccess(response);

    const data = await parseResponseJson<ApiObjectResponse<GlLookups>>(response);
    if (!data?.success || !data.data) throw new Error('Invalid GL lookups response payload.');

    return data.data;
  } catch (error) {
    console.error('Failed to fetch GL lookups:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL lookups.'));
  }
}

export async function fetchGlSettings(): Promise<GlSettings> {
  try {
    const response = await apiFetch(buildApiUrl('/api/gl/settings'));
    await assertSuccess(response);

    const data = await parseResponseJson<ApiObjectResponse<GlSettings>>(response);
    if (!data?.success || !data.data) throw new Error('Invalid GL settings response payload.');

    return {
      companyCode: Number(data.data.companyCode || DEFAULT_GL_SETTINGS.companyCode),
      companyName: data.data.companyName || DEFAULT_GL_SETTINGS.companyName,
      currencyCode: data.data.currencyCode || DEFAULT_GL_SETTINGS.currencyCode,
      currencyName: data.data.currencyName || DEFAULT_GL_SETTINGS.currencyName,
      currencyDecimalPlaces:
        Number.isFinite(data.data.currencyDecimalPlaces) && data.data.currencyDecimalPlaces >= 0
          ? Number(data.data.currencyDecimalPlaces)
          : DEFAULT_GL_SETTINGS.currencyDecimalPlaces,
      hundredsName: data.data.hundredsName || DEFAULT_GL_SETTINGS.hundredsName,
      dateFormat: data.data.dateFormat || DEFAULT_GL_SETTINGS.dateFormat,
    };
  } catch (error) {
    console.error('Failed to fetch GL settings:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL settings.'));
  }
}

export async function fetchGlAccounts(params?: {
  q?: string;
  group?: string;
  section?: number;
  accountType?: number;
  cashFlowActivity?: number;
  limit?: number;
}): Promise<{ rows: GlAccount[]; meta: GlAccountsResponseMeta | null }> {
  try {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.group) query.set('group', params.group);
    if (params?.section !== undefined) query.set('section', String(params.section));
    if (params?.accountType !== undefined) query.set('accountType', String(params.accountType));
    if (params?.cashFlowActivity !== undefined) query.set('cashFlowActivity', String(params.cashFlowActivity));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/accounts?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<ApiObjectResponse<GlAccount[], GlAccountsResponseMeta>>(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL accounts response payload.');

    return {
      rows: data.data,
      meta: data.meta ?? null,
    };
  } catch (error) {
    console.error('Failed to fetch GL accounts:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL accounts.'));
  }
}

export async function fetchGlTransactions(params?: {
  q?: string;
  account?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: 'all' | 'posted' | 'pending';
  page?: number;
  limit?: number;
}): Promise<{ rows: GlTransaction[]; summary: GlTransactionSummary | null; pagination: GlTransactionsPagination | null }> {
  try {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.account) query.set('account', params.account);
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.status && params.status !== 'all') query.set('status', params.status);
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/transactions?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<GlTransaction[], { summary: GlTransactionSummary; pagination: GlTransactionsPagination }>
    >(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL transactions response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
      pagination: data.meta?.pagination ?? null,
    };
  } catch (error) {
    console.error('Failed to fetch GL transactions:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL transactions.'));
  }
}

export async function createGlJournalEntry(payload: {
  tranDate: string;
  narrative?: string;
  lines: GlJournalLineInput[];
}): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/transactions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function createGlAccount(payload: {
  accountCode: string;
  accountName: string;
  groupName: string;
  cashFlowsActivity: number;
}): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/accounts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function updateGlAccount(
  accountCode: string,
  payload: {
    accountName: string;
    groupName: string;
    cashFlowsActivity: number;
  }
): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/accounts/${encodeURIComponent(accountCode)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function deleteGlAccount(accountCode: string): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/accounts/${encodeURIComponent(accountCode)}`), {
    method: 'DELETE',
  });
  await assertSuccess(response);
}

export async function changeGlAccountCode(oldAccountCode: string, newAccountCode: string): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/accounts/change-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldAccountCode, newAccountCode }),
  });
  await assertSuccess(response);
}

export async function importGlAccountsCsv(file: File): Promise<void> {
  const form = new FormData();
  form.append('file', file);

  const response = await apiFetch(buildApiUrl('/api/gl/accounts/import-csv'), {
    method: 'POST',
    body: form,
  });
  await assertSuccess(response);
}

export async function fetchGlGroups(params?: { q?: string; limit?: number }): Promise<GlGroup[]> {
  try {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/groups?${query.toString()}`));
    if (!response.ok) return [];

    const data = await parseResponseJson<ApiListResponse<GlGroup>>(response);
    return data?.success && Array.isArray(data.data) ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch GL groups:', error);
    return [];
  }
}

export async function createGlGroup(payload: {
  groupName: string;
  sectionInAccounts: number;
  sequenceInTB: number;
  pandL: number;
  parentGroupName?: string;
}): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/groups'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function updateGlGroup(
  selectedGroupName: string,
  payload: {
    groupName: string;
    sectionInAccounts: number;
    sequenceInTB: number;
    pandL: number;
    parentGroupName?: string;
  }
): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/groups/${encodeURIComponent(selectedGroupName)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function deleteGlGroup(groupName: string): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/groups/${encodeURIComponent(groupName)}`), {
    method: 'DELETE',
  });
  await assertSuccess(response);
}

export async function moveGlGroup(originalAccountGroup: string, destinyAccountGroup: string): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/groups/move'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalAccountGroup, destinyAccountGroup }),
  });
  await assertSuccess(response);
}

export async function fetchGlSections(params?: { q?: string; limit?: number }): Promise<GlSection[]> {
  try {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/sections?${query.toString()}`));
    if (!response.ok) return [];

    const data = await parseResponseJson<ApiListResponse<GlSection>>(response);
    return data?.success && Array.isArray(data.data) ? data.data : [];
  } catch (error) {
    console.error('Failed to fetch GL sections:', error);
    return [];
  }
}

export async function createGlSection(payload: { sectionId: number; sectionName: string }): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/sections'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function updateGlSection(sectionId: number, sectionName: string): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/sections/${sectionId}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionName }),
  });
  await assertSuccess(response);
}

export async function deleteGlSection(sectionId: number): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/sections/${sectionId}`), {
    method: 'DELETE',
  });
  await assertSuccess(response);
}

export async function fetchGlTrialBalance(params?: {
  period?: number;
  q?: string;
  includeZero?: boolean;
  limit?: number;
}): Promise<{
  rows: GlTrialBalanceRow[];
  summary: GlTrialBalanceSummary | null;
  period: number;
  latestPeriod: number;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.period !== undefined) query.set('period', String(params.period));
    if (params?.q) query.set('q', params.q);
    if (params?.includeZero !== undefined) query.set('includeZero', String(params.includeZero));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/trial-balance?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<GlTrialBalanceRow[], { period: number; latestPeriod: number; summary: GlTrialBalanceSummary }>
    >(response);

    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL trial balance response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
      period: Number(data.meta?.period ?? 0),
      latestPeriod: Number(data.meta?.latestPeriod ?? 0),
    };
  } catch (error) {
    console.error('Failed to fetch GL trial balance:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL trial balance.'));
  }
}

export async function fetchGlCashFlowReport(params?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<{
  rows: GlCashFlowRow[];
  summary: { totalInflow: number; totalOutflow: number; netCashFlow: number } | null;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);

    const response = await apiFetch(buildApiUrl(`/api/gl/reports/cash-flow?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<GlCashFlowRow[], { summary: { totalInflow: number; totalOutflow: number; netCashFlow: number } }>
    >(response);

    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL cash flow response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
    };
  } catch (error) {
    console.error('Failed to fetch GL cash flow report:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL cash flow report.'));
  }
}

export async function fetchGlBankAccounts(): Promise<{ rows: GlBankAccount[]; totalBalance: number }> {
  try {
    const response = await apiFetch(buildApiUrl('/api/gl/bank-accounts'));
    await assertSuccess(response);

    const data = await parseResponseJson<ApiObjectResponse<GlBankAccount[], { summary: { totalBalance: number } }>>(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL bank accounts response payload.');

    return {
      rows: data.data,
      totalBalance: Number(data.meta?.summary?.totalBalance ?? 0),
    };
  } catch (error) {
    console.error('Failed to fetch GL bank accounts:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL bank accounts.'));
  }
}

export async function createGlBankAccount(payload: GlBankAccountPayload): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/bank-accounts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function updateGlBankAccount(accountCode: string, payload: Omit<GlBankAccountPayload, 'accountCode'>): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/bank-accounts/${encodeURIComponent(accountCode)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function deleteGlBankAccount(accountCode: string): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/bank-accounts/${encodeURIComponent(accountCode)}`), {
    method: 'DELETE',
  });
  await assertSuccess(response);
}

export async function fetchGlBankTransactions(params?: {
  accountCode?: string;
  dateFrom?: string;
  dateTo?: string;
  matchStatus?: 'all' | 'matched' | 'unmatched';
  kind?: 'all' | 'payments' | 'receipts';
  page?: number;
  limit?: number;
}): Promise<{
  rows: GlBankTransaction[];
  summary: { entries: number; totalPayments: number; totalReceipts: number; net: number } | null;
  pagination: GlTransactionsPagination | null;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.accountCode) query.set('accountCode', params.accountCode);
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.matchStatus && params.matchStatus !== 'all') query.set('matchStatus', params.matchStatus);
    if (params?.kind && params.kind !== 'all') query.set('kind', params.kind);
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/bank-transactions?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<
        GlBankTransaction[],
        {
          summary: { entries: number; totalPayments: number; totalReceipts: number; net: number };
          pagination: GlTransactionsPagination;
        }
      >
    >(response);

    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL bank transactions response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
      pagination: data.meta?.pagination ?? null,
    };
  } catch (error) {
    console.error('Failed to fetch GL bank transactions:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL bank transactions.'));
  }
}

export async function matchGlBankTransaction(bankTransId: number, amountCleared?: number): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/bank-transactions/${bankTransId}/match`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(amountCleared !== undefined ? { amountCleared } : {}),
  });
  await assertSuccess(response);
}

export async function unmatchGlBankTransaction(bankTransId: number): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/bank-transactions/${bankTransId}/unmatch`), {
    method: 'POST',
  });
  await assertSuccess(response);
}

export async function createGlBankTransaction(payload: GlBankTransactionCreatePayload): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/bank-transactions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function importGlBankTransactionsCsv(
  file: File,
  options?: { bankAccountCode?: string; defaultKind?: 'payment' | 'receipt' }
): Promise<GlBankImportResult> {
  const form = new FormData();
  form.append('file', file);
  if (options?.bankAccountCode) form.append('bankAccountCode', options.bankAccountCode);
  if (options?.defaultKind) form.append('defaultKind', options.defaultKind);

  const response = await apiFetch(buildApiUrl('/api/gl/bank-transactions/import-csv'), {
    method: 'POST',
    body: form,
  });
  await assertSuccess(response);

  const data = await parseResponseJson<ApiObjectResponse<GlBankImportResult>>(response);
  return data?.data ?? { imported: 0, skipped: 0, errors: [] };
}

export async function fetchGlBudgets(params?: {
  period?: number;
  q?: string;
  limit?: number;
}): Promise<{
  rows: GlBudgetRow[];
  summary: { accounts: number; budget: number; actual: number; variance: number } | null;
  period: number;
  latestPeriod: number;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.period !== undefined) query.set('period', String(params.period));
    if (params?.q) query.set('q', params.q);
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/budgets?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<GlBudgetRow[], { period: number; latestPeriod: number; summary: { accounts: number; budget: number; actual: number; variance: number } }>
    >(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL budgets response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
      period: Number(data.meta?.period ?? 0),
      latestPeriod: Number(data.meta?.latestPeriod ?? 0),
    };
  } catch (error) {
    console.error('Failed to fetch GL budgets:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL budgets.'));
  }
}

export async function upsertGlBudget(payload: {
  accountCode: string;
  period: number;
  budget: number;
  bfwdBudget?: number;
}): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/budgets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function fetchGlTags(params?: {
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<GlTagRow[]> {
  try {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);

    const response = await apiFetch(buildApiUrl(`/api/gl/tags?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<ApiListResponse<GlTagRow>>(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL tags response payload.');
    return data.data;
  } catch (error) {
    console.error('Failed to fetch GL tags:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL tags.'));
  }
}

export async function createGlTag(tagDescription: string): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/tags'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagDescription }),
  });
  await assertSuccess(response);
}

export async function updateGlTag(tagRef: number, tagDescription: string): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/tags/${tagRef}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagDescription }),
  });
  await assertSuccess(response);
}

export async function deleteGlTag(tagRef: number): Promise<void> {
  const response = await apiFetch(buildApiUrl(`/api/gl/tags/${tagRef}`), {
    method: 'DELETE',
  });
  await assertSuccess(response);
}

export async function fetchGlAccountUsers(scope: 'gl' | 'bank' = 'gl'): Promise<GlAccountUserPermission[]> {
  try {
    const response = await apiFetch(buildApiUrl(`/api/gl/account-users?scope=${scope}`));
    await assertSuccess(response);

    const data = await parseResponseJson<ApiListResponse<GlAccountUserPermission>>(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL account users response payload.');
    return data.data;
  } catch (error) {
    console.error('Failed to fetch GL account users:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL account users.'));
  }
}

export async function upsertGlAccountUser(payload: {
  scope: 'gl' | 'bank';
  userId: string;
  accountCode: string;
  canView?: boolean;
  canUpdate?: boolean;
}): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/account-users'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function deleteGlAccountUser(payload: {
  scope: 'gl' | 'bank';
  userId: string;
  accountCode: string;
}): Promise<void> {
  const response = await apiFetch(buildApiUrl('/api/gl/account-users'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await assertSuccess(response);
}

export async function fetchGlTaxReport(params?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<{
  rows: GlTaxRow[];
  summary: { authorities: number; salesTaxTotal: number; purchaseTaxTotal: number } | null;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);

    const response = await apiFetch(buildApiUrl(`/api/gl/reports/tax?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<GlTaxRow[], { summary: { authorities: number; salesTaxTotal: number; purchaseTaxTotal: number } }>
    >(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL tax report response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
    };
  } catch (error) {
    console.error('Failed to fetch GL tax report:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL tax report.'));
  }
}

export async function fetchGlFinancialStatement(params?: {
  type: 'balance-sheet' | 'profit-loss';
  period?: number;
  limit?: number;
}): Promise<{
  rows: GlFinancialStatementRow[];
  summary: { accounts: number; totalDebits: number; totalCredits: number; net: number } | null;
  period: number;
  latestPeriod: number;
}> {
  try {
    const query = new URLSearchParams();
    query.set('type', params?.type ?? 'balance-sheet');
    if (params?.period !== undefined) query.set('period', String(params.period));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/reports/financial-statement?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<
        GlFinancialStatementRow[],
        { period: number; latestPeriod: number; summary: { accounts: number; totalDebits: number; totalCredits: number; net: number } }
      >
    >(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL financial statement response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
      period: Number(data.meta?.period ?? 0),
      latestPeriod: Number(data.meta?.latestPeriod ?? 0),
    };
  } catch (error) {
    console.error('Failed to fetch GL financial statement:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL financial statement.'));
  }
}

export async function fetchGlHorizontalAnalysis(params?: {
  statement: 'position' | 'income';
  period?: number;
  limit?: number;
}): Promise<{
  rows: GlHorizontalAnalysisRow[];
  summary: { accounts: number; currentTotal: number; previousTotal: number; changeTotal: number } | null;
  currentPeriod: number;
  previousPeriod: number;
}> {
  try {
    const query = new URLSearchParams();
    query.set('statement', params?.statement ?? 'position');
    if (params?.period !== undefined) query.set('period', String(params.period));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/reports/horizontal-analysis?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<
        GlHorizontalAnalysisRow[],
        { currentPeriod: number; previousPeriod: number; summary: { accounts: number; currentTotal: number; previousTotal: number; changeTotal: number } }
      >
    >(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL horizontal analysis response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
      currentPeriod: Number(data.meta?.currentPeriod ?? 0),
      previousPeriod: Number(data.meta?.previousPeriod ?? 0),
    };
  } catch (error) {
    console.error('Failed to fetch GL horizontal analysis:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL horizontal analysis.'));
  }
}

export async function fetchGlAccountTrend(params: {
  accountCode: string;
  periods?: number;
}): Promise<{ rows: GlAccountTrendRow[]; accountName: string }> {
  try {
    const query = new URLSearchParams();
    query.set('accountCode', params.accountCode);
    if (params.periods !== undefined) query.set('periods', String(params.periods));

    const response = await apiFetch(buildApiUrl(`/api/gl/reports/account-trend?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<ApiObjectResponse<GlAccountTrendRow[], { accountName: string }>>(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL account trend response payload.');

    return {
      rows: data.data,
      accountName: String(data.meta?.accountName ?? ''),
    };
  } catch (error) {
    console.error('Failed to fetch GL account trend:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL account trend.'));
  }
}

export async function fetchGlAccountInquiry(params?: {
  accountCode?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<{
  rows: GlAccountInquiryRow[];
  summary: { entries: number; debits: number; credits: number; net: number } | null;
  pagination: GlTransactionsPagination | null;
}> {
  try {
    const query = new URLSearchParams();
    if (params?.accountCode) query.set('accountCode', params.accountCode);
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.q) query.set('q', params.q);
    if (params?.page !== undefined) query.set('page', String(params.page));
    if (params?.limit !== undefined) query.set('limit', String(params.limit));

    const response = await apiFetch(buildApiUrl(`/api/gl/reports/account-inquiry?${query.toString()}`));
    await assertSuccess(response);

    const data = await parseResponseJson<
      ApiObjectResponse<
        GlAccountInquiryRow[],
        { summary: { entries: number; debits: number; credits: number; net: number }; pagination: GlTransactionsPagination }
      >
    >(response);
    if (!data?.success || !Array.isArray(data.data)) throw new Error('Invalid GL account inquiry response payload.');

    return {
      rows: data.data,
      summary: data.meta?.summary ?? null,
      pagination: data.meta?.pagination ?? null,
    };
  } catch (error) {
    console.error('Failed to fetch GL account inquiry:', error);
    throw (error instanceof Error ? error : new Error('Failed to fetch GL account inquiry.'));
  }
}

export async function pingSalesModule(): Promise<boolean> {
  try {
    const response = await apiFetch(buildApiUrl('/api/sales/orders?limit=1'));
    if (!response.ok) return false;

    const data = await parseResponseJson<ApiMessageResponse>(response);
    return Boolean(data?.success);
  } catch (error) {
    console.error('Failed to ping sales module endpoint:', error);
    return false;
  }
}
