import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { DatePicker } from '../components/common/DatePicker';
import {
  DEFAULT_GL_SETTINGS,
  createGlJournalEntry,
  createGlBankAccount,
  createGlBankTransaction,
  createGlTag,
  deleteGlAccountUser,
  deleteGlBankAccount,
  deleteGlTag,
  fetchGlAccountInquiry,
  fetchGlAccountTrend,
  fetchGlAccountUsers,
  fetchGlAccounts,
  fetchGlBankAccounts,
  fetchGlBankTransactions,
  fetchGlBudgets,
  fetchGlCashFlowReport,
  fetchGlFinancialStatement,
  fetchGlHorizontalAnalysis,
  fetchGlSettings,
  fetchGlTags,
  fetchGlTaxReport,
  fetchGlTransactions,
  fetchGlTrialBalance,
  importGlBankTransactionsCsv,
  matchGlBankTransaction,
  unmatchGlBankTransaction,
  upsertGlAccountUser,
  upsertGlBudget,
  updateGlBankAccount,
  updateGlTag,
} from '../data/glApi';
import type {
  GlAccount,
  GlAccountInquiryRow,
  GlAccountUserPermission,
  GlAccountTrendRow,
  GlBankAccount,
  GlBankAccountPayload,
  GlBankTransactionCreatePayload,
  GlBankTransaction,
  GlBudgetRow,
  GlCashFlowRow,
  GlFinancialStatementRow,
  GlHorizontalAnalysisRow,
  GlJournalLineInput,
  GlSettings,
  GlTagRow,
  GlTaxRow,
  GlTransaction,
  GlTransactionsPagination,
  GlTransactionSummary,
  GlTrialBalanceRow,
  GlTrialBalanceSummary,
} from '../types/gl';

interface GeneralLedgerProps {
  sourceSlug?: string;
  sourceHref?: string;
  sourceCaption?: string;
}

type GlMode = 'transactions' | 'reports' | 'banking' | 'budgets' | 'tags' | 'permissions';
type ReportFocus =
  | 'trial'
  | 'balance-sheet'
  | 'profit-loss'
  | 'cash'
  | 'horizontal-position'
  | 'horizontal-income'
  | 'account-inquiry'
  | 'account-trend'
  | 'account-listing'
  | 'tax';

interface JournalLineForm {
  accountCode: string;
  debit: string;
  credit: string;
}

interface BankTransactionLineForm {
  accountCode: string;
  amount: string;
  narrative: string;
}

interface BankAccountForm {
  accountCode: string;
  currCode: string;
  invoiceMode: number;
  bankAccountCode: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankAddress: string;
  importFormat: string;
}

