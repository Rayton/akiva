import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, MapPin, Pencil, Plus, RefreshCw, Ruler, Save, Search, Tags, Trash2 } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { deleteInventorySetupRecord, fetchInventorySetup, saveInventorySetupRecord } from '../data/inventorySetupApi';
import type {
  DiscountCategory,
  InventoryLocation,
  InventoryLookupOption,
  InventorySetupForm,
  InventorySetupPayload,
  InventorySetupTab,
  StockCategory,
  UnitOfMeasure,
} from '../types/inventorySetup';

interface InventorySetupProps {
  initialTab?: InventorySetupTab;
}

type SetupRow = StockCategory | InventoryLocation | DiscountCategory | UnitOfMeasure;

interface TabDefinition {
  id: InventorySetupTab;
  label: string;
  singularLabel: string;
  title: string;
  description: string;
  addLabel: string;
}

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'stock-categories',
    label: 'Stock Categories',
    singularLabel: 'Stock category',
    title: 'Stock Categories',
    description: 'Maintain inventory category codes, stock type, default tax, and inventory GL accounts.',
    addLabel: 'Add Stock Category',
  },
  {
    id: 'locations',
    label: 'Locations',
    singularLabel: 'Location',
    title: 'Inventory Locations',
    description: 'Maintain stock locations, contact details, request flags, and invoicing availability.',
    addLabel: 'Add Location',
  },
  {
    id: 'discount-categories',
    label: 'Discount Categories',
    singularLabel: 'Discount category',
    title: 'Discount Categories',
    description: 'Maintain discount category codes used by stock items and discount matrix rules.',
    addLabel: 'Add Discount Category',
  },
  {
    id: 'units-of-measure',
    label: 'Units of Measure',
    singularLabel: 'Unit of measure',
    title: 'Units of Measure',
    description: 'Maintain inventory units used by stock master records.',
    addLabel: 'Add Unit',
  },
];

function tabDefinition(tab: InventorySetupTab): TabDefinition {
  return TAB_DEFINITIONS.find((definition) => definition.id === tab) ?? TAB_DEFINITIONS[0];
}

function isStockCategory(row: SetupRow): row is StockCategory {
  return 'stockType' in row;
}

function isLocation(row: SetupRow): row is InventoryLocation {
  return 'taxProvinceId' in row && 'allowInvoicing' in row;
}

function isDiscountCategory(row: SetupRow): row is DiscountCategory {
  return 'stockItemCount' in row;
}

function isUnit(row: SetupRow): row is UnitOfMeasure {
  return 'id' in row && !('code' in row);
}

