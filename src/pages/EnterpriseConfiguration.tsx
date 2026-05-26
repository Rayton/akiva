import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Database,
  Gauge,
  Landmark,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  deleteEnterpriseConfigurationRecord,
  fetchEnterpriseConfiguration,
  saveEnterpriseConfigurationRecord,
} from '../data/enterpriseConfigurationApi';
import type {
  EnterpriseConfigurationPayload,
  EnterpriseEntityKey,
  EnterpriseFieldDefinition,
  EnterpriseForm,
  EnterpriseLookupOption,
  EnterpriseRow,
} from '../types/enterpriseConfiguration';

const ENTITY_DESCRIPTIONS: Record<EnterpriseEntityKey, string> = {
  'fiscal-years': 'Fiscal calendars, year status, base currency, and retained earnings controls.',
  'fiscal-periods': 'Period open, close, lock, adjustment, and temporary reopen governance.',
  'financial-dimensions': 'Dimension definitions for department, project, grant, donor, fund, and activity reporting.',
  'dimension-values': 'Maintained dimension members used for multi-dimensional accounting and reporting.',
  donors: 'Donor and funder master data for NGO and grant reporting.',
  grants: 'Grant master data, dates, currency, budget envelope, and restriction notes.',
  'currency-rates': 'Effective exchange rates for transaction, budget, and period-end FX processes.',
  'tax-rate-versions': 'Effective-dated VAT/tax rates by authority, category, region, and tax type.',
  'allocation-keys': 'Distribution key headers for recurring and manual allocation accounting.',
  'allocation-key-lines': 'Allocation splits by percentage, fixed amount, account, and dimension.',
  'report-templates': 'Financial, grant, budget, cash-flow, and tax reporting layout definitions.',
  'audit-policies': 'Audit retention and tracking policies for critical enterprise data.',
  'dashboard-templates': 'Role dashboard templates for configurable management workspaces.',
  'notification-rules': 'Event-driven email, in-app, SMS, reminder, and escalation rules.',
};

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function statusClass(value: unknown): string {
  const status = asText(value).toLowerCase();
  if (['open', 'active', 'approved'].includes(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900';
  if (['closed', 'locked', 'inactive'].includes(status)) return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
  if (['draft', 'pending', 'adjustment'].includes(status)) return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900';
  return 'bg-akiva-surface-muted text-akiva-text-muted ring-akiva-border';
}

function fieldDefault(field: EnterpriseFieldDefinition): string | number | boolean | null {
  if (field.type === 'boolean') return true;
  if (field.options?.length) return field.options[0];
  if (field.name === 'yearEndMonth') return 12;
  if (field.name === 'periodNo') return 1;
  if (field.type === 'number' || field.type === 'money') return 0;
  if (field.type === 'rate') return 1;
  return '';
}

function formFromRow(fields: EnterpriseFieldDefinition[], row?: EnterpriseRow | null): EnterpriseForm {
  const form: EnterpriseForm = {};
  fields.forEach((field) => {
    form[field.name] = row ? (row[field.name] as string | number | boolean | null | undefined) ?? fieldDefault(field) : fieldDefault(field);
  });
  return form;
}

function lookupOptions(payload: EnterpriseConfigurationPayload | null, type: string): EnterpriseLookupOption[] {
  if (!payload) return [];
  if (type === 'account') return payload.lookups.accounts;
  if (type === 'currency') return payload.lookups.currencies;
  if (type === 'fiscal-year') return payload.lookups.fiscalYears;
  if (type === 'dimension') return payload.lookups.dimensions;
  if (type === 'dimension-value') return payload.lookups.dimensionValues;
  if (type === 'donor') return payload.lookups.donors;
  if (type === 'allocation-key') return payload.lookups.allocationKeys;
  if (type === 'tax-authority') return payload.lookups.taxAuthorities;
  if (type === 'tax-category') return payload.lookups.taxCategories;
  if (type === 'tax-province') return payload.lookups.taxProvinces;
  return [];
}

function selectOptions(payload: EnterpriseConfigurationPayload | null, field: EnterpriseFieldDefinition) {
  if (field.options?.length) {
    return field.options.map((option) => ({ value: option, label: option.replace(/_/g, ' ') }));
  }
  return lookupOptions(payload, field.type).map((option) => ({
    value: option.value,
    label: option.code ? `${option.code} - ${option.label}` : option.label,
    searchText: `${option.value} ${option.label} ${option.code ?? ''}`,
  }));
}

function labelForValue(payload: EnterpriseConfigurationPayload | null, field: EnterpriseFieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (field.options?.length) return asText(value);
  const match = lookupOptions(payload, field.type).find((option) => String(option.value) === String(value));
  if (!match) return asText(value);
  return match.code ? `${match.code} - ${match.label}` : match.label;
}

function visibleFields(fields: EnterpriseFieldDefinition[]): EnterpriseFieldDefinition[] {
  const compact = fields.filter((field) => !['textarea'].includes(field.type));
  return compact.slice(0, 6);
}

interface EnterpriseConfigurationProps {
  initialEntity?: EnterpriseEntityKey;
  pageTitle?: string;
}

export function EnterpriseConfiguration({ initialEntity = 'fiscal-periods', pageTitle }: EnterpriseConfigurationProps) {
  const [activeEntity, setActiveEntity] = useState<EnterpriseEntityKey>(initialEntity);
  const [payload, setPayload] = useState<EnterpriseConfigurationPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<EnterpriseRow | null>(null);
  const [form, setForm] = useState<EnterpriseForm>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadConfiguration = async () => {
    setLoading(true);
    setError('');
    try {
      setPayload(await fetchEnterpriseConfiguration());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Enterprise configuration could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfiguration();
  }, []);

  useEffect(() => {
    setActiveEntity(initialEntity);
    setSearchTerm('');
    setDialogOpen(false);
    setEditingRow(null);
    setMessage('');
    setError('');
  }, [initialEntity]);

  const definition = payload?.definitions?.[activeEntity];
  const fields = definition?.fields ?? [];
  const rows = payload?.entities?.[activeEntity] ?? [];
  const title = pageTitle ?? definition?.label ?? 'Enterprise Configuration';
  const description = activeEntity === 'grants' && pageTitle === 'Grants and Donors'
    ? 'Grant master data connected to donor and funder records for NGO and donor-funded reporting.'
    : ENTITY_DESCRIPTIONS[activeEntity];
  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => asText(value).toLowerCase().includes(needle)));
  }, [rows, searchTerm]);

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm(formFromRow(fields));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (row: EnterpriseRow) => {
    setEditingRow(row);
    setForm(formFromRow(fields, row));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const updateField = (name: string, value: string | number | boolean | null) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await saveEnterpriseConfigurationRecord(activeEntity, form, editingRow?.id);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingRow(null);
      setMessage(response.message ?? 'Enterprise configuration record saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Enterprise configuration record could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: EnterpriseRow) => {
    const confirmed = await confirm({
      title: `Delete ${definition?.singular ?? 'record'}`,
      description: 'This configuration record will be removed only if no related records use it.',
      detail: `ID ${row.id}`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setDeletingId(row.id);
    setError('');
    setMessage('');
    try {
      const response = await deleteEnterpriseConfigurationRecord(activeEntity, row.id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Enterprise configuration record deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Enterprise configuration record could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo<AdvancedTableColumn<EnterpriseRow>[]>(() => {
    const tableFields = visibleFields(fields);
    const baseColumns: AdvancedTableColumn<EnterpriseRow>[] = [
      {
        id: 'id',
        header: 'ID',
        accessor: (row) => row.id,
        cell: (row) => <span className="font-mono text-xs">{row.id}</span>,
        width: 90,
      },
      ...tableFields.map((field): AdvancedTableColumn<EnterpriseRow> => ({
        id: field.name,
        header: field.label,
        accessor: (row) => row[field.name],
        cell: (row) => {
          const value = row[field.name];
          if (field.name === 'status') {
            return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold capitalize ring-1 ${statusClass(value)}`}>{asText(value).replace(/_/g, ' ')}</span>;
          }
          if (field.type === 'boolean') {
            return <span>{value ? 'Yes' : 'No'}</span>;
          }
          return <span>{labelForValue(payload, field, value)}</span>;
        },
        width: field.name === 'name' ? 240 : 170,
      })),
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        sortable: false,
        filterable: false,
        width: 120,
        cell: (row) => (
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
              disabled={deletingId === row.id}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
              title="Delete"
              aria-label="Delete"
            >
              {deletingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        ),
      },
    ];

    return baseColumns;
  }, [deletingId, fields, payload]);

  const renderField = (field: EnterpriseFieldDefinition) => {
    const value = form[field.name];
    const options = selectOptions(payload, field);
    const isLookup = options.length > 0 || ['account', 'currency', 'fiscal-year', 'dimension', 'dimension-value', 'donor', 'allocation-key', 'tax-authority', 'tax-category', 'tax-province'].includes(field.type);

    if (field.type === 'boolean') {
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

    if (isLookup) {
      return (
        <SearchableSelect
          value={asText(value)}
          onChange={(nextValue) => updateField(field.name, nextValue)}
          options={options}
          required={field.required}
          placeholder={`Select ${field.label.toLowerCase()}...`}
        />
      );
    }

    if (field.type === 'textarea') {
      return (
        <textarea
          value={asText(value)}
          onChange={(event) => updateField(field.name, event.target.value)}
          required={field.required}
          rows={4}
          className={`${inputClassName} resize-y`}
        />
      );
    }

    const inputType = field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : ['number', 'money', 'rate'].includes(field.type) ? 'number' : 'text';

    return (
      <input
        type={inputType}
        step={field.type === 'rate' ? '0.00000001' : ['money', 'number'].includes(field.type) ? '0.01' : undefined}
        value={asText(value)}
        onChange={(event) => updateField(field.name, ['number', 'money', 'rate'].includes(field.type) ? Number(event.target.value) : event.target.value)}
        required={field.required}
        className={inputClassName}
      />
    );
  };

  const controls = payload?.controls;

  if (loading && !payload) {
    return (
      <div className="flex min-h-80 items-center justify-center text-akiva-text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading enterprise configuration...
      </div>
    );
  }

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="akiva-frame overflow-hidden rounded-[28px] backdrop-blur">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Enterprise controls
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <Layers3 className="h-3.5 w-3.5" />
                  {definition?.label ?? 'Configuration'}
                </span>
              </div>
              <h1 className="mt-4 akiva-page-title">
                {title}
              </h1>
              <p className="akiva-page-subtitle">
                {description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" onClick={() => void loadConfiguration()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={openCreateDialog} disabled={!definition}>
                <Plus className="mr-2 h-4 w-4" />
                Add {definition?.singular ?? 'Record'}
              </Button>
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

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
              {[
                { label: 'Period Lock', value: controls?.fiscalPeriodEnforcement, icon: Landmark },
                { label: 'Dimensions', value: controls?.dimensionCaptureReady, icon: Database },
                { label: 'Tax Versions', value: controls?.taxRateVersioningReady, icon: Gauge },
                { label: 'FX History', value: controls?.fxRateHistoryReady, icon: Bell },
              ].map((control) => {
                const Icon = control.icon;
                return (
                  <article key={control.label} className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-akiva-text-muted">{control.label}</p>
                      <Icon className="h-4 w-4 text-akiva-accent" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-akiva-text">{control.value ? 'Ready' : 'Pending'}</p>
                  </article>
                );
              })}
            </div>

            <div>
              <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
                <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div>
                    <h2 className="text-base font-semibold text-akiva-text">{definition?.label ?? 'Configuration'}</h2>
                    <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{description}</p>
                  </div>
                  <div className="relative lg:w-96">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder={`Search ${definition?.label.toLowerCase() ?? 'records'}...`}
                      className={`${inputClassName} pl-10`}
                    />
                  </div>
                </div>

                <AdvancedTable
                  tableId={`enterprise-configuration-${activeEntity}`}
                  columns={columns}
                  rows={filteredRows}
                  rowKey={(row) => String(row.id)}
                  emptyMessage="No configuration records found."
                  density="compact"
                  maxTableHeight="min(68vh, 720px)"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`${editingRow ? 'Edit' : 'Add'} ${definition?.singular ?? 'Record'}`}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="enterprise-configuration-form" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        }
      >
        <form id="enterprise-configuration-form" onSubmit={submitForm} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <label key={field.name} className={`block text-sm ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}>
              <span className="mb-1.5 block font-medium text-akiva-text">
                {field.label}
                {field.required ? <span className="text-red-500"> *</span> : null}
              </span>
              {renderField(field)}
            </label>
          ))}
        </form>
      </Modal>

      {confirmationDialog}
    </div>
  );
}
