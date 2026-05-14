import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  deleteGeneralLedgerSetupRecord,
  fetchGeneralLedgerSetup,
  saveGeneralLedgerSetupRecord,
} from '../data/generalLedgerSetupApi';
import type {
  GeneralLedgerSetupForm,
  GeneralLedgerSetupPayload,
  GeneralLedgerSetupTab,
  SetupLookupOption,
} from '../types/generalLedgerSetup';

interface GeneralLedgerSetupProps {
  initialTab?: GeneralLedgerSetupTab;
}

type SetupRow = Record<string, unknown>;
type FieldType = 'text' | 'number' | 'checkbox' | 'account' | 'currency' | 'invoice-mode';

interface FieldDefinition {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  readOnlyOnEdit?: boolean;
  placeholder?: string;
}

interface TabDefinition {
  id: GeneralLedgerSetupTab;
  label: string;
  title: string;
  description: string;
  idField: string;
  addLabel: string;
  readOnly?: boolean;
  fields: FieldDefinition[];
}

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'bank-accounts',
    label: 'Bank Accounts',
    title: 'Bank Accounts',
    description: 'Maintain bank account setup without payment and matching activity.',
    idField: 'accountCode',
    addLabel: 'Add Bank Account',
    fields: [
      { name: 'accountCode', label: 'GL account', type: 'account', required: true, readOnlyOnEdit: true },
      { name: 'currencyCode', label: 'Currency', type: 'currency', required: true },
      { name: 'bankAccountName', label: 'Bank account name', type: 'text', required: true },
      { name: 'bankAccountCode', label: 'Bank account code', type: 'text' },
      { name: 'bankAccountNumber', label: 'Bank account number', type: 'text' },
      { name: 'bankAddress', label: 'Bank address', type: 'text' },
      { name: 'importFormat', label: 'Import format', type: 'text' },
      { name: 'invoiceMode', label: 'Invoice mode', type: 'invoice-mode', required: true },
    ],
  },
  {
    id: 'currencies',
    label: 'Currencies',
    title: 'Currency Maintenance',
    description: 'Maintain trading currencies, exchange rates, and decimal settings.',
    idField: 'code',
    addLabel: 'Add Currency',
    fields: [
      { name: 'code', label: 'Currency code', type: 'text', required: true, readOnlyOnEdit: true, placeholder: 'TZS' },
      { name: 'name', label: 'Currency name', type: 'text', required: true },
      { name: 'country', label: 'Country', type: 'text' },
      { name: 'hundredsName', label: 'Hundreds name', type: 'text' },
      { name: 'decimalPlaces', label: 'Decimal places', type: 'number', required: true },
      { name: 'rate', label: 'Exchange rate', type: 'number', required: true },
      { name: 'webcart', label: 'Available in web cart', type: 'checkbox' },
    ],
  },
  {
    id: 'tax-authorities',
    label: 'Tax Authorities',
    title: 'Tax Authorities and Rates',
    description: 'Maintain tax authorities and the GL accounts used for sales and purchase tax.',
    idField: 'taxId',
    addLabel: 'Add Tax Authority',
    fields: [
      { name: 'description', label: 'Description', type: 'text', required: true },
      { name: 'salesTaxAccountCode', label: 'Sales tax GL account', type: 'account', required: true },
      { name: 'purchaseTaxAccountCode', label: 'Purchase tax GL account', type: 'account', required: true },
      { name: 'bank', label: 'Bank', type: 'text' },
      { name: 'bankAccountType', label: 'Bank account type', type: 'text' },
      { name: 'bankAccount', label: 'Bank account', type: 'text' },
      { name: 'bankSwift', label: 'Bank swift', type: 'text' },
    ],
  },
  {
    id: 'tax-groups',
    label: 'Tax Groups',
    title: 'Tax Group Maintenance',
    description: 'Maintain tax groups used by customers and suppliers.',
    idField: 'taxGroupId',
    addLabel: 'Add Tax Group',
    fields: [{ name: 'description', label: 'Description', type: 'text', required: true }],
  },
  {
    id: 'tax-provinces',
    label: 'Tax Provinces',
    title: 'Dispatch Tax Provinces',
    description: 'Maintain tax provinces used by dispatch and location setup.',
    idField: 'taxProvinceId',
    addLabel: 'Add Tax Province',
    fields: [{ name: 'name', label: 'Province name', type: 'text', required: true }],
  },
  {
    id: 'tax-categories',
    label: 'Tax Categories',
    title: 'Tax Categories',
    description: 'Maintain tax categories used by stock and sales tax rules.',
    idField: 'taxCategoryId',
    addLabel: 'Add Tax Category',
    fields: [{ name: 'name', label: 'Category name', type: 'text', required: true }],
  },
  {
    id: 'periods',
    label: 'Periods',
    title: 'Accounting Periods',
    description: 'Review accounting periods. Periods are maintained automatically.',
    idField: 'periodNo',
    addLabel: '',
    readOnly: true,
    fields: [],
  },
];