function rowId(row: SetupRow): string | number {
  return isUnit(row) ? row.id : row.code;
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function optionLabel(option: InventoryLookupOption): string {
  return `${option.code} - ${option.name}`;
}

function emptyForm(payload?: InventorySetupPayload | null): InventorySetupForm {
  const firstAccount = payload?.lookups.accounts[0]?.code ?? '0';
  return {
    code: '',
    name: '',
    stockType: 'F',
    stockAct: firstAccount,
    adjustmentAct: firstAccount,
    issueAct: firstAccount,
    purchasePriceVarianceAct: firstAccount,
    materialUsageVarianceAct: firstAccount,
    wipAct: firstAccount,
    defaultTaxCategoryId: Number(payload?.lookups.taxCategories[0]?.code ?? 1),
    address1: '',
    address2: '',
    address3: '',
    address4: '',
    address5: '',
    address6: '',
    telephone: '',
    fax: '',
    email: '',
    contact: '',
    taxProvinceId: Number(payload?.lookups.taxProvinces[0]?.code ?? 1),
    managed: false,
    internalRequest: true,
    usedForWorkOrders: true,
    glAccountCode: firstAccount,
    allowInvoicing: true,
  };
}

function formFromRow(row: SetupRow, payload: InventorySetupPayload | null): InventorySetupForm {
  const base = emptyForm(payload);
  if (isStockCategory(row)) return { ...base, ...row };
  if (isLocation(row)) return { ...base, ...row };
  if (isDiscountCategory(row)) return { ...base, code: row.code, name: row.name };
  return { ...base, name: row.name };
}

function rowsForTab(payload: InventorySetupPayload | null, tab: InventorySetupTab): SetupRow[] {
  if (!payload) return [];
  if (tab === 'stock-categories') return payload.stockCategories;
  if (tab === 'locations') return payload.locations;
  if (tab === 'discount-categories') return payload.discountCategories;
  return payload.unitsOfMeasure;
}

function rowDisplay(row: SetupRow): string {
  return isUnit(row) ? `${row.id} - ${row.name}` : `${row.code} - ${row.name}`;
}

function deleteDescription(tab: InventorySetupTab): string {
  if (tab === 'stock-categories') return 'This category will be removed only if stock items and posting rules do not use it.';
  if (tab === 'locations') return 'This location will be removed only if stock balances, movements, users, and branches do not use it.';
  if (tab === 'discount-categories') return 'This discount category will be removed only if stock items and discount matrix rows do not use it.';
  return 'This unit will be removed only if stock items do not use it.';
}

export function InventorySetup({ initialTab = 'stock-categories' }: InventorySetupProps) {
  const [activeTab, setActiveTab] = useState<InventorySetupTab>(initialTab);
  const [payload, setPayload] = useState<InventorySetupPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SetupRow | null>(null);
  const [form, setForm] = useState<InventorySetupForm>(() => emptyForm(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  useEffect(() => {
    setActiveTab(initialTab);
    setSearchTerm('');
  }, [initialTab]);

  const definition = tabDefinition(activeTab);

  const loadSetup = async () => {
    setLoading(true);
    setError('');
    try {
      setPayload(await fetchInventorySetup());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Inventory setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
  }, []);

  const rows = useMemo(() => rowsForTab(payload, activeTab), [activeTab, payload]);
  const stats = payload?.stats ?? {
    stockCategories: 0,
    locations: 0,
    discountCategories: 0,
    unitsOfMeasure: 0,
    stockItems: 0,
  };

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const searchable = [
        rowDisplay(row),
        isStockCategory(row) ? `${row.stockType} ${row.stockAct} ${row.adjustmentAct} ${row.issueAct} ${row.defaultTaxCategoryId}` : '',
        isLocation(row) ? `${row.contact} ${row.email} ${row.telephone} ${row.address1} ${row.glAccountCode}` : '',
        isDiscountCategory(row) ? `${row.stockItemCount} ${row.discountMatrixCount}` : '',
      ].join(' ');
      return searchable.toLowerCase().includes(needle);
    });
  }, [rows, searchTerm]);

  const setField = <K extends keyof InventorySetupForm>(fieldName: K, value: InventorySetupForm[K]) => {
    setForm((previous) => ({ ...previous, [fieldName]: value }));
  };

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm(emptyForm(payload));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (row: SetupRow) => {
    setEditingRow(row);
    setForm(formFromRow(row, payload));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await saveInventorySetupRecord(activeTab, form, editingRow ? rowId(editingRow) : undefined);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingRow(null);
      setForm(emptyForm(payload));
      setMessage(response.message ?? `${definition.singularLabel} saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `${definition.singularLabel} could not be saved.`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: SetupRow) => {
    const id = rowId(row);
    const confirmed = await confirm({
      title: `Delete ${definition.singularLabel}`,
      description: deleteDescription(activeTab),
      detail: rowDisplay(row),
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setDeletingId(id);
    setError('');
    setMessage('');
    try {
      const response = await deleteInventorySetupRecord(activeTab, id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? `${definition.singularLabel} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `${definition.singularLabel} could not be deleted.`);
    } finally {
      setDeletingId('');
    }
  };

  const columns = useMemo<AdvancedTableColumn<SetupRow>[]>(() => {
    const actions: AdvancedTableColumn<SetupRow> = {
      id: 'actions',
      header: 'Actions',
      accessor: () => '',
      cell: (row) => {
        const id = rowId(row);
        return (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openEditDialog(row)}>
              <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Edit</span>
            </Button>
            <Button size="sm" variant="danger" disabled={deletingId === id} onClick={() => void deleteRow(row)}>
              <span className="inline-flex items-center gap-2">
                {deletingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </span>
            </Button>
          </div>
        );
      },
      width: 210,
      sortable: false,
      filterable: false,
    };

    if (activeTab === 'stock-categories') {
      return [
        { id: 'code', header: 'Code', accessor: (row) => (isStockCategory(row) ? row.code : ''), width: 110 },
        { id: 'name', header: 'Category', accessor: (row) => (isStockCategory(row) ? row.name : ''), width: 230 },
        { id: 'stockType', header: 'Stock Type', accessor: (row) => (isStockCategory(row) ? row.stockType : ''), width: 130 },
        { id: 'stockAct', header: 'Stock GL', accessor: (row) => (isStockCategory(row) ? row.stockAct : ''), width: 130 },
        { id: 'adjustmentAct', header: 'Adjustment GL', accessor: (row) => (isStockCategory(row) ? row.adjustmentAct : ''), width: 150 },
        { id: 'issueAct', header: 'Issue GL', accessor: (row) => (isStockCategory(row) ? row.issueAct : ''), width: 130 },
        { id: 'defaultTaxCategoryId', header: 'Tax Category', accessor: (row) => (isStockCategory(row) ? row.defaultTaxCategoryId : ''), align: 'right', width: 130 },
        actions,
      ];
    }

    if (activeTab === 'locations') {
      return [
        { id: 'code', header: 'Code', accessor: (row) => (isLocation(row) ? row.code : ''), width: 100 },
        { id: 'name', header: 'Location', accessor: (row) => (isLocation(row) ? row.name : ''), width: 260 },
        { id: 'contact', header: 'Contact', accessor: (row) => (isLocation(row) ? row.contact : ''), width: 180 },
        { id: 'telephone', header: 'Telephone', accessor: (row) => (isLocation(row) ? row.telephone : ''), width: 150 },
        { id: 'email', header: 'Email', accessor: (row) => (isLocation(row) ? row.email : ''), width: 220 },
        { id: 'allowInvoicing', header: 'Allow Invoicing', accessor: (row) => (isLocation(row) ? yesNo(row.allowInvoicing) : ''), width: 150 },
        { id: 'usedForWorkOrders', header: 'Work Orders', accessor: (row) => (isLocation(row) ? yesNo(row.usedForWorkOrders) : ''), width: 130 },
        actions,
      ];
    }

    if (activeTab === 'discount-categories') {
      return [
        { id: 'code', header: 'Code', accessor: (row) => (isDiscountCategory(row) ? row.code : ''), width: 110 },
        { id: 'name', header: 'Discount Category', accessor: (row) => (isDiscountCategory(row) ? row.name : ''), width: 260 },
        { id: 'stockItemCount', header: 'Stock Items', accessor: (row) => (isDiscountCategory(row) ? row.stockItemCount : 0), align: 'right', width: 130 },
        { id: 'discountMatrixCount', header: 'Matrix Rows', accessor: (row) => (isDiscountCategory(row) ? row.discountMatrixCount : 0), align: 'right', width: 130 },
        actions,
      ];
    }

    return [
      { id: 'id', header: 'ID', accessor: (row) => (isUnit(row) ? row.id : ''), align: 'right', width: 90 },
      { id: 'name', header: 'Unit', accessor: (row) => (isUnit(row) ? row.name : ''), width: 240 },
      actions,
    ];
  }, [activeTab, deletingId, payload]);

  const accountOptions = (payload?.lookups.accounts ?? []).map((option) => ({ value: option.code, label: optionLabel(option) }));
  const taxCategoryOptions = (payload?.lookups.taxCategories ?? []).map((option) => ({ value: option.code, label: optionLabel(option) }));
  const taxProvinceOptions = (payload?.lookups.taxProvinces ?? []).map((option) => ({ value: option.code, label: optionLabel(option) }));

  const renderAccountField = (name: keyof InventorySetupForm, label: string) => (
    <label className="block text-sm font-medium text-akiva-text">
      {label}
      <SearchableSelect className="mt-1" value={String(form[name] ?? '')} onChange={(value) => setField(name, value)} options={accountOptions} />
    </label>
  );

  const renderStockCategoryFields = () => (
    <>
      <label className="block text-sm font-medium text-akiva-text">
        Code
        <input className={`${inputClassName} mt-1`} value={form.code ?? ''} onChange={(event) => setField('code', event.target.value)} maxLength={6} required disabled={Boolean(editingRow)} />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Category name
        <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setField('name', event.target.value)} maxLength={20} required />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Stock type
        <select className={`${inputClassName} mt-1`} value={form.stockType ?? 'F'} onChange={(event) => setField('stockType', event.target.value)}>
          <option value="F">Finished goods / stock</option>
          <option value="D">Dummy item</option>
          <option value="L">Labour / service</option>
          <option value="M">Manufactured</option>
        </select>
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Default tax category
        <SearchableSelect className="mt-1" value={String(form.defaultTaxCategoryId ?? '')} onChange={(value) => setField('defaultTaxCategoryId', Number(value))} options={taxCategoryOptions} />
      </label>
      {renderAccountField('stockAct', 'Stock GL account')}
      {renderAccountField('adjustmentAct', 'Adjustment GL account')}
      {renderAccountField('issueAct', 'Issue GL account')}
      {renderAccountField('purchasePriceVarianceAct', 'Purchase price variance GL')}
      {renderAccountField('materialUsageVarianceAct', 'Material usage variance GL')}
      {renderAccountField('wipAct', 'WIP GL account')}
    </>
  );

  const renderLocationFields = () => (
    <>
      <label className="block text-sm font-medium text-akiva-text">
        Code
        <input className={`${inputClassName} mt-1`} value={form.code ?? ''} onChange={(event) => setField('code', event.target.value)} maxLength={5} required disabled={Boolean(editingRow)} />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Location name
        <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setField('name', event.target.value)} required />
      </label>
      {['address1', 'address2', 'address3', 'address4', 'address5', 'address6'].map((name, index) => (
        <label key={name} className="block text-sm font-medium text-akiva-text">
          Address {index + 1}
          <input className={`${inputClassName} mt-1`} value={String(form[name as keyof InventorySetupForm] ?? '')} onChange={(event) => setField(name as keyof InventorySetupForm, event.target.value)} />
        </label>
      ))}
      <label className="block text-sm font-medium text-akiva-text">
        Contact
        <input className={`${inputClassName} mt-1`} value={form.contact ?? ''} onChange={(event) => setField('contact', event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Telephone
        <input className={`${inputClassName} mt-1`} value={form.telephone ?? ''} onChange={(event) => setField('telephone', event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Email
        <input className={`${inputClassName} mt-1`} type="email" value={form.email ?? ''} onChange={(event) => setField('email', event.target.value)} />
      </label>
      <label className="block text-sm font-medium text-akiva-text">
        Tax province
        <SearchableSelect className="mt-1" value={String(form.taxProvinceId ?? '')} onChange={(value) => setField('taxProvinceId', Number(value))} options={taxProvinceOptions} />
      </label>
      {renderAccountField('glAccountCode', 'Location GL account')}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['managed', 'Managed location'],
          ['internalRequest', 'Internal requests'],
          ['usedForWorkOrders', 'Used for work orders'],
          ['allowInvoicing', 'Allow invoicing'],
        ].map(([fieldName, label]) => (
          <label key={fieldName} className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 text-sm font-medium text-akiva-text">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
              checked={Boolean(form[fieldName as keyof InventorySetupForm])}
              onChange={(event) => setField(fieldName as keyof InventorySetupForm, event.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
    </>
  );

  const renderSimpleFields = () => (
    <>
      {activeTab === 'discount-categories' ? (
        <label className="block text-sm font-medium text-akiva-text">
          Code
          <input className={`${inputClassName} mt-1`} value={form.code ?? ''} onChange={(event) => setField('code', event.target.value)} maxLength={2} required disabled={Boolean(editingRow)} />
        </label>
      ) : null}
      <label className="block text-sm font-medium text-akiva-text">
        {activeTab === 'discount-categories' ? 'Discount category name' : 'Unit name'}
        <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setField('name', event.target.value)} maxLength={activeTab === 'discount-categories' ? 40 : 15} required />
      </label>
    </>
  );

  const renderFormFields = () => {
    if (activeTab === 'stock-categories') return renderStockCategoryFields();
    if (activeTab === 'locations') return renderLocationFields();
    return renderSimpleFields();
  };

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Configuration</p>
              <h1 className="mt-1 text-2xl font-bold text-akiva-text sm:text-3xl">Inventory setup</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">{definition.description}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadSetup()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
              <Button onClick={openCreateDialog}>
                <span className="inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" />{definition.addLabel}</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
            {[
              ['Stock Categories', stats.stockCategories, Boxes],
              ['Locations', stats.locations, MapPin],
              ['Discount Categories', stats.discountCategories, Tags],
              ['Units', stats.unitsOfMeasure, Ruler],
              ['Stock Items', stats.stockItems, Boxes],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof Boxes;
              return (
                <div key={String(label)} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{String(label)}</p>
                    <StatIcon className="h-4 w-4 text-akiva-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-akiva-text">{Number(value).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {TAB_DEFINITIONS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-akiva-accent text-white shadow-sm'
                    : 'border border-akiva-border bg-akiva-surface text-akiva-text hover:bg-akiva-surface-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">{definition.title}</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">{rows.length.toLocaleString()} records</p>
            </div>
            <label className="relative block w-full min-[900px]:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder={`Search ${definition.label.toLowerCase()}...`} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
          </div>

          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId={`inventory-setup-${activeTab}`}
              columns={columns}
              rows={filteredRows}
              rowKey={(row) => String(rowId(row))}
              loading={loading}
              loadingMessage="Loading inventory setup..."
              emptyMessage={`No ${definition.label.toLowerCase()} found.`}
              initialPageSize={25}
            />
          </div>
        </section>
      </div>

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`${editingRow ? 'Edit' : 'Add'} ${definition.singularLabel}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="inventory-setup-form" disabled={saving}>
              <span className="inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </span>
            </Button>
          </>
        }
      >
        <form id="inventory-setup-form" onSubmit={submitForm} className="grid gap-4 sm:grid-cols-2">
          {renderFormFields()}
        </form>
      </Modal>

      {confirmationDialog}
    </div>
  );
}
