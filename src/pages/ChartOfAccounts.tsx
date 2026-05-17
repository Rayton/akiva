import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  FolderTree,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  DEFAULT_GL_SETTINGS,
  changeGlAccountCode,
  createGlAccount,
  createGlGroup,
  createGlSection,
  deleteGlAccount,
  deleteGlGroup,
  deleteGlSection,
  fetchGlAccounts,
  fetchGlGroups,
  fetchGlLookups,
  fetchGlSettings,
  fetchGlSections,
  importGlAccountsCsv,
  moveGlGroup,
  pingSalesModule,
  updateGlAccount,
  updateGlGroup,
  updateGlSection,
} from '../data/glApi';
import type { GlAccount, GlAccountsResponseMeta, GlGroup, GlLookups, GlSection, GlSettings } from '../types/gl';

interface ChartOfAccountsProps {
  sourceSlug?: string;
}

type GlView = 'accounts' | 'groups' | 'sections';

interface AccountFormState {
  accountCode: string;
  accountName: string;
  groupName: string;
  cashFlowsActivity: number;
}

interface GroupFormState {
  selectedGroupName: string;
  groupName: string;
  sectionInAccounts: number;
  sequenceInTB: number;
  pandL: number;
  parentGroupName: string;
}

interface SectionFormState {
  sectionId: number;
  sectionName: string;
  selectedSectionId: number | null;
}

function resolveInitialView(sourceSlug: string): GlView {
  const key = sourceSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.includes('accountgroups')) return 'groups';
  if (key.includes('accountsections')) return 'sections';
  return 'accounts';
}