function tabDefinition(tab: GeneralLedgerSetupTab): TabDefinition {
  return TAB_DEFINITIONS.find((definition) => definition.id === tab) ?? TAB_DEFINITIONS[0];
}

function rowId(row: SetupRow, definition: TabDefinition): string | number {
  const value = row[definition.idField];
  return typeof value === 'number' || typeof value === 'string' ? value : '';
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function invoiceModeLabel(value: unknown): string {
  const mode = Number(value);
  if (mode === 2) return 'Fallback Default';
  if (mode === 1) return 'Currency Default';
  return 'No';
}

function fieldDefault(field: FieldDefinition): string | number | boolean {
  if (field.type === 'checkbox') return true;
  if (field.type === 'number') return field.name === 'rate' ? 1 : 2;
  if (field.type === 'invoice-mode') return 0;
  return '';
}

function formFromRow(definition: TabDefinition, row?: SetupRow | null): GeneralLedgerSetupForm {
  const form: GeneralLedgerSetupForm = {};
  definition.fields.forEach((field) => {
    form[field.name] = row ? (row[field.name] as string | number | boolean | undefined) ?? fieldDefault(field) : fieldDefault(field);
  });
  return form;
}

function entityRows(payload: GeneralLedgerSetupPayload, tab: GeneralLedgerSetupTab): SetupRow[] {
  if (tab === 'bank-accounts') return payload.bankAccounts as unknown as SetupRow[];
  if (tab === 'currencies') return payload.currencies as unknown as SetupRow[];
  if (tab === 'tax-authorities') return payload.taxAuthorities as unknown as SetupRow[];
  if (tab === 'tax-groups') return payload.taxGroups as unknown as SetupRow[];
  if (tab === 'tax-provinces') return payload.taxProvinces as unknown as SetupRow[];
  if (tab === 'tax-categories') return payload.taxCategories as unknown as SetupRow[];
  return payload.periods as unknown as SetupRow[];
}

function optionLabel(option: SetupLookupOption): string {
  return `${option.code} - ${option.name}`;
}

export function GeneralLedgerSetup({ initialTab = 'bank-accounts' }: GeneralLedgerSetupProps) {
  const [activeTab, setActiveTab] = useState<GeneralLedgerSetupTab>(initialTab);
  const [payload, setPayload] = useState<GeneralLedgerSetupPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SetupRow | null>(null);
  const [form, setForm] = useState<GeneralLedgerSetupForm>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const definition = tabDefinition(activeTab);

  const loadSetup = async () => {
    setLoading(true);
    setError('');
    try {
      setPayload(await fetchGeneralLedgerSetup());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'General ledger setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
  }, []);

  const rows = useMemo(() => (payload ? entityRows(payload, activeTab) : []), [activeTab, payload]);
  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => asText(value).toLowerCase().includes(needle)));
  }, [rows, searchTerm]);

  const stats = payload?.stats ?? {
    bankAccounts: 0,
    currencies: 0,
    taxAuthorities: 0,
    taxGroups: 0,
    taxProvinces: 0,
    taxCategories: 0,
    periods: 0,
  };

  const accountOptions = useMemo(
    () => (payload?.lookups.accounts ?? []).map((option) => ({ value: option.code, label: optionLabel(option), searchText: `${option.code} ${option.name}` })),
    [payload]
  );
  const currencyOptions = useMemo(
    () => (payload?.lookups.currencies ?? []).map((option) => ({ value: option.code, label: optionLabel(option), searchText: `${option.code} ${option.name}` })),
    [payload]
  );

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm(formFromRow(definition));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (row: SetupRow) => {
    setEditingRow(row);
    setForm(formFromRow(definition, row));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const updateField = (name: string, value: string | number | boolean) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const id = editingRow ? rowId(editingRow, definition) : undefined;
      const response = await saveGeneralLedgerSetupRecord(activeTab, form, id);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingRow(null);
      setMessage(response.message ?? 'Setup record saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Setup record could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: SetupRow) => {
    const id = rowId(row, definition);
    const confirmed = await confirm({
      title: `Delete ${definition.title}`,
      description: 'This setup record will be removed only if no related records use it.',
      detail: String(id),
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setDeletingId(id);
    setError('');
    setMessage('');
    try {
      const response = await deleteGeneralLedgerSetupRecord(activeTab, id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Setup record deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Setup record could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo<AdvancedTableColumn<SetupRow>[]>(() => {
    const baseColumns: AdvancedTableColumn<SetupRow>[] = [];

    if (activeTab === 'bank-accounts') {
      baseColumns.push(
        { id: 'accountCode', header: 'GL Account', accessor: (row) => `${row.accountCode} ${row.accountName}`, cell: (row) => <span className="font-mono">{asText(row.accountCode)}</span>, width: 140 },
        { id: 'bankAccountName', header: 'Bank Account', accessor: (row) => `${row.bankAccountName} ${row.bankAccountNumber}`, width: 260 },
        { id: 'currencyCode', header: 'Currency', accessor: (row) => row.currencyCode, width: 110 },
        { id: 'invoiceMode', header: 'Invoice Mode', accessor: (row) => invoiceModeLabel(row.invoiceMode), width: 160 }
      );
    } else if (activeTab === 'currencies') {
      baseColumns.push(
        { id: 'code', header: 'Code', accessor: (row) => row.code, cell: (row) => <span className="font-mono">{asText(row.code)}</span>, width: 100 },
        { id: 'name', header: 'Currency', accessor: (row) => `${row.name} ${row.country}`, width: 220 },
        { id: 'rate', header: 'Rate', accessor: (row) => Number(row.rate ?? 0), width: 120 },
        { id: 'decimalPlaces', header: 'Decimals', accessor: (row) => row.decimalPlaces, width: 110 },
        { id: 'webcart', header: 'Web Cart', accessor: (row) => (row.webcart ? 'Yes' : 'No'), width: 110 }
      );
    } else if (activeTab === 'tax-authorities') {
      baseColumns.push(
        { id: 'taxId', header: 'ID', accessor: (row) => row.taxId, width: 80 },
        { id: 'description', header: 'Description', accessor: (row) => row.description, width: 220 },
        { id: 'salesTaxAccountCode', header: 'Sales Tax Account', accessor: (row) => `${row.salesTaxAccountCode} ${row.salesTaxAccountName}`, width: 240 },
        { id: 'purchaseTaxAccountCode', header: 'Purchase Tax Account', accessor: (row) => `${row.purchaseTaxAccountCode} ${row.purchaseTaxAccountName}`, width: 250 }
      );
    } else if (activeTab === 'tax-groups') {
      baseColumns.push(
        { id: 'taxGroupId', header: 'ID', accessor: (row) => row.taxGroupId, width: 90 },
        { id: 'description', header: 'Description', accessor: (row) => row.description, width: 300 }
      );
    } else if (activeTab === 'tax-provinces') {
      baseColumns.push(
        { id: 'taxProvinceId', header: 'ID', accessor: (row) => row.taxProvinceId, width: 90 },
        { id: 'name', header: 'Province', accessor: (row) => row.name, width: 300 }
      );
    } else if (activeTab === 'tax-categories') {
      baseColumns.push(
        { id: 'taxCategoryId', header: 'ID', accessor: (row) => row.taxCategoryId, width: 90 },
        { id: 'name', header: 'Category', accessor: (row) => row.name, width: 300 }
      );
    } else {
      baseColumns.push(
        { id: 'periodNo', header: 'Period', accessor: (row) => row.periodNo, width: 120 },
        { id: 'lastDateInPeriod', header: 'Last Date', accessor: (row) => row.lastDateInPeriod, width: 200 }
      );
    }

    if (!definition.readOnly) {
      baseColumns.push({
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        sortable: false,
        filterable: false,
        width: 120,
        cell: (row) => {
          const id = rowId(row, definition);
          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => openEditDialog(row)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text"
                title="Edit"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void deleteRow(row)}
                disabled={deletingId === id}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                title="Delete"
                aria-label="Delete"
              >
                {deletingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          );
        },
      });
    }

    return baseColumns;
  }, [activeTab, definition, deletingId]);

  const renderField = (field: FieldDefinition) => {
    const value = form[field.name];
    const disabled = Boolean(editingRow && field.readOnlyOnEdit);

    if (field.type === 'account') {
      return (
        <SearchableSelect
          value={asText(value)}
          onChange={(nextValue) => updateField(field.name, String(nextValue))}
          options={accountOptions}
          disabled={disabled}
          required={field.required}
          placeholder="Find GL account..."
        />
      );
    }

    if (field.type === 'currency') {
      return (
        <SearchableSelect
          value={asText(value)}
          onChange={(nextValue) => updateField(field.name, String(nextValue))}
          options={currencyOptions}
          required={field.required}
          placeholder="Find currency..."
        />
      );
    }

    if (field.type === 'invoice-mode') {
      return (
        <SearchableSelect
          value={asText(value)}
          onChange={(nextValue) => updateField(field.name, Number(nextValue))}
          options={[
            { value: 0, label: 'No' },
            { value: 1, label: 'Currency Default' },
            { value: 2, label: 'Fallback Default' },
          ]}
          required={field.required}
        />
      );
    }

    if (field.type === 'checkbox') {
      return (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateField(field.name, event.target.checked)}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 items-center justify-center rounded-md border ${
              value ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border-strong bg-akiva-surface-raised text-transparent'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
          {field.label}
        </label>
      );
    }

    return (
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        step={field.name === 'rate' ? '0.0000000001' : undefined}
        min={field.type === 'number' ? 0 : undefined}
        value={asText(value)}
        onChange={(event) => updateField(field.name, field.type === 'number' ? Number(event.target.value) : event.target.value)}
        required={field.required}
        disabled={disabled}
        placeholder={field.placeholder}
        className={inputClassName}
      />
    );
  };

  if (loading && !payload) {
    return (
      <div className="flex min-h-80 items-center justify-center text-akiva-text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading general ledger setup...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <Landmark className="h-3.5 w-3.5" />
                  General ledger setup
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <Layers3 className="h-3.5 w-3.5" />
                  {definition.label}
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                General Ledger Setup
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">{definition.description}</p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" onClick={() => void loadSetup()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {!definition.readOnly ? (
                <Button onClick={openCreateDialog} disabled={!payload}>
                  <Plus className="mr-2 h-4 w-4" />
                  {definition.addLabel}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {(message || error) && (
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${
                  error
                    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                }`}
              >
                {error || message}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
              {TAB_DEFINITIONS.map((tab) => {
                const count =
                  tab.id === 'bank-accounts'
                    ? stats.bankAccounts
                    : tab.id === 'currencies'
                      ? stats.currencies
                      : tab.id === 'tax-authorities'
                        ? stats.taxAuthorities
                        : tab.id === 'tax-groups'
                          ? stats.taxGroups
                          : tab.id === 'tax-provinces'
                            ? stats.taxProvinces
                            : tab.id === 'tax-categories'
                              ? stats.taxCategories
                              : stats.periods;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setSearchTerm('');
                    }}
                    className={`rounded-lg border bg-akiva-surface-raised p-3 text-left shadow-sm transition hover:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent ${
                      activeTab === tab.id ? 'border-akiva-accent ring-2 ring-akiva-accent/25' : 'border-akiva-border'
                    }`}
                  >
                    <p className="truncate text-xs font-medium text-akiva-text-muted">{tab.label}</p>
                    <p className="mt-1 text-xl font-bold text-akiva-text">{count}</p>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <h2 className="text-base font-semibold text-akiva-text">{definition.title}</h2>
                  <p className="mt-1 text-xs text-akiva-text-muted">{definition.readOnly ? 'Read-only setup inquiry.' : 'Use the table actions to maintain this setup area.'}</p>
                </div>
                <div className="relative lg:w-96">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder={`Search ${definition.label.toLowerCase()}...`}
                    className={`${inputClassName} pl-10`}
                  />
                </div>
              </div>

              {definition.readOnly ? (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Accounting periods are generated by the system. Review them here before posting or reporting.
                </div>
              ) : null}

              <AdvancedTable
                tableId={`configuration-gl-setup-${activeTab}`}
                columns={columns}
                rows={filteredRows}
                rowKey={(row) => String(rowId(row, definition))}
                loading={loading}
                loadingMessage={`Loading ${definition.label.toLowerCase()}...`}
                emptyMessage={`No ${definition.label.toLowerCase()} found.`}
                initialPageSize={25}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </div>
          </div>
        </section>

        <Modal
          isOpen={dialogOpen}
          onClose={() => !saving && setDialogOpen(false)}
          title={editingRow ? `Edit ${definition.title}` : definition.addLabel}
          size="lg"
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" form="gl-setup-form" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </>
          }
        >
          <form id="gl-setup-form" onSubmit={submitForm} className="space-y-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
              {definition.fields.map((field) => (
                <label key={field.name} className={field.type === 'checkbox' ? 'block self-end' : 'space-y-1.5'}>
                  {field.type !== 'checkbox' ? (
                    <span className="text-xs font-semibold uppercase text-akiva-text-muted">{field.label}</span>
                  ) : null}
                  {renderField(field)}
                </label>
              ))}
            </div>
          </form>
        </Modal>
        {confirmationDialog}
      </div>
    </div>
  );
}
