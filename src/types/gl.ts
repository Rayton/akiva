export interface GlAccount {
  accountCode: string;
  accountName: string;
  groupName: string;
  sectionId: number;
  sectionName: string;
  accountType: number;
  accountTypeLabel: string;
  sequenceInTB: number;
  parentGroupName: string;
  cashFlowsActivity: number;
  cashFlowsActivityName: string;
  balance: number;
}

export interface GlGroup {
  groupName: string;
  sectionInAccounts: number;
  sectionName: string;
  pandL: number;
  pandLLabel: string;
  sequenceInTB: number;
  parentGroupName: string;
  accountCount: number;
}

export interface GlSection {
  sectionId: number;
  sectionName: string;
  groupCount: number;
  restricted: boolean;
}

export interface GlLookupGroup {
  groupName: string;
  sectionInAccounts: number;
  pandL: number;
  sequenceInTB: number;
  parentGroupName: string;
}

export interface GlLookupSection {
  sectionId: number;
  sectionName: string;
}

export interface GlCashFlowActivity {
  value: number;
  label: string;
}

export interface GlLookups {
  groups: GlLookupGroup[];
  sections: GlLookupSection[];
  cashFlowActivities: GlCashFlowActivity[];
}

export interface GlAccountsResponseMeta {
  latestPeriod: number;
  summary: {
    accounts: number;
    balanceSheetAccounts: number;
    profitLossAccounts: number;
  };
}

export interface GlSettings {
  companyCode: number;
  companyName: string;
  currencyCode: string;
  currencyName: string;
  currencyDecimalPlaces: number;
  hundredsName: string;
  dateFormat: string;
}

export interface GlTransaction {
  id: string;
  date: string;
  reference: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  status: 'Posted' | 'Pending';
  type: number;
  typeNo: number;
  periodNo: number;
  lineCount: number;
}

export interface GlTransactionSummary {
  entries: number;
  postedEntries: number;
  pendingEntries: number;
  totalDebits: number;
  totalCredits: number;
  balance: number;
}

export interface GlTransactionsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface GlJournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
}

export interface GlTrialBalanceRow {
  accountCode: string;
  accountName: string;
  groupName: string;
  sectionId: number;
  sectionName: string;
  accountType: number;
  accountTypeLabel: string;
  balance: number;
  debit: number;
  credit: number;
  budget: number;
  variance: number;
}

export interface GlTrialBalanceSummary {
  accounts: number;
  totalDebits: number;
  totalCredits: number;
  difference: number;
}

export interface GlBankAccount {
  accountCode: string;
  accountName: string;
  bankAccountName: string;
  bankAccountCode: string;
  bankAccountNumber: string;
  bankAddress: string;
  currencyCode: string;
  currencyName: string;
  currencyDecimalPlaces: number;
  importFormat: string;
  invoiceMode: number;
  balance: number;
}

export interface GlBankTransaction {
  id: number;
  date: string;
  reference: string;
  bankAccountCode: string;
  bankAccountName: string;
  type: number;
  typeNo: number;
  typeName: string;
  chequeNo: string;
  currencyCode: string;
  bankTransactionType: string;
  amount: number;
  amountCleared: number;
  status: 'Matched' | 'Unmatched';
  direction: 'Payment' | 'Receipt';
}

export interface GlBankTransactionLineInput {
  accountCode: string;
  amount: number;
  narrative?: string;
}

export interface GlBankTransactionCreatePayload {
  kind: 'payment' | 'receipt';
  bankAccountCode: string;
  tranDate: string;
  reference?: string;
  chequeNo?: string;
  narrative?: string;
  lines: GlBankTransactionLineInput[];
}

export interface GlBankImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface GlBankAccountPayload {
  accountCode: string;
  currCode: string;
  invoiceMode: number;
  bankAccountCode?: string;
  bankAccountName: string;
  bankAccountNumber?: string;
  bankAddress?: string;
  importFormat?: string;
}

export interface GlBudgetRow {
  accountCode: string;
  accountName: string;
  groupName: string;
  sectionId: number;
  sectionName: string;
  period: number;
  budget: number;
  actual: number;
  bfwd: number;
  bfwdBudget: number;
  variance: number;
}

export interface GlTagRow {
  tagRef: number;
  tagDescription: string;
  transactionCount: number;
  totalDebits: number;
  totalCredits: number;
  balance: number;
}

export interface GlAccountUserPermission {
  scope: 'gl' | 'bank';
  userId: string;
  userName: string;
  email: string;
  accountCode: string;
  accountName: string;
  bankAccountName?: string;
  canView: boolean;
  canUpdate: boolean;
}

export interface GlCashFlowRow {
  activity: number;
  activityName: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface GlTaxRow {
  taxId: number;
  description: string;
  salesTaxAccountCode: string;
  salesTaxAccountName: string;
  purchaseTaxAccountCode: string;
  purchaseTaxAccountName: string;
  salesTaxTotal: number;
  purchaseTaxTotal: number;
  netTax: number;
}

export interface GlFinancialStatementRow {
  accountCode: string;
  accountName: string;
  groupName: string;
  sectionId: number;
  sectionName: string;
  balance: number;
  debit: number;
  credit: number;
}

export interface GlHorizontalAnalysisRow {
  accountCode: string;
  accountName: string;
  groupName: string;
  sectionId: number;
  sectionName: string;
  currentBalance: number;
  previousBalance: number;
  change: number;
  changePct: number | null;
}

export interface GlAccountTrendRow {
  period: number;
  periodEndDate: string;
  balance: number;
}

export interface GlAccountInquiryRow {
  id: number;
  date: string;
  periodNo: number;
  accountCode: string;
  accountName: string;
  reference: string;
  narrative: string;
  debit: number;
  credit: number;
  amount: number;
  status: 'Posted' | 'Pending';
}