function formatCurrency(value: number, settings: GlSettings): string {
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

function newAccountFormState(lookups: GlLookups): AccountFormState {
  return {
    accountCode: '',
    accountName: '',
    groupName: lookups.groups[0]?.groupName ?? '',
    cashFlowsActivity: lookups.cashFlowActivities[0]?.value ?? 0,
  };
}

function newGroupFormState(lookups: GlLookups): GroupFormState {
  const sectionId = lookups.sections[0]?.sectionId ?? 1;
  return {
    selectedGroupName: '',
    groupName: '',
    sectionInAccounts: sectionId,
    sequenceInTB: 0,
    pandL: 1,
    parentGroupName: '',
  };
}

function newSectionFormState(): SectionFormState {
  return {
    sectionId: 0,
    sectionName: '',
    selectedSectionId: null,
  };
}

export function ChartOfAccounts({ sourceSlug = '' }: ChartOfAccountsProps) {
  const [activeView, setActiveView] = useState<GlView>(() => resolveInitialView(sourceSlug));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [groups, setGroups] = useState<GlGroup[]>([]);
  const [sections, setSections] = useState<GlSection[]>([]);
  const [glSettings, setGlSettings] = useState<GlSettings>(DEFAULT_GL_SETTINGS);
  const [lookups, setLookups] = useState<GlLookups>({ groups: [], sections: [], cashFlowActivities: [] });
  const [accountsMeta, setAccountsMeta] = useState<GlAccountsResponseMeta | null>(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [accountSearch, setAccountSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<string>('all');
  const [cashFlowFilter, setCashFlowFilter] = useState<string>('all');
  const [groupSearch, setGroupSearch] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');

  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [sectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [changeCodeDialogOpen, setChangeCodeDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [moveGroupDialogOpen, setMoveGroupDialogOpen] = useState(false);

  const [accountForm, setAccountForm] = useState<AccountFormState>(newAccountFormState(lookups));
  const [groupForm, setGroupForm] = useState<GroupFormState>(newGroupFormState(lookups));
  const [sectionForm, setSectionForm] = useState<SectionFormState>(newSectionFormState());
  const [changeCodeForm, setChangeCodeForm] = useState({ oldAccountCode: '', newAccountCode: '' });
  const [moveGroupForm, setMoveGroupForm] = useState({ originalAccountGroup: '', destinyAccountGroup: '' });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [editingAccountCode, setEditingAccountCode] = useState<string | null>(null);

  const [salesStatusChecking, setSalesStatusChecking] = useState(false);
  const [salesHealthy, setSalesHealthy] = useState<boolean | null>(null);
  const { confirm, confirmationDialog } = useConfirmDialog();

  useEffect(() => {
    setActiveView(resolveInitialView(sourceSlug));
  }, [sourceSlug]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const [accountsResponse, groupsResponse, sectionsResponse, lookupsResponse, settingsResponse] = await Promise.all([
        fetchGlAccounts({ limit: 2000 }),
        fetchGlGroups({ limit: 2000 }),
        fetchGlSections({ limit: 1000 }),
        fetchGlLookups(),
        fetchGlSettings(),
      ]);

      setAccounts(accountsResponse.rows);
      setAccountsMeta(accountsResponse.meta);
      setGroups(groupsResponse);
      setSections(sectionsResponse);
      setLookups(lookupsResponse);
      setGlSettings(settingsResponse);

      setAccountForm((previous) => ({
        ...previous,
        groupName: previous.groupName || lookupsResponse.groups[0]?.groupName || '',
        cashFlowsActivity:
          lookupsResponse.cashFlowActivities.some((entry) => entry.value === previous.cashFlowsActivity)
            ? previous.cashFlowsActivity
            : (lookupsResponse.cashFlowActivities[0]?.value ?? 0),
      }));

      setGroupForm((previous) => ({
        ...previous,
        sectionInAccounts: previous.sectionInAccounts || lookupsResponse.sections[0]?.sectionId || 1,
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load general ledger data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSalesModuleHealth = useCallback(async () => {
    setSalesStatusChecking(true);
    try {
      const ok = await pingSalesModule();
      setSalesHealthy(ok);
    } finally {
      setSalesStatusChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
    void checkSalesModuleHealth();
  }, [loadAll, checkSalesModuleHealth]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const search = accountSearch.toLowerCase().trim();
      const searchMatch =
        search === '' ||
        account.accountCode.toLowerCase().includes(search) ||
        account.accountName.toLowerCase().includes(search) ||
        account.groupName.toLowerCase().includes(search);

      const groupMatch = groupFilter === '' || account.groupName === groupFilter;
      const typeMatch = accountTypeFilter === 'all' || String(account.accountType) === accountTypeFilter;
      const cashFlowMatch = cashFlowFilter === 'all' || String(account.cashFlowsActivity) === cashFlowFilter;

      return searchMatch && groupMatch && typeMatch && cashFlowMatch;
    });
  }, [accounts, accountSearch, groupFilter, accountTypeFilter, cashFlowFilter]);

  const filteredGroups = useMemo(() => {
    const search = groupSearch.toLowerCase().trim();
    if (search === '') return groups;

    return groups.filter((group) => {
      return (
        group.groupName.toLowerCase().includes(search) ||
        group.sectionName.toLowerCase().includes(search) ||
        group.parentGroupName.toLowerCase().includes(search)
      );
    });
  }, [groups, groupSearch]);

  const filteredSections = useMemo(() => {
    const search = sectionSearch.toLowerCase().trim();
    if (search === '') return sections;

    return sections.filter((section) => {
      return (
        String(section.sectionId).includes(search) ||
        section.sectionName.toLowerCase().includes(search)
      );
    });
  }, [sections, sectionSearch]);

  const beginCreateAccount = () => {
    setErrorMessage('');
    setEditingAccountCode(null);
    setAccountForm(newAccountFormState(lookups));
    setAccountDialogOpen(true);
  };

  const beginEditAccount = (account: GlAccount) => {
    setErrorMessage('');
    setEditingAccountCode(account.accountCode);
    setAccountForm({
      accountCode: account.accountCode,
      accountName: account.accountName,
      groupName: account.groupName,
      cashFlowsActivity: account.cashFlowsActivity,
    });
    setAccountDialogOpen(true);
  };

  const beginCreateGroup = () => {
    setErrorMessage('');
    setGroupForm(newGroupFormState(lookups));
    setGroupDialogOpen(true);
  };

  const beginEditGroup = (group: GlGroup) => {
    setErrorMessage('');
    setGroupForm({
      selectedGroupName: group.groupName,
      groupName: group.groupName,
      sectionInAccounts: group.sectionInAccounts,
      sequenceInTB: group.sequenceInTB,
      pandL: group.pandL,
      parentGroupName: group.parentGroupName,
    });
    setGroupDialogOpen(true);
  };

  const beginCreateSection = () => {
    setErrorMessage('');
    setSectionForm(newSectionFormState());
    setSectionDialogOpen(true);
  };

  const beginEditSection = (section: GlSection) => {
    setErrorMessage('');
    setSectionForm({
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      selectedSectionId: section.sectionId,
    });
    setSectionDialogOpen(true);
  };

  const onApiError = (error: unknown) => {
    setErrorMessage(error instanceof Error ? error.message : 'Operation failed.');
  };

  const withBusy = async (runner: () => Promise<void>) => {
    setBusy(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await runner();
    } catch (error) {
      onApiError(error);
    } finally {
      setBusy(false);
    }
  };

  const onSaveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await withBusy(async () => {
      if (accountForm.accountCode.trim() === '' || accountForm.accountName.trim() === '' || accountForm.groupName.trim() === '') {
        throw new Error('Account Code, Account Name and Account Group are required.');
      }

      const accountCode = accountForm.accountCode.trim().toUpperCase();
      const accountName = accountForm.accountName.trim();

      if (!editingAccountCode) {
        await createGlAccount({
          accountCode,
          accountName,
          groupName: accountForm.groupName,
          cashFlowsActivity: accountForm.cashFlowsActivity,
        });
        setSuccessMessage('General ledger account added.');
      } else {
        await updateGlAccount(accountCode, {
          accountName,
          groupName: accountForm.groupName,
          cashFlowsActivity: accountForm.cashFlowsActivity,
        });
        setSuccessMessage('General ledger account updated.');
      }

      setAccountDialogOpen(false);
      setEditingAccountCode(null);
      await loadAll();
    });
  };

  const onDeleteAccount = async (account: GlAccount) => {
    const confirmed = await confirm({
      title: 'Delete GL Account',
      description: 'The account will be removed after additional dependency checks run.',
      detail: `${account.accountCode} - ${account.accountName}`,
      confirmLabel: 'Delete Account',
    });
    if (!confirmed) {
      return;
    }

    await withBusy(async () => {
      await deleteGlAccount(account.accountCode);
      setSuccessMessage(`Account ${account.accountCode} deleted.`);
      await loadAll();
    });
  };

  const onSaveGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await withBusy(async () => {
      const groupName = groupForm.groupName.trim();
      if (groupName === '') {
        throw new Error('Group Name is required.');
      }

      const payload = {
        groupName,
        sectionInAccounts: Number(groupForm.sectionInAccounts),
        sequenceInTB: Number(groupForm.sequenceInTB),
        pandL: Number(groupForm.pandL),
        parentGroupName: groupForm.parentGroupName.trim(),
      };

      if (groupForm.selectedGroupName) {
        await updateGlGroup(groupForm.selectedGroupName, payload);
        setSuccessMessage('Account group updated.');
      } else {
        await createGlGroup(payload);
        setSuccessMessage('Account group added.');
      }

      setGroupDialogOpen(false);
      await loadAll();
    });
  };

  const onDeleteGroup = async (group: GlGroup) => {
    const confirmed = await confirm({
      title: 'Delete Account Group',
      description: 'This account group will be removed if dependency checks pass.',
      detail: group.groupName,
      confirmLabel: 'Delete Group',
    });
    if (!confirmed) {
      return;
    }

    await withBusy(async () => {
      await deleteGlGroup(group.groupName);
      setSuccessMessage(`Group ${group.groupName} deleted.`);
      await loadAll();
    });
  };

  const onSaveSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await withBusy(async () => {
      if (!Number.isFinite(sectionForm.sectionId) || sectionForm.sectionId <= 0) {
        throw new Error('Section ID must be a positive integer.');
      }
      if (sectionForm.sectionName.trim() === '') {
        throw new Error('Section Name is required.');
      }

      if (sectionForm.selectedSectionId === null) {
        await createGlSection({
          sectionId: Number(sectionForm.sectionId),
          sectionName: sectionForm.sectionName.trim(),
        });
        setSuccessMessage('Account section added.');
      } else {
        await updateGlSection(sectionForm.selectedSectionId, sectionForm.sectionName.trim());
        setSuccessMessage('Account section updated.');
      }

      setSectionDialogOpen(false);
      await loadAll();
    });
  };

  const onDeleteSection = async (section: GlSection) => {
    const confirmed = await confirm({
      title: 'Delete Account Section',
      description: 'This account section will be removed if dependency checks pass.',
      detail: `${section.sectionId} - ${section.sectionName}`,
      confirmLabel: 'Delete Section',
    });
    if (!confirmed) {
      return;
    }

    await withBusy(async () => {
      await deleteGlSection(section.sectionId);
      setSuccessMessage(`Section ${section.sectionId} deleted.`);
      await loadAll();
    });
  };

  const onChangeCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await withBusy(async () => {
      if (changeCodeForm.oldAccountCode.trim() === '' || changeCodeForm.newAccountCode.trim() === '') {
        throw new Error('Both old and new account code values are required.');
      }

      await changeGlAccountCode(
        changeCodeForm.oldAccountCode.trim().toUpperCase(),
        changeCodeForm.newAccountCode.trim().toUpperCase()
      );

      setChangeCodeDialogOpen(false);
      setChangeCodeForm({ oldAccountCode: '', newAccountCode: '' });
      setSuccessMessage('GL account code changed.');
      await loadAll();
    });
  };

  const onImportCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await withBusy(async () => {
      if (!importFile) {
        throw new Error('Please choose a CSV file.');
      }

      await importGlAccountsCsv(importFile);
      setImportDialogOpen(false);
      setImportFile(null);
      setSuccessMessage('Chart of accounts imported.');
      await loadAll();
    });
  };

  const onMoveGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await withBusy(async () => {
      if (moveGroupForm.originalAccountGroup.trim() === '' || moveGroupForm.destinyAccountGroup.trim() === '') {
        throw new Error('Original and destination group are required.');
      }

      await moveGlGroup(moveGroupForm.originalAccountGroup, moveGroupForm.destinyAccountGroup);
      setMoveGroupDialogOpen(false);
      setMoveGroupForm({ originalAccountGroup: '', destinyAccountGroup: '' });
      setSuccessMessage('Group accounts moved successfully.');
      await loadAll();
    });
  };

  const accountColumns: AdvancedTableColumn<GlAccount>[] = useMemo(() => {
    return [
      {
        id: 'accountCode',
        header: 'Account Code',
        accessor: (row) => row.accountCode,
        width: 140,
      },
      {
        id: 'accountName',
        header: 'Account Name',
        accessor: (row) => row.accountName,
        width: 280,
      },
      {
        id: 'groupName',
        header: 'Group',
        accessor: (row) => row.groupName,
        width: 190,
      },
      {
        id: 'accountTypeLabel',
        header: 'P/L or B/S',
        accessor: (row) => row.accountTypeLabel,
        width: 140,
      },
      {
        id: 'cashFlowsActivityName',
        header: 'Cash Flow Activity',
        accessor: (row) => row.cashFlowsActivityName,
        width: 200,
      },
      {
        id: 'balance',
        header: 'Balance',
        accessor: (row) => row.balance,
        exportValue: (row) => row.balance,
        cell: (row) => <span className="font-mono">{formatCurrency(row.balance, glSettings)}</span>,
        width: 170,
      },
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        filterable: false,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => beginEditAccount(row)}
              className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void onDeleteAccount(row)}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        ),
        width: 150,
      },
    ];
  }, [glSettings, onDeleteAccount]);

  const groupColumns: AdvancedTableColumn<GlGroup>[] = useMemo(() => {
    return [
      {
        id: 'groupName',
        header: 'Group Name',
        accessor: (row) => row.groupName,
        width: 210,
      },
      {
        id: 'sectionName',
        header: 'Section',
        accessor: (row) => row.sectionName,
        width: 170,
      },
      {
        id: 'sequenceInTB',
        header: 'Sequence In TB',
        accessor: (row) => row.sequenceInTB,
        width: 130,
      },
      {
        id: 'pandLLabel',
        header: 'Profit/Loss',
        accessor: (row) => row.pandLLabel,
        width: 120,
      },
      {
        id: 'parentGroupName',
        header: 'Parent Group',
        accessor: (row) => row.parentGroupName,
        width: 180,
      },
      {
        id: 'accountCount',
        header: 'Accounts',
        accessor: (row) => row.accountCount,
        width: 110,
      },
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        filterable: false,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => beginEditGroup(row)}
              className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void onDeleteGroup(row)}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        ),
        width: 150,
      },
    ];
  }, [onDeleteGroup]);

  const sectionColumns: AdvancedTableColumn<GlSection>[] = useMemo(() => {
    return [
      {
        id: 'sectionId',
        header: 'Section Number',
        accessor: (row) => row.sectionId,
        width: 130,
      },
      {
        id: 'sectionName',
        header: 'Section Description',
        accessor: (row) => row.sectionName,
        width: 280,
      },
      {
        id: 'groupCount',
        header: 'Group Count',
        accessor: (row) => row.groupCount,
        width: 130,
      },
      {
        id: 'restricted',
        header: 'Restricted',
        accessor: (row) => (row.restricted ? 'Yes' : 'No'),
        width: 120,
      },
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        filterable: false,
        cell: (row) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => beginEditSection(row)}
              className="rounded-md border border-brand-200 px-2 py-1 text-xs text-brand-700 hover:bg-brand-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void onDeleteSection(row)}
              disabled={row.restricted}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        ),
        width: 150,
      },
    ];
  }, [onDeleteSection]);

  const salesStatusLabel = salesHealthy === null ? 'Not Checked' : salesHealthy ? 'Healthy' : 'Unavailable';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">General Ledger Account Management</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Maintain GL accounts, account groups, and account sections.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {glSettings.companyName} • Currency: {glSettings.currencyCode} ({glSettings.currencyDecimalPlaces} decimals)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void loadAll()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {activeView === 'accounts' ? (
            <>
              <Button variant="secondary" onClick={() => setChangeCodeDialogOpen(true)}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Change Code
              </Button>
              <Button variant="secondary" onClick={() => setImportDialogOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import CSV
              </Button>
              <Button onClick={beginCreateAccount}>
                <Plus className="mr-2 h-4 w-4" />
                Add Account
              </Button>
            </>
          ) : null}
          {activeView === 'groups' ? (
            <>
              <Button variant="secondary" onClick={() => setMoveGroupDialogOpen(true)}>
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                Move Group
              </Button>
              <Button onClick={beginCreateGroup}>
                <Plus className="mr-2 h-4 w-4" />
                Add Group
              </Button>
            </>
          ) : null}
          {activeView === 'sections' ? (
            <Button onClick={beginCreateSection}>
              <Plus className="mr-2 h-4 w-4" />
              Add Section
            </Button>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <Card className="border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30">
          <div className="flex items-start gap-3 text-red-800 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <p className="text-sm">{errorMessage}</p>
          </div>
        </Card>
      ) : null}

      {successMessage ? (
        <Card className="border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start gap-3 text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <p className="text-sm">{successMessage}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Total Accounts</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{accountsMeta?.summary.accounts ?? accounts.length}</p>
            </div>
            <Wallet className="h-6 w-6 text-brand-500" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Account Groups</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{groups.length}</p>
            </div>
            <FolderTree className="h-6 w-6 text-brand-500" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Account Sections</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{sections.length}</p>
            </div>
            <Layers className="h-6 w-6 text-brand-500" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Sales Module</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{salesStatusLabel}</p>
            </div>
            <ShieldCheck className={`h-6 w-6 ${salesHealthy ? 'text-emerald-500' : 'text-amber-500'}`} />
          </div>
          <button
            type="button"
            onClick={() => void checkSalesModuleHealth()}
            className="mt-3 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline dark:text-brand-300"
          >
            {salesStatusChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Check Sales Module
          </button>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveView('accounts')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeView === 'accounts'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Accounts View
          </button>
          <button
            type="button"
            onClick={() => setActiveView('groups')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeView === 'groups'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Account Groups View
          </button>
          <button
            type="button"
            onClick={() => setActiveView('sections')}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              activeView === 'sections'
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            Account Sections View
          </button>
        </div>
      </Card>

      {activeView === 'accounts' ? (
        <Card>
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
            <input
              type="text"
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Search account code, name or group"
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
            <SearchableSelect
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="">All groups</option>
              {lookups.groups.map((group) => (
                <option key={group.groupName} value={group.groupName}>
                  {group.groupName}
                </option>
              ))}
            </SearchableSelect>
            <SearchableSelect
              value={accountTypeFilter}
              onChange={(event) => setAccountTypeFilter(event.target.value)}
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="all">All account types</option>
              <option value="0">Balance Sheet</option>
              <option value="1">Profit/Loss</option>
            </SearchableSelect>
            <SearchableSelect
              value={cashFlowFilter}
              onChange={(event) => setCashFlowFilter(event.target.value)}
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            >
              <option value="all">All cash flow activities</option>
              {lookups.cashFlowActivities.map((activity) => (
                <option key={activity.value} value={String(activity.value)}>
                  {activity.label}
                </option>
              ))}
            </SearchableSelect>
          </div>

          <AdvancedTable
            tableId="gl-accounts-view"
            columns={accountColumns}
            rows={filteredAccounts}
            rowKey={(row) => row.accountCode}
            loading={loading}
            loadingMessage="Loading general ledger accounts..."
            emptyMessage="No general ledger accounts found."
          />
        </Card>
      ) : null}

      {activeView === 'groups' ? (
        <Card>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              type="text"
              value={groupSearch}
              onChange={(event) => setGroupSearch(event.target.value)}
              placeholder="Search group name, section or parent"
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <AdvancedTable
            tableId="gl-account-groups-view"
            columns={groupColumns}
            rows={filteredGroups}
            rowKey={(row) => row.groupName}
            loading={loading}
            loadingMessage="Loading account groups..."
            emptyMessage="No account groups found."
          />
        </Card>
      ) : null}

      {activeView === 'sections' ? (
        <Card>
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              type="text"
              value={sectionSearch}
              onChange={(event) => setSectionSearch(event.target.value)}
              placeholder="Search section number or description"
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
            />
          </div>

          <AdvancedTable
            tableId="gl-account-sections-view"
            columns={sectionColumns}
            rows={filteredSections}
            rowKey={(row) => String(row.sectionId)}
            loading={loading}
            loadingMessage="Loading account sections..."
            emptyMessage="No account sections found."
          />
        </Card>
      ) : null}

      <Modal
        isOpen={accountDialogOpen}
        onClose={() => {
          if (busy) return;
          setEditingAccountCode(null);
          setAccountDialogOpen(false);
        }}
        title={editingAccountCode ? 'Edit GL Account' : 'Add GL Account'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setAccountDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="coa-account-form" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Account
            </Button>
          </>
        }
      >
        <form id="coa-account-form" className="space-y-4" onSubmit={(event) => void onSaveAccount(event)}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Account Code</span>
              <input
                value={accountForm.accountCode}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, accountCode: event.target.value }))}
                disabled={editingAccountCode !== null}
                maxLength={20}
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2 disabled:bg-gray-100"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Account Name</span>
              <input
                value={accountForm.accountName}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, accountName: event.target.value }))}
                maxLength={50}
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Account Group</span>
              <SearchableSelect
                value={accountForm.groupName}
                onChange={(event) => setAccountForm((prev) => ({ ...prev, groupName: event.target.value }))}
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              >
                <option value="">Select group</option>
                {lookups.groups.map((group) => (
                  <option key={group.groupName} value={group.groupName}>
                    {group.groupName}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Cash Flows Activity</span>
              <SearchableSelect
                value={String(accountForm.cashFlowsActivity)}
                onChange={(event) =>
                  setAccountForm((prev) => ({ ...prev, cashFlowsActivity: Number(event.target.value) }))
                }
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              >
                {lookups.cashFlowActivities.map((activity) => (
                  <option key={activity.value} value={activity.value}>
                    {activity.label}
                  </option>
                ))}
              </SearchableSelect>
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={groupDialogOpen}
        onClose={() => !busy && setGroupDialogOpen(false)}
        title={groupForm.selectedGroupName ? 'Edit Account Group' : 'Add Account Group'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="coa-group-form" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Group
            </Button>
          </>
        }
      >
        <form id="coa-group-form" className="space-y-4" onSubmit={(event) => void onSaveGroup(event)}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Group Name</span>
              <input
                value={groupForm.groupName}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, groupName: event.target.value }))}
                maxLength={20}
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Parent Group</span>
              <SearchableSelect
                value={groupForm.parentGroupName}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, parentGroupName: event.target.value }))}
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              >
                <option value="">Top-level group</option>
                {groups
                  .filter((group) => group.groupName !== groupForm.selectedGroupName)
                  .map((group) => (
                    <option key={group.groupName} value={group.groupName}>
                      {group.groupName}
                    </option>
                  ))}
              </SearchableSelect>
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Section In Accounts</span>
              <SearchableSelect
                value={String(groupForm.sectionInAccounts)}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, sectionInAccounts: Number(event.target.value) }))}
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              >
                {lookups.sections.map((section) => (
                  <option key={section.sectionId} value={section.sectionId}>
                    {section.sectionId} - {section.sectionName}
                  </option>
                ))}
              </SearchableSelect>
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Sequence In TB</span>
              <input
                type="number"
                min={0}
                max={10000}
                value={String(groupForm.sequenceInTB)}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, sequenceInTB: Number(event.target.value) }))}
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <span>Profit and Loss</span>
              <SearchableSelect
                value={String(groupForm.pandL)}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, pandL: Number(event.target.value) }))}
                required
                className="w-full rounded-lg border border-brand-200 px-3 py-2"
              >
                <option value="1">Yes</option>
                <option value="0">No</option>
              </SearchableSelect>
            </label>
          </div>

          {groupForm.parentGroupName ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
              Child groups inherit sequence, section and P/L flags from the parent group.
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        isOpen={sectionDialogOpen}
        onClose={() => !busy && setSectionDialogOpen(false)}
        title={sectionForm.selectedSectionId === null ? 'Add Account Section' : 'Edit Account Section'}
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setSectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="coa-section-form" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Section
            </Button>
          </>
        }
      >
        <form id="coa-section-form" className="space-y-4" onSubmit={(event) => void onSaveSection(event)}>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <span>Section Number</span>
            <input
              type="number"
              min={1}
              max={99999}
              value={String(sectionForm.sectionId || '')}
              onChange={(event) => setSectionForm((prev) => ({ ...prev, sectionId: Number(event.target.value) }))}
              disabled={sectionForm.selectedSectionId !== null}
              required
              className="w-full rounded-lg border border-brand-200 px-3 py-2 disabled:bg-gray-100"
            />
          </label>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <span>Section Description</span>
            <input
              value={sectionForm.sectionName}
              onChange={(event) => setSectionForm((prev) => ({ ...prev, sectionName: event.target.value }))}
              maxLength={255}
              required
              className="w-full rounded-lg border border-brand-200 px-3 py-2"
            />
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={changeCodeDialogOpen}
        onClose={() => !busy && setChangeCodeDialogOpen(false)}
        title="Change GL Account Code"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setChangeCodeDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="coa-change-code-form" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Process
            </Button>
          </>
        }
      >
        <form id="coa-change-code-form" className="space-y-4" onSubmit={(event) => void onChangeCode(event)}>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <span>Existing GL Account Code</span>
            <input
              value={changeCodeForm.oldAccountCode}
              onChange={(event) =>
                setChangeCodeForm((prev) => ({ ...prev, oldAccountCode: event.target.value }))
              }
              maxLength={20}
              required
              className="w-full rounded-lg border border-brand-200 px-3 py-2"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <span>New GL Account Code</span>
            <input
              value={changeCodeForm.newAccountCode}
              onChange={(event) =>
                setChangeCodeForm((prev) => ({ ...prev, newAccountCode: event.target.value }))
              }
              maxLength={20}
              required
              className="w-full rounded-lg border border-brand-200 px-3 py-2"
            />
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={importDialogOpen}
        onClose={() => !busy && setImportDialogOpen(false)}
        title="Import Chart of Accounts CSV"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="coa-import-form" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import
            </Button>
          </>
        }
      >
        <form id="coa-import-form" className="space-y-4" onSubmit={(event) => void onImportCsv(event)}>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-slate-800 dark:text-gray-200">
            CSV header must be exactly: <strong>Account Code, Description, Account Group</strong>
          </div>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <span>Upload file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              required
              className="w-full rounded-lg border border-brand-200 px-3 py-2"
            />
          </label>
        </form>
      </Modal>

      <Modal
        isOpen={moveGroupDialogOpen}
        onClose={() => !busy && setMoveGroupDialogOpen(false)}
        title="Move Accounts Between Groups"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={() => setMoveGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="coa-move-group-form" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Move Group
            </Button>
          </>
        }
      >
        <form id="coa-move-group-form" className="space-y-4" onSubmit={(event) => void onMoveGroup(event)}>
          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <span>Original Account Group</span>
            <SearchableSelect
              value={moveGroupForm.originalAccountGroup}
              onChange={(event) =>
                setMoveGroupForm((prev) => ({ ...prev, originalAccountGroup: event.target.value }))
              }
              required
              className="w-full rounded-lg border border-brand-200 px-3 py-2"
            >
              <option value="">Select original group</option>
              {groups.map((group) => (
                <option key={group.groupName} value={group.groupName}>
                  {group.groupName}
                </option>
              ))}
            </SearchableSelect>
          </label>

          <label className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <span>Destination Account Group</span>
            <SearchableSelect
              value={moveGroupForm.destinyAccountGroup}
              onChange={(event) =>
                setMoveGroupForm((prev) => ({ ...prev, destinyAccountGroup: event.target.value }))
              }
              required
              className="w-full rounded-lg border border-brand-200 px-3 py-2"
            >
              <option value="">Select destination group</option>
              {groups
                .filter((group) => group.groupName !== moveGroupForm.originalAccountGroup)
                .map((group) => (
                  <option key={group.groupName} value={group.groupName}>
                    {group.groupName}
                  </option>
                ))}
            </SearchableSelect>
          </label>
        </form>
      </Modal>
      {confirmationDialog}
    </div>
  );
}