function normalizeSlugKey(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeHref(sourceHref: string): string {
  return sourceHref.replace(/&amp;/gi, '&').trim().toLowerCase();
}

function sourceScriptName(sourceHref: string): string {
  const href = normalizeHref(sourceHref);
  const filename = href.split('?')[0].split('/').pop() ?? '';
  return filename.replace(/\.php$/i, '').toLowerCase();
}

function modeFromSource(sourceSlug: string, sourceHref: string, sourceCaption: string): GlMode {
  const key = normalizeSlugKey(sourceSlug);
  const script = sourceScriptName(sourceHref);
  const captionKey = normalizeSlugKey(sourceCaption);

  const combined = `${key}|${script}|${captionKey}`;

  if (
    combined.includes('glaccountusers') ||
    combined.includes('userglaccounts') ||
    combined.includes('bankaccountusers') ||
    combined.includes('userbankaccounts')
  ) {
    return 'permissions';
  }

  if (combined.includes('glbudgets')) {
    return 'budgets';
  }

  if (combined.includes('gltags') || combined.includes('gltagprofitloss')) {
    return 'tags';
  }

  if (
    combined.includes('bankaccountbalances') ||
    combined.includes('bankreconciliation') ||
    combined.includes('dailybanktransactions') ||
    combined.includes('bankmatching') ||
    combined.includes('bankaccounts') ||
    combined.includes('payments') ||
    combined.includes('customerreceipt') ||
    combined.includes('importbanktrans') ||
    combined.includes('pdfchequelisting')
  ) {
    return 'banking';
  }

  if (
    combined.includes('trialbalance') ||
    combined.includes('balancesheet') ||
    combined.includes('profitloss') ||
    combined.includes('cashflows') ||
    combined.includes('analysis') ||
    combined.includes('tax') ||
    combined.includes('accountinquiry') ||
    combined.includes('accountgraph') ||
    combined.includes('accountreport') ||
    combined.includes('accountcsv') ||
    combined.includes('gljournalinquiry') ||
    combined.includes('selectglaccount')
  ) {
    return 'reports';
  }

  return 'transactions';
}

function reportFocusFromSource(sourceSlug: string, sourceHref: string, sourceCaption: string): ReportFocus {
  const key = normalizeSlugKey(sourceSlug);
  const script = sourceScriptName(sourceHref);
  const captionKey = normalizeSlugKey(sourceCaption);
  const combined = `${key}|${script}|${captionKey}`;

  if (combined.includes('glbalancesheet') || combined.includes('balancesheet')) return 'balance-sheet';
  if (combined.includes('glprofitloss') || combined.includes('profitloss')) return 'profit-loss';
  if (combined.includes('analysishorizontalposition') || combined.includes('horizontalanalysisofstatementoffinancialposition')) {
    return 'horizontal-position';
  }
  if (combined.includes('analysishorizontalincome') || combined.includes('horizontalanalysisofstatementofcomprehensiveincome')) {
    return 'horizontal-income';
  }
  if (combined.includes('glaccountgraph') || combined.includes('graphofaccounttransactions')) return 'account-trend';
  if (combined.includes('selectglaccount') || combined.includes('gljournalinquiry') || combined.includes('accountinquiry')) {
    return 'account-inquiry';
  }
  if (combined.includes('glaccountreport') || combined.includes('glaccountcsv') || combined.includes('accountlisting')) {
    return 'account-listing';
  }
  if (combined.includes('cashflows')) return 'cash';
  if (combined.includes('tax')) return 'tax';
  return 'trial';
}

function bankDefaultsFromSource(sourceHref: string): {
  kind: 'all' | 'payments' | 'receipts';
  match: 'all' | 'matched' | 'unmatched';
} {
  const href = normalizeHref(sourceHref);
  const script = sourceScriptName(href);
  const query = href.split('?')[1] ?? '';
  const params = new URLSearchParams(query);
  const type = (params.get('type') ?? '').toLowerCase();

  if (script === 'payments' || (script === 'bankmatching' && type === 'payments')) {
    return { kind: 'payments', match: script === 'bankmatching' ? 'unmatched' : 'all' };
  }
  if (script === 'customerreceipt' || (script === 'bankmatching' && type === 'receipts')) {
    return { kind: 'receipts', match: script === 'bankmatching' ? 'unmatched' : 'all' };
  }

  return { kind: 'all', match: 'all' };
}

function titleFromSource(sourceSlug: string, sourceCaption: string, mode: GlMode): { title: string; description: string } {
  const key = normalizeSlugKey(sourceSlug);
  const caption = sourceCaption.trim();

  if (caption !== '') {
    return {
      title: caption,
      description:
        mode === 'reports'
          ? 'Live GL inquiry data aligned to this webERP report action'
          : mode === 'banking'
            ? 'Live bank and ledger data aligned to this webERP banking action'
            : mode === 'permissions'
              ? 'Live account authorization data aligned to this webERP maintenance action'
              : 'Live general ledger data aligned to this webERP action',
    };
  }

  if (key.includes('glbudgets')) {
    return {
      title: 'GL Budgets',
      description: 'Review budgets versus actuals by account and period',
    };
  }

  if (key.includes('gltags') || key.includes('gltagprofitloss')) {
    return {
      title: 'GL Tags',
      description: 'Maintain tags and review tagged general ledger activity',
    };
  }

  if (
    key.includes('glaccountusers') ||
    key.includes('userglaccounts') ||
    key.includes('bankaccountusers') ||
    key.includes('userbankaccounts')
  ) {
    return {
      title: 'GL Authorisations',
      description: 'Review user access for GL and bank accounts',
    };
  }

  if (mode === 'reports') {
    return {
      title: 'GL Inquiries & Reports',
      description: 'Trial balance, cash flow and tax summaries from live ledger data',
    };
  }

  if (mode === 'banking') {
    return {
      title: 'Banking Ledger',
      description: 'Bank accounts, reconciliation-ready transactions and payment/receipt activity',
    };
  }

  return {
    title: 'General Ledger',
    description: 'View and manage journal entries with live account data',
  };
}

function formatMoney(value: number, settings: GlSettings): string {
  const decimals = Math.max(0, Number(settings.currencyDecimalPlaces ?? 2));
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: settings.currencyCode || 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${settings.currencyCode || 'USD'} ${value.toFixed(decimals)}`;
  }
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escape = (value: string | number) => {
    const raw = String(value ?? '');
    return `"${raw.replace(/"/g, '""')}"`;
  };

  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function GeneralLedger({ sourceSlug = '', sourceHref = '', sourceCaption = '' }: GeneralLedgerProps) {
  const mode = useMemo(() => modeFromSource(sourceSlug, sourceHref, sourceCaption), [sourceSlug, sourceHref, sourceCaption]);
  const header = useMemo(() => titleFromSource(sourceSlug, sourceCaption, mode), [sourceSlug, sourceCaption, mode]);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const [glSettings, setGlSettings] = useState<GlSettings>(DEFAULT_GL_SETTINGS);
  const [accountOptions, setAccountOptions] = useState<Array<{ code: string; label: string }>>([]);

  const [transactions, setTransactions] = useState<GlTransaction[]>([]);
  const [transactionSummary, setTransactionSummary] = useState<GlTransactionSummary | null>(null);
  const [transactionPagination, setTransactionPagination] = useState<GlTransactionsPagination | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'pending'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [entryDate, setEntryDate] = useState(todayIsoDate());
  const [entryNarrative, setEntryNarrative] = useState('');
  const [entryLines, setEntryLines] = useState<JournalLineForm[]>([
    { accountCode: '', debit: '', credit: '' },
    { accountCode: '', debit: '', credit: '' },
  ]);

  const [reportSearch, setReportSearch] = useState('');
  const [reportPeriod, setReportPeriod] = useState(0);
  const [reportIncludeZero, setReportIncludeZero] = useState(false);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportFocus, setReportFocus] = useState<ReportFocus>('trial');
  const [trialRows, setTrialRows] = useState<GlTrialBalanceRow[]>([]);
  const [trialSummary, setTrialSummary] = useState<GlTrialBalanceSummary | null>(null);
  const [trialLatestPeriod, setTrialLatestPeriod] = useState(0);
  const [financialRows, setFinancialRows] = useState<GlFinancialStatementRow[]>([]);
  const [financialSummary, setFinancialSummary] = useState<{
    accounts: number;
    totalDebits: number;
    totalCredits: number;
    net: number;
  } | null>(null);
  const [horizontalRows, setHorizontalRows] = useState<GlHorizontalAnalysisRow[]>([]);
  const [horizontalSummary, setHorizontalSummary] = useState<{
    accounts: number;
    currentTotal: number;
    previousTotal: number;
    changeTotal: number;
  } | null>(null);
  const [horizontalPreviousPeriod, setHorizontalPreviousPeriod] = useState(0);
  const [reportAccountCode, setReportAccountCode] = useState('all');
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(50);
  const [accountInquiryRows, setAccountInquiryRows] = useState<GlAccountInquiryRow[]>([]);
  const [accountInquirySummary, setAccountInquirySummary] = useState<{
    entries: number;
    debits: number;
    credits: number;
    net: number;
  } | null>(null);
  const [accountInquiryPagination, setAccountInquiryPagination] = useState<GlTransactionsPagination | null>(null);
  const [accountTrendRows, setAccountTrendRows] = useState<GlAccountTrendRow[]>([]);
  const [accountTrendName, setAccountTrendName] = useState('');
  const [trendPeriods, setTrendPeriods] = useState(12);
  const [accountListingRows, setAccountListingRows] = useState<GlAccount[]>([]);
  const [cashFlowRows, setCashFlowRows] = useState<GlCashFlowRow[]>([]);
  const [cashFlowSummary, setCashFlowSummary] = useState<{ totalInflow: number; totalOutflow: number; netCashFlow: number } | null>(null);
  const [taxRows, setTaxRows] = useState<GlTaxRow[]>([]);
  const [taxSummary, setTaxSummary] = useState<{ authorities: number; salesTaxTotal: number; purchaseTaxTotal: number } | null>(null);

  const [bankAccounts, setBankAccounts] = useState<GlBankAccount[]>([]);
  const [bankTotalBalance, setBankTotalBalance] = useState(0);
  const [bankTransactions, setBankTransactions] = useState<GlBankTransaction[]>([]);
  const [bankTransactionSummary, setBankTransactionSummary] = useState<{
    entries: number;
    totalPayments: number;
    totalReceipts: number;
    net: number;
  } | null>(null);
  const [bankPagination, setBankPagination] = useState<GlTransactionsPagination | null>(null);
  const [bankAccountFilter, setBankAccountFilter] = useState('all');
  const [bankMatchFilter, setBankMatchFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [bankKindFilter, setBankKindFilter] = useState<'all' | 'payments' | 'receipts'>('all');
  const [bankDateFrom, setBankDateFrom] = useState('');
  const [bankDateTo, setBankDateTo] = useState('');
  const [bankPage, setBankPage] = useState(1);
  const [bankPageSize, setBankPageSize] = useState(50);
  const [bankEntryDialogOpen, setBankEntryDialogOpen] = useState(false);
  const [savingBankEntry, setSavingBankEntry] = useState(false);
  const [bankEntryKind, setBankEntryKind] = useState<'payment' | 'receipt'>('payment');
  const [bankEntryDate, setBankEntryDate] = useState(todayIsoDate());
  const [bankEntryBankAccount, setBankEntryBankAccount] = useState('');
  const [bankEntryReference, setBankEntryReference] = useState('');
  const [bankEntryChequeNo, setBankEntryChequeNo] = useState('');
  const [bankEntryNarrative, setBankEntryNarrative] = useState('');
  const [bankEntryLines, setBankEntryLines] = useState<BankTransactionLineForm[]>([
    { accountCode: '', amount: '', narrative: '' },
  ]);
  const [bankImportDialogOpen, setBankImportDialogOpen] = useState(false);
  const [bankImportFile, setBankImportFile] = useState<File | null>(null);
  const [bankImportDefaultAccount, setBankImportDefaultAccount] = useState('');
  const [bankImportDefaultKind, setBankImportDefaultKind] = useState<'payment' | 'receipt'>('payment');
  const [importingBankCsv, setImportingBankCsv] = useState(false);
  const [bankAccountDialogOpen, setBankAccountDialogOpen] = useState(false);
  const [savingBankAccount, setSavingBankAccount] = useState(false);
  const [matchingBankTransId, setMatchingBankTransId] = useState<number | null>(null);
  const [editingBankAccountCode, setEditingBankAccountCode] = useState<string | null>(null);
  const [bankAccountForm, setBankAccountForm] = useState<BankAccountForm>({
    accountCode: '',
    currCode: '',
    invoiceMode: 0,
    bankAccountCode: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankAddress: '',
    importFormat: '',
  });

  const [budgetRows, setBudgetRows] = useState<GlBudgetRow[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<{ accounts: number; budget: number; actual: number; variance: number } | null>(null);
  const [budgetPeriod, setBudgetPeriod] = useState(0);
  const [budgetLatestPeriod, setBudgetLatestPeriod] = useState(0);
  const [budgetSearch, setBudgetSearch] = useState('');
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetFormAccountCode, setBudgetFormAccountCode] = useState('');
  const [budgetFormPeriod, setBudgetFormPeriod] = useState(0);
  const [budgetFormAmount, setBudgetFormAmount] = useState('');
  const [budgetFormBfwdAmount, setBudgetFormBfwdAmount] = useState('');

  const [tags, setTags] = useState<GlTagRow[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [tagDateFrom, setTagDateFrom] = useState('');
  const [tagDateTo, setTagDateTo] = useState('');
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [savingTag, setSavingTag] = useState(false);
  const [editingTagRef, setEditingTagRef] = useState<number | null>(null);
  const [tagDescription, setTagDescription] = useState('');

  const [permissionScope, setPermissionScope] = useState<'gl' | 'bank'>('gl');
  const [permissions, setPermissions] = useState<GlAccountUserPermission[]>([]);
  const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);
  const [savingPermission, setSavingPermission] = useState(false);
  const [permissionFormUserId, setPermissionFormUserId] = useState('');
  const [permissionFormAccountCode, setPermissionFormAccountCode] = useState('');
  const [permissionFormCanView, setPermissionFormCanView] = useState(true);
  const [permissionFormCanUpdate, setPermissionFormCanUpdate] = useState(false);
  const [deletingPermissionKey, setDeletingPermissionKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (mode !== 'reports') return;
    setReportPage(1);
  }, [mode, reportFocus, reportSearch, reportAccountCode, reportDateFrom, reportDateTo]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    const focus = reportFocusFromSource(sourceSlug, sourceHref, sourceCaption);
    setReportFocus(focus);

    if (mode === 'banking') {
      const defaults = bankDefaultsFromSource(sourceHref);
      setBankKindFilter(defaults.kind);
      setBankMatchFilter(defaults.match);
      setBankPage(1);
    }

    if (mode === 'permissions') {
      const key = normalizeSlugKey(`${sourceSlug}-${sourceCaption}-${sourceHref}`);
      if (key.includes('bankaccountusers') || key.includes('userbankaccounts')) {
        setPermissionScope('bank');
      } else {
        setPermissionScope('gl');
      }
    }
  }, [mode, sourceSlug, sourceHref, sourceCaption]);

  useEffect(() => {
    if (mode !== 'reports') return;
    if (reportFocus === 'account-trend' && reportAccountCode === 'all' && accountOptions.length > 0) {
      setReportAccountCode(accountOptions[0].code);
    }
  }, [mode, reportFocus, reportAccountCode, accountOptions]);

  useEffect(() => {
    let active = true;

    const loadContextData = async () => {
      try {
        const [{ rows }, settings] = await Promise.all([fetchGlAccounts({ limit: 2000 }), fetchGlSettings()]);
        if (!active) return;

        const options = rows
          .map((account) => ({
            code: account.accountCode,
            label: `${account.accountCode} - ${account.accountName}`,
          }))
          .sort((a, b) => a.code.localeCompare(b.code));

        setGlSettings(settings);
        setAccountOptions(options);
        setBankAccountForm((previous) => ({
          ...previous,
          currCode: previous.currCode || settings.currencyCode || 'USD',
        }));
        setEntryLines((previous) =>
          previous.map((line) => ({
            ...line,
            accountCode: line.accountCode || options[0]?.code || '',
          }))
        );
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load GL settings.');
      }
    };

    void loadContextData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'transactions') return;

    let active = true;
    setLoading(true);
    setErrorMessage('');

    const loadTransactions = async () => {
      try {
        const { rows, summary, pagination } = await fetchGlTransactions({
          q: debouncedSearch,
          account: selectedAccount === 'all' ? undefined : selectedAccount,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          status: statusFilter,
          page,
          limit: pageSize,
        });

        if (!active) return;
        setTransactions(rows);
        setTransactionSummary(summary);
        setTransactionPagination(pagination);
      } catch (error) {
        if (!active) return;
        setTransactions([]);
        setTransactionSummary(null);
        setTransactionPagination(null);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load general ledger transactions.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTransactions();

    return () => {
      active = false;
    };
  }, [mode, debouncedSearch, selectedAccount, dateFrom, dateTo, statusFilter, page, pageSize, refreshKey]);

  useEffect(() => {
    if (mode !== 'reports') return;

    let active = true;
    setLoading(true);
    setErrorMessage('');

    const loadReports = async () => {
      try {
        if (reportFocus === 'trial') {
          const trial = await fetchGlTrialBalance({
            period: reportPeriod > 0 ? reportPeriod : undefined,
            q: reportSearch || undefined,
            includeZero: reportIncludeZero,
            limit: 4000,
          });
          if (!active) return;
          setTrialRows(trial.rows);
          setTrialSummary(trial.summary);
          setTrialLatestPeriod(trial.latestPeriod);
          if (reportPeriod === 0 && trial.period > 0) {
            setReportPeriod(trial.period);
          }
          return;
        }

        if (reportFocus === 'balance-sheet' || reportFocus === 'profit-loss') {
          const statement = await fetchGlFinancialStatement({
            type: reportFocus === 'profit-loss' ? 'profit-loss' : 'balance-sheet',
            period: reportPeriod > 0 ? reportPeriod : undefined,
            limit: 5000,
          });
          if (!active) return;
          setFinancialRows(statement.rows);
          setFinancialSummary(statement.summary);
          setTrialLatestPeriod(statement.latestPeriod);
          if (reportPeriod === 0 && statement.period > 0) {
            setReportPeriod(statement.period);
          }
          return;
        }

        if (reportFocus === 'horizontal-position' || reportFocus === 'horizontal-income') {
          const analysis = await fetchGlHorizontalAnalysis({
            statement: reportFocus === 'horizontal-income' ? 'income' : 'position',
            period: reportPeriod > 0 ? reportPeriod : undefined,
            limit: 5000,
          });
          if (!active) return;
          setHorizontalRows(analysis.rows);
          setHorizontalSummary(analysis.summary);
          setHorizontalPreviousPeriod(analysis.previousPeriod);
          setTrialLatestPeriod(analysis.currentPeriod);
          if (reportPeriod === 0 && analysis.currentPeriod > 0) {
            setReportPeriod(analysis.currentPeriod);
          }
          return;
        }

        if (reportFocus === 'cash') {
          const cash = await fetchGlCashFlowReport({
            dateFrom: reportDateFrom || undefined,
            dateTo: reportDateTo || undefined,
          });
          if (!active) return;
          setCashFlowRows(cash.rows);
          setCashFlowSummary(cash.summary);
          return;
        }

        if (reportFocus === 'tax') {
          const tax = await fetchGlTaxReport({
            dateFrom: reportDateFrom || undefined,
            dateTo: reportDateTo || undefined,
          });
          if (!active) return;
          setTaxRows(tax.rows);
          setTaxSummary(tax.summary);
          return;
        }

        if (reportFocus === 'account-inquiry') {
          const inquiry = await fetchGlAccountInquiry({
            accountCode: reportAccountCode === 'all' ? undefined : reportAccountCode,
            dateFrom: reportDateFrom || undefined,
            dateTo: reportDateTo || undefined,
            q: reportSearch || undefined,
            page: reportPage,
            limit: reportPageSize,
          });
          if (!active) return;
          setAccountInquiryRows(inquiry.rows);
          setAccountInquirySummary(inquiry.summary);
          setAccountInquiryPagination(inquiry.pagination);
          return;
        }

        if (reportFocus === 'account-trend') {
          if (reportAccountCode === 'all') {
            if (!active) return;
            setAccountTrendRows([]);
            setAccountTrendName('');
            return;
          }
          const trend = await fetchGlAccountTrend({
            accountCode: reportAccountCode,
            periods: trendPeriods,
          });
          if (!active) return;
          setAccountTrendRows(trend.rows);
          setAccountTrendName(trend.accountName);
          return;
        }

        const accounts = await fetchGlAccounts({
          q: reportSearch || undefined,
          limit: 5000,
        });
        if (!active) return;
        setAccountListingRows(accounts.rows);
      } catch (error) {
        if (!active) return;
        setTrialRows([]);
        setTrialSummary(null);
        setFinancialRows([]);
        setFinancialSummary(null);
        setHorizontalRows([]);
        setHorizontalSummary(null);
        setHorizontalPreviousPeriod(0);
        setCashFlowRows([]);
        setCashFlowSummary(null);
        setTaxRows([]);
        setTaxSummary(null);
        setAccountInquiryRows([]);
        setAccountInquirySummary(null);
        setAccountInquiryPagination(null);
        setAccountTrendRows([]);
        setAccountTrendName('');
        setAccountListingRows([]);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load GL reports.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadReports();

    return () => {
      active = false;
    };
  }, [
    mode,
    reportFocus,
    reportSearch,
    reportPeriod,
    reportIncludeZero,
    reportDateFrom,
    reportDateTo,
    reportAccountCode,
    reportPage,
    reportPageSize,
    trendPeriods,
    refreshKey,
  ]);

  useEffect(() => {
    if (mode !== 'banking') return;

    let active = true;
    setLoading(true);
    setErrorMessage('');

    const loadBanking = async () => {
      try {
        const [accountsResult, transactionsResult] = await Promise.all([
          fetchGlBankAccounts(),
          fetchGlBankTransactions({
            accountCode: bankAccountFilter === 'all' ? undefined : bankAccountFilter,
            matchStatus: bankMatchFilter,
            kind: bankKindFilter,
            dateFrom: bankDateFrom || undefined,
            dateTo: bankDateTo || undefined,
            page: bankPage,
            limit: bankPageSize,
          }),
        ]);

        if (!active) return;
        setBankAccounts(accountsResult.rows);
        setBankTotalBalance(accountsResult.totalBalance);
        setBankTransactions(transactionsResult.rows);
        setBankTransactionSummary(transactionsResult.summary);
        setBankPagination(transactionsResult.pagination);
      } catch (error) {
        if (!active) return;
        setBankAccounts([]);
        setBankTransactions([]);
        setBankTransactionSummary(null);
        setBankPagination(null);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load banking ledger data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadBanking();

    return () => {
      active = false;
    };
  }, [
    mode,
    bankAccountFilter,
    bankMatchFilter,
    bankKindFilter,
    bankDateFrom,
    bankDateTo,
    bankPage,
    bankPageSize,
    refreshKey,
  ]);

  useEffect(() => {
    if (mode !== 'budgets') return;

    let active = true;
    setLoading(true);
    setErrorMessage('');

    const loadBudgets = async () => {
      try {
        const response = await fetchGlBudgets({
          period: budgetPeriod > 0 ? budgetPeriod : undefined,
          q: budgetSearch || undefined,
          limit: 4000,
        });

        if (!active) return;
        setBudgetRows(response.rows);
        setBudgetSummary(response.summary);
        setBudgetLatestPeriod(response.latestPeriod);
        if (budgetPeriod === 0 && response.period > 0) {
          setBudgetPeriod(response.period);
        }
      } catch (error) {
        if (!active) return;
        setBudgetRows([]);
        setBudgetSummary(null);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load budget data.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadBudgets();

    return () => {
      active = false;
    };
  }, [mode, budgetPeriod, budgetSearch, refreshKey]);

  useEffect(() => {
    if (bankAccounts.length === 0) return;
    setBankEntryBankAccount((previous) => previous || bankAccounts[0].accountCode);
    setBankImportDefaultAccount((previous) => previous || bankAccounts[0].accountCode);
  }, [bankAccounts]);

  useEffect(() => {
    if (permissionScope === 'bank') {
      setPermissionFormAccountCode((previous) => previous || bankAccounts[0]?.accountCode || '');
      return;
    }
    setPermissionFormAccountCode((previous) => previous || accountOptions[0]?.code || '');
  }, [permissionScope, bankAccounts, accountOptions]);

  useEffect(() => {
    if (mode !== 'tags') return;

    let active = true;
    setLoading(true);
    setErrorMessage('');

    const loadTags = async () => {
      try {
        const rows = await fetchGlTags({
          q: tagSearch || undefined,
          dateFrom: tagDateFrom || undefined,
          dateTo: tagDateTo || undefined,
        });
        if (!active) return;
        setTags(rows);
      } catch (error) {
        if (!active) return;
        setTags([]);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load GL tags.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTags();

    return () => {
      active = false;
    };
  }, [mode, tagSearch, tagDateFrom, tagDateTo, refreshKey]);

  useEffect(() => {
    if (mode !== 'permissions') return;

    let active = true;
    setLoading(true);
    setErrorMessage('');

    const loadPermissions = async () => {
      try {
        const [rows, bankResult] = await Promise.all([
          fetchGlAccountUsers(permissionScope),
          permissionScope === 'bank' ? fetchGlBankAccounts() : Promise.resolve<{ rows: GlBankAccount[]; totalBalance: number }>({ rows: [], totalBalance: 0 }),
        ]);
        if (!active) return;
        setPermissions(rows);
        if (permissionScope === 'bank') {
          setBankAccounts(bankResult.rows);
        }
      } catch (error) {
        if (!active) return;
        setPermissions([]);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load account authorisations.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadPermissions();

    return () => {
      active = false;
    };
  }, [mode, permissionScope, refreshKey]);

  useEffect(() => {
    if (!transactionPagination) return;
    if (transactionPagination.totalPages < 1) return;
    if (page > transactionPagination.totalPages) {
      setPage(transactionPagination.totalPages);
    }
  }, [transactionPagination, page]);

  useEffect(() => {
    if (!bankPagination) return;
    if (bankPagination.totalPages < 1) return;
    if (bankPage > bankPagination.totalPages) {
      setBankPage(bankPagination.totalPages);
    }
  }, [bankPagination, bankPage]);

  useEffect(() => {
    if (!accountInquiryPagination) return;
    if (accountInquiryPagination.totalPages < 1) return;
    if (reportPage > accountInquiryPagination.totalPages) {
      setReportPage(accountInquiryPagination.totalPages);
    }
  }, [accountInquiryPagination, reportPage]);

  const calculatedTransactionSummary = useMemo<GlTransactionSummary>(() => {
    if (transactionSummary) return transactionSummary;

    const total = transactions.reduce((sum, row) => sum + row.amount, 0);
    const postedEntries = transactions.filter((row) => row.status === 'Posted').length;

    return {
      entries: transactions.length,
      postedEntries,
      pendingEntries: transactions.length - postedEntries,
      totalDebits: total,
      totalCredits: total,
      balance: 0,
    };
  }, [transactionSummary, transactions]);

  const effectiveTransactionPagination = useMemo<GlTransactionsPagination>(() => {
    if (transactionPagination) return transactionPagination;
    const total = transactions.length;
    return {
      page,
      limit: pageSize,
      total,
      totalPages: total > 0 ? 1 : 0,
      hasMore: false,
    };
  }, [transactionPagination, transactions.length, page, pageSize]);

  const periodOptions = useMemo(() => {
    const latest = Math.max(trialLatestPeriod, reportPeriod, 0);
    if (latest <= 0) return [] as number[];
    const count = Math.min(18, latest);
    return Array.from({ length: count }, (_, index) => latest - index).filter((value) => value > 0);
  }, [trialLatestPeriod, reportPeriod]);

  const budgetPeriodOptions = useMemo(() => {
    const latest = Math.max(budgetLatestPeriod, budgetPeriod, 0);
    if (latest <= 0) return [] as number[];
    const count = Math.min(18, latest);
    return Array.from({ length: count }, (_, index) => latest - index).filter((value) => value > 0);
  }, [budgetLatestPeriod, budgetPeriod]);

  const resetEntryForm = () => {
    setEntryDate(todayIsoDate());
    setEntryNarrative('');
    setEntryLines([
      { accountCode: accountOptions[0]?.code ?? '', debit: '', credit: '' },
      { accountCode: accountOptions[0]?.code ?? '', debit: '', credit: '' },
    ]);
  };

  const openNewEntry = () => {
    setErrorMessage('');
    resetEntryForm();
    setEntryDialogOpen(true);
  };

  const addEntryLine = () => {
    setEntryLines((previous) => [...previous, { accountCode: accountOptions[0]?.code ?? '', debit: '', credit: '' }]);
  };

  const removeEntryLine = (index: number) => {
    setEntryLines((previous) => previous.filter((_, idx) => idx !== index));
  };

  const updateEntryLine = (index: number, patch: Partial<JournalLineForm>) => {
    setEntryLines((previous) => previous.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  };

  const onSaveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (entryLines.length < 2) {
      setErrorMessage('A journal entry requires at least two lines.');
      return;
    }

    const payloadLines: GlJournalLineInput[] = [];
    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of entryLines) {
      const accountCode = line.accountCode.trim();
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      if (!accountCode) {
        setErrorMessage('Each journal line must include an account code.');
        return;
      }

      if (debit > 0 && credit > 0) {
        setErrorMessage('Each line can have a debit or a credit, not both.');
        return;
      }

      if (debit <= 0 && credit <= 0) {
        setErrorMessage('Each line must have a positive debit or credit amount.');
        return;
      }

      payloadLines.push({ accountCode, debit: Math.max(debit, 0), credit: Math.max(credit, 0) });
      totalDebits += Math.max(debit, 0);
      totalCredits += Math.max(credit, 0);
    }

    if (Math.abs(totalDebits - totalCredits) > 0.00001) {
      setErrorMessage('Journal entry is not balanced. Debits and credits must match.');
      return;
    }

    try {
      setSavingEntry(true);
      setErrorMessage('');

      await createGlJournalEntry({
        tranDate: entryDate,
        narrative: entryNarrative.trim(),
        lines: payloadLines,
      });

      setEntryDialogOpen(false);
      setSuccessMessage('Journal entry posted successfully.');
      setPage(1);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to post journal entry.');
    } finally {
      setSavingEntry(false);
    }
  };

  const resetBankEntryForm = (kind: 'payment' | 'receipt') => {
    setBankEntryKind(kind);
    setBankEntryDate(todayIsoDate());
    setBankEntryReference('');
    setBankEntryChequeNo('');
    setBankEntryNarrative('');
    setBankEntryBankAccount(bankAccounts[0]?.accountCode ?? '');
    setBankEntryLines([{ accountCode: accountOptions[0]?.code ?? '', amount: '', narrative: '' }]);
  };

  const openBankEntry = (kind: 'payment' | 'receipt') => {
    setErrorMessage('');
    resetBankEntryForm(kind);
    setBankEntryDialogOpen(true);
  };

  const updateBankEntryLine = (index: number, patch: Partial<BankTransactionLineForm>) => {
    setBankEntryLines((previous) => previous.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  };

  const addBankEntryLine = () => {
    setBankEntryLines((previous) => [...previous, { accountCode: accountOptions[0]?.code ?? '', amount: '', narrative: '' }]);
  };

  const removeBankEntryLine = (index: number) => {
    setBankEntryLines((previous) => previous.filter((_, idx) => idx !== index));
  };

  const onSaveBankEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!bankEntryBankAccount) {
      setErrorMessage('Bank account is required.');
      return;
    }
    if (bankEntryLines.length === 0) {
      setErrorMessage('At least one GL analysis line is required.');
      return;
    }

    const payloadLines: GlBankTransactionCreatePayload['lines'] = [];
    for (const line of bankEntryLines) {
      const accountCode = line.accountCode.trim();
      const amount = Number(line.amount || 0);
      if (!accountCode) {
        setErrorMessage('Each bank line requires an account code.');
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        setErrorMessage('Each bank line requires a positive amount.');
        return;
      }
      payloadLines.push({
        accountCode,
        amount,
        narrative: line.narrative.trim() || undefined,
      });
    }

    try {
      setSavingBankEntry(true);
      setErrorMessage('');
      await createGlBankTransaction({
        kind: bankEntryKind,
        bankAccountCode: bankEntryBankAccount,
        tranDate: bankEntryDate,
        reference: bankEntryReference.trim() || undefined,
        chequeNo: bankEntryChequeNo.trim() || undefined,
        narrative: bankEntryNarrative.trim() || undefined,
        lines: payloadLines,
      });

      setBankEntryDialogOpen(false);
      setSuccessMessage(`${bankEntryKind === 'payment' ? 'Payment' : 'Receipt'} posted successfully.`);
      setBankPage(1);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to post bank transaction.');
    } finally {
      setSavingBankEntry(false);
    }
  };

  const openBankImport = () => {
    setErrorMessage('');
    setBankImportFile(null);
    setBankImportDefaultAccount(bankAccounts[0]?.accountCode ?? '');
    setBankImportDefaultKind('payment');
    setBankImportDialogOpen(true);
  };

  const onImportBankCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bankImportFile) {
      setErrorMessage('Please choose a CSV file to import.');
      return;
    }

    try {
      setImportingBankCsv(true);
      setErrorMessage('');
      const result = await importGlBankTransactionsCsv(bankImportFile, {
        bankAccountCode: bankImportDefaultAccount || undefined,
        defaultKind: bankImportDefaultKind,
      });

      setBankImportDialogOpen(false);
      const errorSummary = result.errors.slice(0, 3).join(' | ');
      setSuccessMessage(
        `Import completed. Imported ${result.imported}, skipped ${result.skipped}.${errorSummary ? ` ${errorSummary}` : ''}`
      );
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import bank transactions CSV.');
    } finally {
      setImportingBankCsv(false);
    }
  };

  const openCreateBankAccount = () => {
    setErrorMessage('');
    setEditingBankAccountCode(null);
    setBankAccountForm({
      accountCode: '',
      currCode: glSettings.currencyCode || 'USD',
      invoiceMode: 0,
      bankAccountCode: '',
      bankAccountName: '',
      bankAccountNumber: '',
      bankAddress: '',
      importFormat: '',
    });
    setBankAccountDialogOpen(true);
  };

  const openEditBankAccount = (account: GlBankAccount) => {
    setErrorMessage('');
    setEditingBankAccountCode(account.accountCode);
    setBankAccountForm({
      accountCode: account.accountCode,
      currCode: account.currencyCode || glSettings.currencyCode || 'USD',
      invoiceMode: account.invoiceMode,
      bankAccountCode: account.bankAccountCode || '',
      bankAccountName: account.bankAccountName || account.accountName || '',
      bankAccountNumber: account.bankAccountNumber || '',
      bankAddress: account.bankAddress || '',
      importFormat: account.importFormat || '',
    });
    setBankAccountDialogOpen(true);
  };

  const onSaveBankAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload: GlBankAccountPayload = {
      accountCode: bankAccountForm.accountCode.trim(),
      currCode: bankAccountForm.currCode.trim().toUpperCase(),
      invoiceMode: Number(bankAccountForm.invoiceMode),
      bankAccountCode: bankAccountForm.bankAccountCode.trim() || undefined,
      bankAccountName: bankAccountForm.bankAccountName.trim(),
      bankAccountNumber: bankAccountForm.bankAccountNumber.trim() || undefined,
      bankAddress: bankAccountForm.bankAddress.trim() || undefined,
      importFormat: bankAccountForm.importFormat.trim() || undefined,
    };

    if (!payload.accountCode) {
      setErrorMessage('GL account code is required.');
      return;
    }
    if (!payload.currCode) {
      setErrorMessage('Currency code is required.');
      return;
    }
    if (!payload.bankAccountName) {
      setErrorMessage('Bank account name is required.');
      return;
    }

    try {
      setSavingBankAccount(true);
      setErrorMessage('');

      if (editingBankAccountCode) {
        await updateGlBankAccount(editingBankAccountCode, {
          currCode: payload.currCode,
          invoiceMode: payload.invoiceMode,
          bankAccountCode: payload.bankAccountCode,
          bankAccountName: payload.bankAccountName,
          bankAccountNumber: payload.bankAccountNumber,
          bankAddress: payload.bankAddress,
          importFormat: payload.importFormat,
        });
        setSuccessMessage('Bank account updated.');
      } else {
        await createGlBankAccount(payload);
        setSuccessMessage('Bank account created.');
      }

      setBankAccountDialogOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save bank account.');
    } finally {
      setSavingBankAccount(false);
    }
  };

  const onDeleteBankAccount = async (account: GlBankAccount) => {
    const confirmed = window.confirm(`Delete bank account ${account.accountCode} - ${account.bankAccountName || account.accountName}?`);
    if (!confirmed) return;

    try {
      await deleteGlBankAccount(account.accountCode);
      setSuccessMessage('Bank account deleted.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete bank account.');
    }
  };

  const onToggleMatchBankTransaction = async (row: GlBankTransaction) => {
    try {
      setMatchingBankTransId(row.id);
      setErrorMessage('');
      if (row.status === 'Matched') {
        await unmatchGlBankTransaction(row.id);
        setSuccessMessage(`Transaction ${row.reference} unmatched.`);
      } else {
        await matchGlBankTransaction(row.id);
        setSuccessMessage(`Transaction ${row.reference} matched.`);
      }
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update bank transaction match status.');
    } finally {
      setMatchingBankTransId(null);
    }
  };

  const openCreateBudget = () => {
    setErrorMessage('');
    setBudgetFormAccountCode(accountOptions[0]?.code || '');
    setBudgetFormPeriod(budgetPeriod > 0 ? budgetPeriod : Math.max(budgetLatestPeriod, 1));
    setBudgetFormAmount('');
    setBudgetFormBfwdAmount('');
    setBudgetDialogOpen(true);
  };

  const openEditBudget = (row: GlBudgetRow) => {
    setErrorMessage('');
    setBudgetFormAccountCode(row.accountCode);
    setBudgetFormPeriod(row.period);
    setBudgetFormAmount(String(row.budget));
    setBudgetFormBfwdAmount(String(row.bfwdBudget));
    setBudgetDialogOpen(true);
  };

  const onSaveBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const accountCode = budgetFormAccountCode.trim();
    const period = Number(budgetFormPeriod);
    const budgetAmount = Number(budgetFormAmount);
    const bfwdBudget = budgetFormBfwdAmount.trim() === '' ? undefined : Number(budgetFormBfwdAmount);

    if (!accountCode) {
      setErrorMessage('Account code is required.');
      return;
    }
    if (!Number.isFinite(period) || period <= 0) {
      setErrorMessage('A valid period number is required.');
      return;
    }
    if (!Number.isFinite(budgetAmount)) {
      setErrorMessage('Budget amount must be numeric.');
      return;
    }
    if (bfwdBudget !== undefined && !Number.isFinite(bfwdBudget)) {
      setErrorMessage('B/F budget amount must be numeric.');
      return;
    }

    try {
      setSavingBudget(true);
      setErrorMessage('');
      await upsertGlBudget({
        accountCode,
        period,
        budget: budgetAmount,
        bfwdBudget,
      });
      setBudgetDialogOpen(false);
      setSuccessMessage('Budget saved.');
      setBudgetPeriod(period);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save budget.');
    } finally {
      setSavingBudget(false);
    }
  };

  const openCreatePermission = () => {
    setErrorMessage('');
    setPermissionFormUserId('');
    setPermissionFormAccountCode(permissionScope === 'bank' ? bankAccounts[0]?.accountCode || '' : accountOptions[0]?.code || '');
    setPermissionFormCanView(true);
    setPermissionFormCanUpdate(false);
    setPermissionDialogOpen(true);
  };

  const onSavePermission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const userId = permissionFormUserId.trim();
    const accountCode = permissionFormAccountCode.trim();
    if (!userId) {
      setErrorMessage('User ID is required.');
      return;
    }
    if (!accountCode) {
      setErrorMessage('Account code is required.');
      return;
    }

    try {
      setSavingPermission(true);
      setErrorMessage('');
      await upsertGlAccountUser({
        scope: permissionScope,
        userId,
        accountCode,
        canView: permissionScope === 'bank' ? true : permissionFormCanView,
        canUpdate: permissionScope === 'bank' ? true : permissionFormCanUpdate,
      });
      setPermissionDialogOpen(false);
      setSuccessMessage('Authorisation saved.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save authorisation.');
    } finally {
      setSavingPermission(false);
    }
  };

  const onTogglePermissionUpdate = async (row: GlAccountUserPermission) => {
    if (row.scope !== 'gl') return;
    try {
      setSavingPermission(true);
      setErrorMessage('');
      await upsertGlAccountUser({
        scope: row.scope,
        userId: row.userId,
        accountCode: row.accountCode,
        canView: row.canView,
        canUpdate: !row.canUpdate,
      });
      setSuccessMessage(`Update access ${row.canUpdate ? 'removed' : 'granted'} for ${row.userId}.`);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update authorisation.');
    } finally {
      setSavingPermission(false);
    }
  };

  const onDeletePermission = async (row: GlAccountUserPermission) => {
    const key = `${row.scope}|${row.userId}|${row.accountCode}`;
    const confirmed = window.confirm(`Remove ${row.scope.toUpperCase()} authorisation for user ${row.userId} on account ${row.accountCode}?`);
    if (!confirmed) return;

    try {
      setDeletingPermissionKey(key);
      setErrorMessage('');
      await deleteGlAccountUser({
        scope: row.scope,
        userId: row.userId,
        accountCode: row.accountCode,
      });
      setSuccessMessage('Authorisation removed.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to remove authorisation.');
    } finally {
      setDeletingPermissionKey(null);
    }
  };

  const openCreateTag = () => {
    setTagDialogOpen(true);
    setEditingTagRef(null);
    setTagDescription('');
    setErrorMessage('');
  };

  const openEditTag = (tag: GlTagRow) => {
    setTagDialogOpen(true);
    setEditingTagRef(tag.tagRef);
    setTagDescription(tag.tagDescription);
    setErrorMessage('');
  };

  const onSaveTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tagDescription.trim()) {
      setErrorMessage('Tag description is required.');
      return;
    }

    try {
      setSavingTag(true);
      setErrorMessage('');

      if (editingTagRef === null) {
        await createGlTag(tagDescription.trim());
        setSuccessMessage('GL tag created.');
      } else {
        await updateGlTag(editingTagRef, tagDescription.trim());
        setSuccessMessage('GL tag updated.');
      }

      setTagDialogOpen(false);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save GL tag.');
    } finally {
      setSavingTag(false);
    }
  };

  const onDeleteTag = async (tag: GlTagRow) => {
    const confirmed = window.confirm(`Delete tag ${tag.tagRef} - ${tag.tagDescription}?`);
    if (!confirmed) return;

    try {
      await deleteGlTag(tag.tagRef);
      setSuccessMessage('GL tag deleted.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete GL tag.');
    }
  };

  const refreshCurrentMode = () => {
    setRefreshKey((value) => value + 1);
  };

  const exportCurrentMode = () => {
    const today = new Date().toISOString().slice(0, 10);

    if (mode === 'transactions') {
      if (transactions.length === 0) return;
      downloadCsv(
        `general-ledger-transactions-${today}.csv`,
        ['Date', 'Reference', 'Description', 'Debit Account', 'Credit Account', 'Amount', 'Status'],
        transactions.map((row) => [row.date, row.reference, row.description, row.debitAccount, row.creditAccount, row.amount, row.status])
      );
      return;
    }

    if (mode === 'reports') {
      if (reportFocus === 'trial') {
        if (trialRows.length === 0) return;
        downloadCsv(
          `general-ledger-trial-balance-${today}.csv`,
          ['Account Code', 'Account Name', 'Group', 'Section', 'Debit', 'Credit', 'Balance', 'Budget', 'Variance'],
          trialRows.map((row) => [
            row.accountCode,
            row.accountName,
            row.groupName,
            row.sectionName,
            row.debit,
            row.credit,
            row.balance,
            row.budget,
            row.variance,
          ])
        );
        return;
      }

      if (reportFocus === 'balance-sheet' || reportFocus === 'profit-loss') {
        if (financialRows.length === 0) return;
        const reportSlug = reportFocus === 'profit-loss' ? 'profit-loss' : 'balance-sheet';
        downloadCsv(
          `general-ledger-${reportSlug}-${today}.csv`,
          ['Account Code', 'Account Name', 'Group', 'Section', 'Debit', 'Credit', 'Balance'],
          financialRows.map((row) => [
            row.accountCode,
            row.accountName,
            row.groupName,
            row.sectionName,
            row.debit,
            row.credit,
            row.balance,
          ])
        );
        return;
      }

      if (reportFocus === 'horizontal-position' || reportFocus === 'horizontal-income') {
        if (horizontalRows.length === 0) return;
        const reportSlug = reportFocus === 'horizontal-income' ? 'horizontal-income' : 'horizontal-position';
        downloadCsv(
          `general-ledger-${reportSlug}-${today}.csv`,
          ['Account Code', 'Account Name', 'Group', 'Section', 'Current', 'Previous', 'Change', 'Change %'],
          horizontalRows.map((row) => [
            row.accountCode,
            row.accountName,
            row.groupName,
            row.sectionName,
            row.currentBalance,
            row.previousBalance,
            row.change,
            row.changePct ?? '',
          ])
        );
        return;
      }

      if (reportFocus === 'cash') {
        if (cashFlowRows.length === 0) return;
        downloadCsv(
          `general-ledger-cash-flow-${today}.csv`,
          ['Activity', 'Inflow', 'Outflow', 'Net'],
          cashFlowRows.map((row) => [row.activityName, row.inflow, row.outflow, row.net])
        );
        return;
      }

      if (reportFocus === 'tax') {
        if (taxRows.length === 0) return;
        downloadCsv(
          `general-ledger-tax-report-${today}.csv`,
          ['Tax Authority', 'Sales Tax Account', 'Purchase Tax Account', 'Sales Tax', 'Purchase Tax', 'Net Tax'],
          taxRows.map((row) => [
            row.description,
            `${row.salesTaxAccountCode} - ${row.salesTaxAccountName}`,
            `${row.purchaseTaxAccountCode} - ${row.purchaseTaxAccountName}`,
            row.salesTaxTotal,
            row.purchaseTaxTotal,
            row.netTax,
          ])
        );
        return;
      }

      if (reportFocus === 'account-inquiry') {
        if (accountInquiryRows.length === 0) return;
        downloadCsv(
          `general-ledger-account-inquiry-${today}.csv`,
          ['Date', 'Period', 'Account', 'Reference', 'Narrative', 'Debit', 'Credit', 'Status'],
          accountInquiryRows.map((row) => [
            row.date,
            row.periodNo,
            `${row.accountCode} - ${row.accountName}`,
            row.reference,
            row.narrative,
            row.debit,
            row.credit,
            row.status,
          ])
        );
        return;
      }

      if (reportFocus === 'account-trend') {
        if (accountTrendRows.length === 0) return;
        downloadCsv(
          `general-ledger-account-trend-${today}.csv`,
          ['Period', 'Period End Date', 'Balance'],
          accountTrendRows.map((row) => [row.period, row.periodEndDate, row.balance])
        );
        return;
      }

      if (accountListingRows.length === 0) return;
      downloadCsv(
        `general-ledger-account-listing-${today}.csv`,
        ['Account', 'Account Name', 'Group', 'Section', 'Type', 'Balance'],
        accountListingRows.map((row) => [
          row.accountCode,
          row.accountName,
          row.groupName,
          row.sectionName,
          row.accountTypeLabel,
          row.balance,
        ])
      );
      return;
    }

    if (mode === 'banking') {
      if (bankTransactions.length === 0) return;
      downloadCsv(
        `general-ledger-bank-transactions-${today}.csv`,
        ['Date', 'Reference', 'Account', 'Direction', 'Amount', 'Cleared', 'Status'],
        bankTransactions.map((row) => [
          row.date,
          row.reference,
          `${row.bankAccountCode} - ${row.bankAccountName}`,
          row.direction,
          row.amount,
          row.amountCleared,
          row.status,
        ])
      );
      return;
    }

    if (mode === 'budgets') {
      if (budgetRows.length === 0) return;
      downloadCsv(
        `general-ledger-budgets-${today}.csv`,
        ['Period', 'Account', 'Account Name', 'Group', 'Budget', 'Actual', 'Variance'],
        budgetRows.map((row) => [row.period, row.accountCode, row.accountName, row.groupName, row.budget, row.actual, row.variance])
      );
      return;
    }

    if (mode === 'tags') {
      if (tags.length === 0) return;
      downloadCsv(
        `general-ledger-tags-${today}.csv`,
        ['Tag Ref', 'Tag Description', 'Transactions', 'Debits', 'Credits', 'Balance'],
        tags.map((row) => [row.tagRef, row.tagDescription, row.transactionCount, row.totalDebits, row.totalCredits, row.balance])
      );
      return;
    }

    if (permissions.length === 0) return;
    downloadCsv(
      `general-ledger-authorisations-${today}.csv`,
      ['Scope', 'User ID', 'User Name', 'Email', 'Account Code', 'Account Name', 'Can View', 'Can Update'],
      permissions.map((row) => [row.scope, row.userId, row.userName, row.email, row.accountCode, row.accountName, row.canView, row.canUpdate])
    );
  };

  const reportExportDisabled = (() => {
    switch (reportFocus) {
      case 'trial':
        return trialRows.length === 0;
      case 'balance-sheet':
      case 'profit-loss':
        return financialRows.length === 0;
      case 'horizontal-position':
      case 'horizontal-income':
        return horizontalRows.length === 0;
      case 'cash':
        return cashFlowRows.length === 0;
      case 'tax':
        return taxRows.length === 0;
      case 'account-inquiry':
        return accountInquiryRows.length === 0;
      case 'account-trend':
        return accountTrendRows.length === 0;
      case 'account-listing':
        return accountListingRows.length === 0;
      default:
        return true;
    }
  })();

  const exportDisabled =
    (mode === 'transactions' && transactions.length === 0) ||
    (mode === 'reports' && reportExportDisabled) ||
    (mode === 'banking' && bankTransactions.length === 0) ||
    (mode === 'budgets' && budgetRows.length === 0) ||
    (mode === 'tags' && tags.length === 0) ||
    (mode === 'permissions' && permissions.length === 0);

  const transactionColumns = [
    {
      key: 'date',
      header: 'Date',
      render: (value: string) => formatDate(value),
    },
    {
      key: 'reference',
      header: 'Reference',
      className: 'font-mono',
    },
    {
      key: 'description',
      header: 'Description',
      className: 'max-w-md whitespace-normal',
    },
    {
      key: 'debitAccount',
      header: 'Debit Account',
      className: 'font-mono whitespace-normal',
    },
    {
      key: 'creditAccount',
      header: 'Credit Account',
      className: 'font-mono whitespace-normal',
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (value: number) => <span className="font-semibold">{formatMoney(value, glSettings)}</span>,
      className: 'text-right',
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            value === 'Posted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {value}
        </span>
      ),
    },
  ];

  const trialColumns = [
    { key: 'accountCode', header: 'Account', className: 'font-mono' },
    { key: 'accountName', header: 'Account Name', className: 'max-w-xs whitespace-normal' },
    { key: 'groupName', header: 'Group' },
    { key: 'sectionName', header: 'Section' },
    { key: 'debit', header: 'Debit', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'credit', header: 'Credit', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'balance', header: 'Balance', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
  ];

  const cashFlowColumns = [
    { key: 'activityName', header: 'Activity' },
    { key: 'inflow', header: 'Inflow', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'outflow', header: 'Outflow', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'net', header: 'Net', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
  ];

  const taxColumns = [
    { key: 'description', header: 'Tax Authority' },
    {
      key: 'salesTaxAccountName',
      header: 'Sales Tax Account',
      render: (_: string, row: GlTaxRow) => `${row.salesTaxAccountCode} - ${row.salesTaxAccountName}`,
      className: 'whitespace-normal',
    },
    {
      key: 'purchaseTaxAccountName',
      header: 'Purchase Tax Account',
      render: (_: string, row: GlTaxRow) => `${row.purchaseTaxAccountCode} - ${row.purchaseTaxAccountName}`,
      className: 'whitespace-normal',
    },
    { key: 'salesTaxTotal', header: 'Sales Tax', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'purchaseTaxTotal', header: 'Purchase Tax', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'netTax', header: 'Net Tax', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
  ];

  const financialColumns = [
    { key: 'accountCode', header: 'Account', className: 'font-mono' },
    { key: 'accountName', header: 'Account Name', className: 'max-w-sm whitespace-normal' },
    { key: 'groupName', header: 'Group' },
    { key: 'sectionName', header: 'Section' },
    { key: 'debit', header: 'Debit', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'credit', header: 'Credit', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'balance', header: 'Balance', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
  ];

  const horizontalColumns = [
    { key: 'accountCode', header: 'Account', className: 'font-mono' },
    { key: 'accountName', header: 'Account Name', className: 'max-w-sm whitespace-normal' },
    { key: 'groupName', header: 'Group' },
    { key: 'sectionName', header: 'Section' },
    { key: 'currentBalance', header: 'Current', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'previousBalance', header: 'Previous', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'change', header: 'Change', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
    {
      key: 'changePct',
      header: 'Change %',
      render: (value: number | null) => (value === null ? '-' : `${value.toFixed(2)}%`),
      className: 'text-right',
    },
  ];

  const accountInquiryColumns = [
    { key: 'date', header: 'Date', render: (value: string) => formatDate(value) },
    { key: 'periodNo', header: 'Period', className: 'font-mono' },
    {
      key: 'accountName',
      header: 'Account',
      render: (_: string, row: GlAccountInquiryRow) => `${row.accountCode} - ${row.accountName}`,
      className: 'whitespace-normal',
    },
    { key: 'reference', header: 'Reference' },
    { key: 'narrative', header: 'Narrative', className: 'max-w-md whitespace-normal' },
    { key: 'debit', header: 'Debit', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'credit', header: 'Credit', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            value === 'Posted' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {value}
        </span>
      ),
    },
  ];

  const accountTrendColumns = [
    { key: 'period', header: 'Period', className: 'font-mono' },
    { key: 'periodEndDate', header: 'Period End', render: (value: string) => formatDate(value) },
    { key: 'balance', header: 'Balance', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
  ];

  const accountListingColumns = [
    { key: 'accountCode', header: 'Account', className: 'font-mono' },
    { key: 'accountName', header: 'Account Name', className: 'max-w-sm whitespace-normal' },
    { key: 'groupName', header: 'Group' },
    { key: 'sectionName', header: 'Section' },
    { key: 'accountTypeLabel', header: 'Type' },
    { key: 'balance', header: 'Balance', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
  ];

  const bankAccountColumns = [
    { key: 'accountCode', header: 'GL Account', className: 'font-mono' },
    { key: 'bankAccountName', header: 'Bank Account Name' },
    { key: 'currencyCode', header: 'Currency', className: 'font-mono' },
    { key: 'importFormat', header: 'Import Format' },
    {
      key: 'invoiceMode',
      header: 'Invoice Mode',
      render: (value: number) => (value === 2 ? 'Fallback Default' : value === 1 ? 'Currency Default' : 'No'),
    },
    { key: 'balance', header: 'Balance', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: unknown, row: GlBankAccount) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEditBankAccount(row)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void onDeleteBankAccount(row)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  const bankTransactionColumns = [
    { key: 'date', header: 'Date', render: (value: string) => formatDate(value) },
    { key: 'reference', header: 'Reference' },
    {
      key: 'bankAccountName',
      header: 'Bank Account',
      render: (_: string, row: GlBankTransaction) => `${row.bankAccountCode} - ${row.bankAccountName}`,
      className: 'whitespace-normal',
    },
    { key: 'direction', header: 'Direction' },
    { key: 'amount', header: 'Amount', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'amountCleared', header: 'Cleared', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            value === 'Matched' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {value}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: unknown, row: GlBankTransaction) => (
        <Button
          variant="secondary"
          size="sm"
          disabled={matchingBankTransId === row.id}
          onClick={() => void onToggleMatchBankTransaction(row)}
        >
          {matchingBankTransId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {row.status === 'Matched' ? 'Unmatch' : 'Match'}
        </Button>
      ),
    },
  ];

  const budgetColumns = [
    { key: 'period', header: 'Period', className: 'font-mono' },
    { key: 'accountCode', header: 'Account', className: 'font-mono' },
    { key: 'accountName', header: 'Account Name', className: 'whitespace-normal max-w-xs' },
    { key: 'groupName', header: 'Group' },
    { key: 'budget', header: 'Budget', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'actual', header: 'Actual', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    {
      key: 'variance',
      header: 'Variance',
      render: (value: number) => <span className={value >= 0 ? 'text-emerald-700' : 'text-red-700'}>{formatMoney(value, glSettings)}</span>,
      className: 'text-right font-semibold',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: unknown, row: GlBudgetRow) => (
        <Button variant="secondary" size="sm" onClick={() => openEditBudget(row)}>
          <Pencil className="h-3 w-3" />
        </Button>
      ),
    },
  ];

  const tagColumns = [
    { key: 'tagRef', header: 'Tag Ref', className: 'font-mono' },
    { key: 'tagDescription', header: 'Description' },
    { key: 'transactionCount', header: 'Transactions', className: 'text-right' },
    { key: 'totalDebits', header: 'Debits', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'totalCredits', header: 'Credits', render: (value: number) => formatMoney(value, glSettings), className: 'text-right' },
    { key: 'balance', header: 'Balance', render: (value: number) => formatMoney(value, glSettings), className: 'text-right font-semibold' },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: unknown, row: GlTagRow) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEditTag(row)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void onDeleteTag(row)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
  ];

  const permissionColumns = [
    { key: 'scope', header: 'Scope', className: 'uppercase text-xs font-semibold' },
    { key: 'userId', header: 'User ID', className: 'font-mono' },
    { key: 'userName', header: 'User Name' },
    { key: 'email', header: 'Email' },
    { key: 'accountCode', header: 'Account', className: 'font-mono' },
    { key: 'accountName', header: 'Account Name', className: 'whitespace-normal max-w-sm' },
    {
      key: 'canView',
      header: 'Can View',
      render: (value: boolean) => (value ? 'Yes' : 'No'),
      className: 'text-center',
    },
    {
      key: 'canUpdate',
      header: 'Can Update',
      render: (value: boolean) => (value ? 'Yes' : 'No'),
      className: 'text-center',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: unknown, row: GlAccountUserPermission) => {
        const deleting = deletingPermissionKey === `${row.scope}|${row.userId}|${row.accountCode}`;
        return (
          <div className="flex gap-2">
            {row.scope === 'gl' ? (
              <Button variant="secondary" size="sm" disabled={savingPermission} onClick={() => void onTogglePermissionUpdate(row)}>
                {row.canUpdate ? 'Revoke Update' : 'Grant Update'}
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" disabled={deleting} onClick={() => void onDeletePermission(row)}>
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </div>
        );
      },
    },
  ];

  const reportUsesPeriod =
    reportFocus === 'trial' ||
    reportFocus === 'balance-sheet' ||
    reportFocus === 'profit-loss' ||
    reportFocus === 'horizontal-position' ||
    reportFocus === 'horizontal-income';
  const reportUsesDateRange = reportFocus === 'cash' || reportFocus === 'tax' || reportFocus === 'account-inquiry';
  const reportUsesAccount = reportFocus === 'account-inquiry' || reportFocus === 'account-trend';
  const reportSearchPlaceholder =
    reportFocus === 'account-listing'
      ? 'Search account listing'
      : reportFocus === 'account-inquiry'
        ? 'Search account inquiry'
        : 'Search accounts';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{header.title}</h1>
          <p className="text-gray-600 dark:text-gray-400">{header.description}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {glSettings.companyName} | Currency: {glSettings.currencyCode} ({glSettings.currencyDecimalPlaces} decimals)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportCurrentMode} disabled={exportDisabled}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="secondary" onClick={refreshCurrentMode} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          {mode === 'transactions' ? (
            <Button onClick={openNewEntry}>
              <Plus className="mr-2 h-4 w-4" />
              New Entry
            </Button>
          ) : null}
          {mode === 'banking' ? (
            <>
              <Button variant="secondary" onClick={openBankImport}>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
              <Button variant="secondary" onClick={openCreateBankAccount}>
                <Plus className="mr-2 h-4 w-4" />
                Bank Account
              </Button>
              <Button onClick={() => openBankEntry('payment')}>
                <Plus className="mr-2 h-4 w-4" />
                New Payment
              </Button>
              <Button onClick={() => openBankEntry('receipt')}>
                <Plus className="mr-2 h-4 w-4" />
                New Receipt
              </Button>
            </>
          ) : null}
          {mode === 'tags' ? (
            <Button onClick={openCreateTag}>
              <Plus className="mr-2 h-4 w-4" />
              New Tag
            </Button>
          ) : null}
          {mode === 'budgets' ? (
            <Button onClick={openCreateBudget}>
              <Plus className="mr-2 h-4 w-4" />
              Set Budget
            </Button>
          ) : null}
          {mode === 'permissions' ? (
            <Button onClick={openCreatePermission}>
              <Plus className="mr-2 h-4 w-4" />
              Authorise User
            </Button>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <Card className="border border-red-200 bg-red-50">
          <div className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <span>{errorMessage}</span>
          </div>
        </Card>
      ) : null}

      {successMessage ? (
        <Card className="border border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <span>{successMessage}</span>
          </div>
        </Card>
      ) : null}

      {mode === 'transactions' ? (
        <>
          <Card>
            <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr_1fr_220px_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchInput}
                  onChange={(event) => {
                    setSearchInput(event.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  placeholder="Search transactions, account code or narrative"
                />
              </div>

              <SearchableSelect
                value={selectedAccount}
                onChange={(event) => {
                  setSelectedAccount(event.target.value);
                  setPage(1);
                }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All accounts</option>
                {accountOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </SearchableSelect>

              <SearchableSelect
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as 'all' | 'posted' | 'pending');
                  setPage(1);
                }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All statuses</option>
                <option value="posted">Posted</option>
                <option value="pending">Pending</option>
              </SearchableSelect>

              <DatePicker
                value={dateFrom}
                onChange={(value) => {
                  setDateFrom(value);
                  setPage(1);
                }}
                placeholder="From date"
                clearable
              />
              <DatePicker
                value={dateTo}
                onChange={(value) => {
                  setDateTo(value);
                  setPage(1);
                }}
                placeholder="To date"
                clearable
              />
            </div>

            {loading ? (
              <div className="py-10 text-center text-sm text-gray-500">Loading transactions...</div>
            ) : transactions.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">No transactions found for the current filters.</div>
            ) : (
              <Table columns={transactionColumns} data={transactions} />
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
              <div>
                Showing page {effectiveTransactionPagination.page} of {Math.max(effectiveTransactionPagination.totalPages, 1)} (
                {effectiveTransactionPagination.total} entries)
              </div>
              <div className="flex items-center gap-2">
                <SearchableSelect
                  value={String(pageSize)}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  <option value="25">25 / page</option>
                  <option value="50">50 / page</option>
                  <option value="100">100 / page</option>
                </SearchableSelect>
                <Button variant="secondary" disabled={loading || page <= 1} onClick={() => setPage((prev) => prev - 1)}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={loading || !effectiveTransactionPagination.hasMore}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="text-center">
              <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Total Debits</h3>
              <p className="text-2xl font-bold text-emerald-600">{formatMoney(calculatedTransactionSummary.totalDebits, glSettings)}</p>
            </Card>
            <Card className="text-center">
              <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Total Credits</h3>
              <p className="text-2xl font-bold text-blue-600">{formatMoney(calculatedTransactionSummary.totalCredits, glSettings)}</p>
            </Card>
            <Card className="text-center">
              <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Balance</h3>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatMoney(calculatedTransactionSummary.balance, glSettings)}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Posted: {calculatedTransactionSummary.postedEntries} | Pending: {calculatedTransactionSummary.pendingEntries}
              </p>
            </Card>
          </div>
        </>
      ) : null}

      {mode === 'reports' ? (
        <>
          <Card>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_220px_220px_220px_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={reportSearch}
                  onChange={(event) => {
                    setReportSearch(event.target.value);
                    setReportPage(1);
                  }}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  placeholder={reportSearchPlaceholder}
                />
              </div>

              {reportUsesPeriod ? (
                <SearchableSelect
                  value={String(reportPeriod)}
                  onChange={(event) => setReportPeriod(Number(event.target.value))}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  <option value="0">Latest period</option>
                  {periodOptions.map((period) => (
                    <option key={`period-${period}`} value={period}>
                      Period {period}
                    </option>
                  ))}
                </SearchableSelect>
              ) : (
                <div />
              )}

              {reportUsesAccount ? (
                <SearchableSelect
                  value={reportAccountCode}
                  onChange={(event) => {
                    setReportAccountCode(event.target.value);
                    setReportPage(1);
                  }}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  {reportFocus === 'account-inquiry' ? <option value="all">All accounts</option> : null}
                  {accountOptions.map((option) => (
                    <option key={`report-account-${option.code}`} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </SearchableSelect>
              ) : reportFocus === 'trial' ? (
                <label className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={reportIncludeZero}
                    onChange={(event) => setReportIncludeZero(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600"
                  />
                  Include zero
                </label>
              ) : reportFocus === 'account-trend' ? (
                <SearchableSelect
                  value={String(trendPeriods)}
                  onChange={(event) => setTrendPeriods(Number(event.target.value))}
                  className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  {[6, 12, 18, 24, 36, 48, 60].map((value) => (
                    <option key={`trend-periods-${value}`} value={value}>
                      Last {value} periods
                    </option>
                  ))}
                </SearchableSelect>
              ) : (
                <div />
              )}

              {reportUsesDateRange ? (
                <>
                  <DatePicker value={reportDateFrom} onChange={setReportDateFrom} placeholder="From date" clearable />
                  <DatePicker value={reportDateTo} onChange={setReportDateTo} placeholder="To date" clearable />
                </>
              ) : (
                <>
                  <div />
                  <div />
                </>
              )}
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant={reportFocus === 'trial' ? 'primary' : 'secondary'} onClick={() => setReportFocus('trial')}>
              Trial Balance
            </Button>
            <Button variant={reportFocus === 'balance-sheet' ? 'primary' : 'secondary'} onClick={() => setReportFocus('balance-sheet')}>
              Balance Sheet
            </Button>
            <Button variant={reportFocus === 'profit-loss' ? 'primary' : 'secondary'} onClick={() => setReportFocus('profit-loss')}>
              Profit & Loss
            </Button>
            <Button variant={reportFocus === 'cash' ? 'primary' : 'secondary'} onClick={() => setReportFocus('cash')}>
              Cash Flow
            </Button>
            <Button
              variant={reportFocus === 'horizontal-position' ? 'primary' : 'secondary'}
              onClick={() => setReportFocus('horizontal-position')}
            >
              Horizontal Position
            </Button>
            <Button
              variant={reportFocus === 'horizontal-income' ? 'primary' : 'secondary'}
              onClick={() => setReportFocus('horizontal-income')}
            >
              Horizontal Income
            </Button>
            <Button
              variant={reportFocus === 'account-inquiry' ? 'primary' : 'secondary'}
              onClick={() => setReportFocus('account-inquiry')}
            >
              Account Inquiry
            </Button>
            <Button
              variant={reportFocus === 'account-trend' ? 'primary' : 'secondary'}
              onClick={() => setReportFocus('account-trend')}
            >
              Account Graph
            </Button>
            <Button
              variant={reportFocus === 'account-listing' ? 'primary' : 'secondary'}
              onClick={() => setReportFocus('account-listing')}
            >
              Account Listing
            </Button>
            <Button variant={reportFocus === 'tax' ? 'primary' : 'secondary'} onClick={() => setReportFocus('tax')}>
              Tax Report
            </Button>
          </div>

          {reportFocus === 'trial' ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Trial Debits</h3>
                  <p className="text-2xl font-bold text-emerald-600">{formatMoney(trialSummary?.totalDebits ?? 0, glSettings)}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Trial Credits</h3>
                  <p className="text-2xl font-bold text-blue-600">{formatMoney(trialSummary?.totalCredits ?? 0, glSettings)}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Difference</h3>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatMoney(trialSummary?.difference ?? 0, glSettings)}</p>
                </Card>
              </div>

              <Card>
                <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Trial Balance</h3>
                {loading ? (
                  <div className="py-8 text-center text-sm text-gray-500">Loading trial balance...</div>
                ) : trialRows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">No trial balance rows found.</div>
                ) : (
                  <Table columns={trialColumns} data={trialRows} />
                )}
              </Card>
            </>
          ) : null}

          {reportFocus === 'cash' ? (
            <Card>
              <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Cash Flow Statement</h3>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Inflow</span>
                  <p className="font-semibold text-emerald-600">{formatMoney(cashFlowSummary?.totalInflow ?? 0, glSettings)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Outflow</span>
                  <p className="font-semibold text-blue-600">{formatMoney(cashFlowSummary?.totalOutflow ?? 0, glSettings)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Net</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatMoney(cashFlowSummary?.netCashFlow ?? 0, glSettings)}</p>
                </div>
              </div>
              {cashFlowRows.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">No cash flow rows found.</div>
              ) : (
                <Table columns={cashFlowColumns} data={cashFlowRows} />
              )}
            </Card>
          ) : null}

          {reportFocus === 'balance-sheet' || reportFocus === 'profit-loss' ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Accounts</h3>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{financialSummary?.accounts ?? 0}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Debits</h3>
                  <p className="text-2xl font-bold text-emerald-600">{formatMoney(financialSummary?.totalDebits ?? 0, glSettings)}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Credits</h3>
                  <p className="text-2xl font-bold text-blue-600">{formatMoney(financialSummary?.totalCredits ?? 0, glSettings)}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Net</h3>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatMoney(financialSummary?.net ?? 0, glSettings)}</p>
                </Card>
              </div>

              <Card>
                <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">
                  {reportFocus === 'balance-sheet' ? 'Balance Sheet' : 'Profit and Loss Statement'}
                </h3>
                {loading ? (
                  <div className="py-8 text-center text-sm text-gray-500">Loading statement...</div>
                ) : financialRows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">No statement rows found.</div>
                ) : (
                  <Table columns={financialColumns} data={financialRows} />
                )}
              </Card>
            </>
          ) : null}

          {reportFocus === 'horizontal-position' || reportFocus === 'horizontal-income' ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Accounts</h3>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{horizontalSummary?.accounts ?? 0}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Current</h3>
                  <p className="text-2xl font-bold text-emerald-600">{formatMoney(horizontalSummary?.currentTotal ?? 0, glSettings)}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Previous</h3>
                  <p className="text-2xl font-bold text-blue-600">{formatMoney(horizontalSummary?.previousTotal ?? 0, glSettings)}</p>
                </Card>
                <Card className="text-center">
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Change</h3>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatMoney(horizontalSummary?.changeTotal ?? 0, glSettings)}</p>
                </Card>
              </div>

              <Card>
                <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">
                  {reportFocus === 'horizontal-position'
                    ? 'Horizontal Analysis of Statement of Financial Position'
                    : 'Horizontal Analysis of Statement of Comprehensive Income'}
                </h3>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Comparing current period against period {horizontalPreviousPeriod || '-'}</p>
                {loading ? (
                  <div className="py-8 text-center text-sm text-gray-500">Loading horizontal analysis...</div>
                ) : horizontalRows.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-500">No rows found.</div>
                ) : (
                  <Table columns={horizontalColumns} data={horizontalRows} />
                )}
              </Card>
            </>
          ) : null}

          {reportFocus === 'tax' ? (
            <Card>
              <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Tax Report</h3>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3 text-sm">
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Authorities</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{taxSummary?.authorities ?? 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Sales Tax</span>
                  <p className="font-semibold text-emerald-600">{formatMoney(taxSummary?.salesTaxTotal ?? 0, glSettings)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Purchase Tax</span>
                  <p className="font-semibold text-blue-600">{formatMoney(taxSummary?.purchaseTaxTotal ?? 0, glSettings)}</p>
                </div>
              </div>
              {taxRows.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">No tax rows found.</div>
              ) : (
                <Table columns={taxColumns} data={taxRows} />
              )}
            </Card>
          ) : null}

          {reportFocus === 'account-inquiry' ? (
            <Card>
              <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Account Inquiry</h3>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4 text-sm">
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Entries</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{accountInquirySummary?.entries ?? 0}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Debits</span>
                  <p className="font-semibold text-emerald-600">{formatMoney(accountInquirySummary?.debits ?? 0, glSettings)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Credits</span>
                  <p className="font-semibold text-blue-600">{formatMoney(accountInquirySummary?.credits ?? 0, glSettings)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-gray-500 dark:text-gray-400">Net</span>
                  <p className="font-semibold text-gray-900 dark:text-white">{formatMoney(accountInquirySummary?.net ?? 0, glSettings)}</p>
                </div>
              </div>

              {loading ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading account inquiry...</div>
              ) : accountInquiryRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No account inquiry entries found.</div>
              ) : (
                <Table columns={accountInquiryColumns} data={accountInquiryRows} />
              )}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <SearchableSelect
                  value={String(reportPageSize)}
                  onChange={(event) => {
                    setReportPageSize(Number(event.target.value));
                    setReportPage(1);
                  }}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  <option value="25">25 / page</option>
                  <option value="50">50 / page</option>
                  <option value="100">100 / page</option>
                </SearchableSelect>
                <Button variant="secondary" disabled={loading || reportPage <= 1} onClick={() => setReportPage((prev) => prev - 1)}>
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={loading || !accountInquiryPagination?.hasMore}
                  onClick={() => setReportPage((prev) => prev + 1)}
                >
                  Next
                </Button>
              </div>
            </Card>
          ) : null}

          {reportFocus === 'account-trend' ? (
            <Card>
              <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Graph of Account Transactions</h3>
              <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
                {reportAccountCode === 'all'
                  ? 'Select an account to view trend data.'
                  : `${reportAccountCode}${accountTrendName ? ` - ${accountTrendName}` : ''}`}
              </p>

              {reportAccountCode === 'all' ? (
                <div className="py-8 text-center text-sm text-gray-500">Choose an account to display graph data.</div>
              ) : loading ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading account trend...</div>
              ) : accountTrendRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No trend rows found.</div>
              ) : (
                <>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={accountTrendRows}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                        <XAxis dataKey="period" />
                        <YAxis />
                        <Tooltip
                          formatter={(value: number) => formatMoney(Number(value), glSettings)}
                          labelFormatter={(label: number) => `Period ${label}`}
                        />
                        <Line type="monotone" dataKey="balance" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4">
                    <Table columns={accountTrendColumns} data={accountTrendRows} />
                  </div>
                </>
              )}
            </Card>
          ) : null}

          {reportFocus === 'account-listing' ? (
            <Card>
              <h3 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Account Listing</h3>
              {loading ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading account listing...</div>
              ) : accountListingRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No accounts found.</div>
              ) : (
                <Table columns={accountListingColumns} data={accountListingRows} />
              )}
            </Card>
          ) : null}
        </>
      ) : null}

      {mode === 'banking' ? (
        <>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Bank Accounts</h3>
              <span className="text-sm text-gray-600 dark:text-gray-400">Total Balance: {formatMoney(bankTotalBalance, glSettings)}</span>
            </div>
            {loading && bankAccounts.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading bank accounts...</div>
            ) : bankAccounts.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No bank accounts configured.</div>
            ) : (
              <Table columns={bankAccountColumns} data={bankAccounts} />
            )}
          </Card>

          <Card>
            <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_180px_180px_220px_220px]">
              <SearchableSelect
                value={bankAccountFilter}
                onChange={(event) => {
                  setBankAccountFilter(event.target.value);
                  setBankPage(1);
                }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All bank accounts</option>
                {bankAccounts.map((account) => (
                  <option key={`bank-filter-${account.accountCode}`} value={account.accountCode}>
                    {account.accountCode} - {account.bankAccountName || account.accountName}
                  </option>
                ))}
              </SearchableSelect>

              <SearchableSelect
                value={bankMatchFilter}
                onChange={(event) => {
                  setBankMatchFilter(event.target.value as 'all' | 'matched' | 'unmatched');
                  setBankPage(1);
                }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">All matching</option>
                <option value="matched">Matched</option>
                <option value="unmatched">Unmatched</option>
              </SearchableSelect>

              <SearchableSelect
                value={bankKindFilter}
                onChange={(event) => {
                  setBankKindFilter(event.target.value as 'all' | 'payments' | 'receipts');
                  setBankPage(1);
                }}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="all">Payments + Receipts</option>
                <option value="payments">Payments only</option>
                <option value="receipts">Receipts only</option>
              </SearchableSelect>

              <DatePicker
                value={bankDateFrom}
                onChange={(value) => {
                  setBankDateFrom(value);
                  setBankPage(1);
                }}
                placeholder="From date"
                clearable
              />
              <DatePicker
                value={bankDateTo}
                onChange={(value) => {
                  setBankDateTo(value);
                  setBankPage(1);
                }}
                placeholder="To date"
                clearable
              />
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Rows</span>
                <p className="font-semibold text-gray-900 dark:text-white">{bankTransactionSummary?.entries ?? 0}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Payments</span>
                <p className="font-semibold text-emerald-600">{formatMoney(bankTransactionSummary?.totalPayments ?? 0, glSettings)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Receipts</span>
                <p className="font-semibold text-blue-600">{formatMoney(bankTransactionSummary?.totalReceipts ?? 0, glSettings)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Net</span>
                <p className="font-semibold text-gray-900 dark:text-white">{formatMoney(bankTransactionSummary?.net ?? 0, glSettings)}</p>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading bank transactions...</div>
            ) : bankTransactions.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No bank transactions found for the current filters.</div>
            ) : (
              <Table columns={bankTransactionColumns} data={bankTransactions} />
            )}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <SearchableSelect
                value={String(bankPageSize)}
                onChange={(event) => {
                  setBankPageSize(Number(event.target.value));
                  setBankPage(1);
                }}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </SearchableSelect>
              <Button variant="secondary" disabled={loading || bankPage <= 1} onClick={() => setBankPage((prev) => prev - 1)}>
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={loading || !bankPagination?.hasMore}
                onClick={() => setBankPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      {mode === 'budgets' ? (
        <>
          <Card>
            <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={budgetSearch}
                  onChange={(event) => setBudgetSearch(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                  placeholder="Search budgets by account, group or section"
                />
              </div>

              <SearchableSelect
                value={String(budgetPeriod)}
                onChange={(event) => setBudgetPeriod(Number(event.target.value))}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="0">Latest period</option>
                {budgetPeriodOptions.map((period) => (
                  <option key={`budget-period-${period}`} value={period}>
                    Period {period}
                  </option>
                ))}
              </SearchableSelect>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4 text-sm">
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Accounts</span>
                <p className="font-semibold text-gray-900 dark:text-white">{budgetSummary?.accounts ?? 0}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Budget</span>
                <p className="font-semibold text-emerald-600">{formatMoney(budgetSummary?.budget ?? 0, glSettings)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Actual</span>
                <p className="font-semibold text-blue-600">{formatMoney(budgetSummary?.actual ?? 0, glSettings)}</p>
              </div>
              <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800">
                <span className="text-gray-500 dark:text-gray-400">Variance</span>
                <p className="font-semibold text-gray-900 dark:text-white">{formatMoney(budgetSummary?.variance ?? 0, glSettings)}</p>
              </div>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading budget rows...</div>
            ) : budgetRows.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500">No budget rows found.</div>
            ) : (
              <Table columns={budgetColumns} data={budgetRows} />
            )}
          </Card>
        </>
      ) : null}

      {mode === 'tags' ? (
        <Card>
          <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_220px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={tagSearch}
                onChange={(event) => setTagSearch(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Search tags"
              />
            </div>
            <DatePicker value={tagDateFrom} onChange={setTagDateFrom} placeholder="From date" clearable />
            <DatePicker value={tagDateTo} onChange={setTagDateTo} placeholder="To date" clearable />
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading tags...</div>
          ) : tags.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No tags found.</div>
          ) : (
            <Table columns={tagColumns} data={tags} />
          )}
        </Card>
      ) : null}

      {mode === 'permissions' ? (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Scope:</label>
            <SearchableSelect
              value={permissionScope}
              onChange={(event) => {
                setPermissionScope(event.target.value as 'gl' | 'bank');
                setPermissionDialogOpen(false);
              }}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              <option value="gl">GL account users</option>
              <option value="bank">Bank account users</option>
            </SearchableSelect>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Loading user permissions...</div>
          ) : permissions.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">No user permissions found for this scope.</div>
          ) : (
            <Table columns={permissionColumns} data={permissions} />
          )}
        </Card>
      ) : null}

      <Modal
        isOpen={entryDialogOpen}
        onClose={() => !savingEntry && setEntryDialogOpen(false)}
        title="New Journal Entry"
        size="xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setEntryDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="gl-entry-form" disabled={savingEntry}>
              {savingEntry ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Post Journal
            </Button>
          </>
        }
      >
        <form id="gl-entry-form" className="space-y-4" onSubmit={(event) => void onSaveEntry(event)}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Transaction Date</span>
              <DatePicker value={entryDate} onChange={setEntryDate} className="w-full" />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Narrative</span>
              <input
                value={entryNarrative}
                onChange={(event) => setEntryNarrative(event.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Optional note for this journal"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={addEntryLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line
            </Button>
          </div>

          <div className="space-y-3">
            {entryLines.map((line, index) => (
              <div key={`line-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_170px_170px_80px]">
                <SearchableSelect
                  value={line.accountCode}
                  onChange={(event) => updateEntryLine(index, { accountCode: event.target.value })}
                  required
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Select account</option>
                  {accountOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </SearchableSelect>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.debit}
                  onChange={(event) => updateEntryLine(index, { debit: event.target.value })}
                  placeholder="Debit"
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.credit}
                  onChange={(event) => updateEntryLine(index, { credit: event.target.value })}
                  placeholder="Credit"
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => removeEntryLine(index)}
                  disabled={entryLines.length <= 2}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={bankEntryDialogOpen}
        onClose={() => !savingBankEntry && setBankEntryDialogOpen(false)}
        title={bankEntryKind === 'payment' ? 'New Bank Payment' : 'New Bank Receipt'}
        size="xl"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setBankEntryDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="gl-bank-entry-form" disabled={savingBankEntry}>
              {savingBankEntry ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Post {bankEntryKind === 'payment' ? 'Payment' : 'Receipt'}
            </Button>
          </>
        }
      >
        <form id="gl-bank-entry-form" className="space-y-4" onSubmit={(event) => void onSaveBankEntry(event)}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Transaction Date</span>
              <DatePicker value={bankEntryDate} onChange={setBankEntryDate} className="w-full" />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Bank Account</span>
              <SearchableSelect
                value={bankEntryBankAccount}
                onChange={(event) => setBankEntryBankAccount(event.target.value)}
                required
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Select bank account</option>
                {bankAccounts.map((account) => (
                  <option key={`entry-bank-${account.accountCode}`} value={account.accountCode}>
                    {account.accountCode} - {account.bankAccountName || account.accountName}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Reference</span>
              <input
                value={bankEntryReference}
                onChange={(event) => setBankEntryReference(event.target.value)}
                maxLength={50}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Bank transaction reference"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Cheque No</span>
              <input
                value={bankEntryChequeNo}
                onChange={(event) => setBankEntryChequeNo(event.target.value)}
                maxLength={16}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Optional cheque number"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Narrative</span>
              <input
                value={bankEntryNarrative}
                onChange={(event) => setBankEntryNarrative(event.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder="Optional narrative"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={addBankEntryLine}>
              <Plus className="mr-2 h-4 w-4" />
              Add Line
            </Button>
          </div>

          <div className="space-y-3">
            {bankEntryLines.map((line, index) => (
              <div key={`bank-line-${index}`} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_1fr_80px]">
                <SearchableSelect
                  value={line.accountCode}
                  onChange={(event) => updateBankEntryLine(index, { accountCode: event.target.value })}
                  required
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">Select GL account</option>
                  {accountOptions.map((option) => (
                    <option key={`bank-gl-${option.code}`} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </SearchableSelect>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.amount}
                  onChange={(event) => updateBankEntryLine(index, { amount: event.target.value })}
                  placeholder="Amount"
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <input
                  value={line.narrative}
                  onChange={(event) => updateBankEntryLine(index, { narrative: event.target.value })}
                  maxLength={200}
                  placeholder="Line narrative (optional)"
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => removeBankEntryLine(index)}
                  disabled={bankEntryLines.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={bankImportDialogOpen}
        onClose={() => !importingBankCsv && setBankImportDialogOpen(false)}
        title="Import Bank Transactions CSV"
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setBankImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="gl-bank-import-form" disabled={importingBankCsv}>
              {importingBankCsv ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import CSV
            </Button>
          </>
        }
      >
        <form id="gl-bank-import-form" className="space-y-4" onSubmit={(event) => void onImportBankCsv(event)}>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              onChange={(event) => setBankImportFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </label>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>Default bank account</span>
            <SearchableSelect
              value={bankImportDefaultAccount}
              onChange={(event) => setBankImportDefaultAccount(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              <option value="">Use CSV value</option>
              {bankAccounts.map((account) => (
                <option key={`import-bank-${account.accountCode}`} value={account.accountCode}>
                  {account.accountCode} - {account.bankAccountName || account.accountName}
                </option>
              ))}
            </SearchableSelect>
          </label>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>Default kind</span>
            <SearchableSelect
              value={bankImportDefaultKind}
              onChange={(event) => setBankImportDefaultKind(event.target.value as 'payment' | 'receipt')}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              <option value="payment">Payment</option>
              <option value="receipt">Receipt</option>
            </SearchableSelect>
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={bankAccountDialogOpen}
        onClose={() => !savingBankAccount && setBankAccountDialogOpen(false)}
        title={editingBankAccountCode ? `Edit Bank Account ${editingBankAccountCode}` : 'New Bank Account'}
        size="lg"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setBankAccountDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="gl-bank-account-form" disabled={savingBankAccount}>
              {savingBankAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Bank Account
            </Button>
          </>
        }
      >
        <form id="gl-bank-account-form" className="space-y-4" onSubmit={(event) => void onSaveBankAccount(event)}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>GL account code</span>
              <input
                value={bankAccountForm.accountCode}
                onChange={(event) => setBankAccountForm((previous) => ({ ...previous, accountCode: event.target.value }))}
                disabled={Boolean(editingBankAccountCode)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800"
                placeholder="e.g. 1030"
                required
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Currency code</span>
              <input
                value={bankAccountForm.currCode}
                onChange={(event) => setBankAccountForm((previous) => ({ ...previous, currCode: event.target.value.toUpperCase() }))}
                maxLength={3}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                required
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Bank account name</span>
              <input
                value={bankAccountForm.bankAccountName}
                onChange={(event) => setBankAccountForm((previous) => ({ ...previous, bankAccountName: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                required
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Bank account code</span>
              <input
                value={bankAccountForm.bankAccountCode}
                onChange={(event) => setBankAccountForm((previous) => ({ ...previous, bankAccountCode: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Bank account number</span>
              <input
                value={bankAccountForm.bankAccountNumber}
                onChange={(event) => setBankAccountForm((previous) => ({ ...previous, bankAccountNumber: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Import format</span>
              <input
                value={bankAccountForm.importFormat}
                onChange={(event) => setBankAccountForm((previous) => ({ ...previous, importFormat: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Invoice mode</span>
              <SearchableSelect
                value={String(bankAccountForm.invoiceMode)}
                onChange={(event) => setBankAccountForm((previous) => ({ ...previous, invoiceMode: Number(event.target.value) }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              >
                <option value="0">No</option>
                <option value="1">Currency Default</option>
                <option value="2">Fallback Default</option>
              </SearchableSelect>
            </label>
          </div>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>Bank address</span>
            <input
              value={bankAccountForm.bankAddress}
              onChange={(event) => setBankAccountForm((previous) => ({ ...previous, bankAddress: event.target.value }))}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={budgetDialogOpen}
        onClose={() => !savingBudget && setBudgetDialogOpen(false)}
        title="Set GL Budget"
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setBudgetDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="gl-budget-form" disabled={savingBudget}>
              {savingBudget ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Budget
            </Button>
          </>
        }
      >
        <form id="gl-budget-form" className="space-y-4" onSubmit={(event) => void onSaveBudget(event)}>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>Account</span>
            <SearchableSelect
              value={budgetFormAccountCode}
              onChange={(event) => setBudgetFormAccountCode(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              required
            >
              <option value="">Select account</option>
              {accountOptions.map((option) => (
                <option key={`budget-account-${option.code}`} value={option.code}>
                  {option.label}
                </option>
              ))}
            </SearchableSelect>
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Period</span>
              <input
                type="number"
                min="1"
                value={budgetFormPeriod || ''}
                onChange={(event) => setBudgetFormPeriod(Number(event.target.value))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                required
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              <span>Budget Amount</span>
              <input
                type="number"
                step="0.01"
                value={budgetFormAmount}
                onChange={(event) => setBudgetFormAmount(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                required
              />
            </label>
          </div>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>B/F Budget (optional)</span>
            <input
              type="number"
              step="0.01"
              value={budgetFormBfwdAmount}
              onChange={(event) => setBudgetFormBfwdAmount(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={permissionDialogOpen}
        onClose={() => !savingPermission && setPermissionDialogOpen(false)}
        title={`Authorise ${permissionScope === 'bank' ? 'Bank' : 'GL'} Account User`}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setPermissionDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="gl-permission-form" disabled={savingPermission}>
              {savingPermission ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Authorisation
            </Button>
          </>
        }
      >
        <form id="gl-permission-form" className="space-y-4" onSubmit={(event) => void onSavePermission(event)}>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>User ID</span>
            <input
              value={permissionFormUserId}
              onChange={(event) => setPermissionFormUserId(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              placeholder="Enter existing webERP user ID"
              required
            />
          </label>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>{permissionScope === 'bank' ? 'Bank account' : 'GL account'}</span>
            <SearchableSelect
              value={permissionFormAccountCode}
              onChange={(event) => setPermissionFormAccountCode(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              required
            >
              <option value="">Select account</option>
              {(permissionScope === 'bank' ? bankAccounts.map((row) => ({
                code: row.accountCode,
                label: `${row.accountCode} - ${row.bankAccountName || row.accountName}`,
              })) : accountOptions).map((option) => (
                <option key={`perm-account-${option.code}`} value={option.code}>
                  {option.label}
                </option>
              ))}
            </SearchableSelect>
          </label>

          {permissionScope === 'gl' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={permissionFormCanView}
                  onChange={(event) => setPermissionFormCanView(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                Can View
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={permissionFormCanUpdate}
                  onChange={(event) => setPermissionFormCanUpdate(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600"
                />
                Can Update
              </label>
            </div>
          ) : null}
        </form>
      </Modal>

      <Modal
        isOpen={tagDialogOpen}
        onClose={() => !savingTag && setTagDialogOpen(false)}
        title={editingTagRef === null ? 'New GL Tag' : `Edit GL Tag #${editingTagRef}`}
        size="md"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setTagDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="gl-tag-form" disabled={savingTag}>
              {savingTag ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Tag
            </Button>
          </>
        }
      >
        <form id="gl-tag-form" className="space-y-4" onSubmit={(event) => void onSaveTag(event)}>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <span>Description</span>
            <input
              value={tagDescription}
              onChange={(event) => setTagDescription(event.target.value)}
              maxLength={50}
              required
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              placeholder="Tag description"
            />
          </label>
        </form>
      </Modal>
    </div>
  );
}
