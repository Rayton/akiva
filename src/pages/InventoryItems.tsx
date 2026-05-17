import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Barcode, Boxes, CheckCircle2, Layers3, Loader2, PackagePlus, Pencil, Plus, RefreshCw, Save, Search, ShieldCheck, Tags } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { fetchInventoryItems, saveInventoryCategory, saveInventoryItem, saveInventoryItemType } from '../data/inventoryItemsApi';
import type { InventoryCategoryForm, InventoryItem, InventoryItemForm, InventoryItemLookupOption, InventoryItemsPayload, InventoryItemTypeForm } from '../types/inventoryItems';

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const checkboxClassName =
  'flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 text-sm font-medium text-akiva-text';

const iconButtonClassName =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-muted text-akiva-text transition hover:bg-akiva-accent hover:text-white focus:outline-none focus:ring-2 focus:ring-akiva-accent/30';

const categoryStockTypeOptions = [
  { value: 'F', label: 'F - Finished product' },
  { value: 'D', label: 'D - Dummy item' },
  { value: 'L', label: 'L - Labour' },
  { value: 'M', label: 'M - Raw materials' },
];

function firstCode(options: InventoryItemLookupOption[] | undefined, fallback = ''): string {
  return options?.[0]?.code ? String(options[0].code) : fallback;
}

function emptyForm(payload?: InventoryItemsPayload | null): InventoryItemForm {
  return {
    stockId: '',
    description: '',
    longDescription: '',
    categoryId: firstCode(payload?.lookups.categories),
    units: firstCode(payload?.lookups.units, 'each'),
    mbFlag: firstCode(payload?.lookups.itemTypes, 'B'),
    taxCatId: Number(firstCode(payload?.lookups.taxCategories, '1')),
    discountCategory: '',
    controlled: false,
    serialised: false,
    perishable: false,
    discontinued: false,
    decimalPlaces: 0,
    eoq: 0,
    volume: 0,
    grossWeight: 0,
    kgs: 0,
    netWeight: 0,
    barcode: '',
  };
}

function emptyCategoryForm(payload?: InventoryItemsPayload | null): InventoryCategoryForm {
  return {
    code: '',
    name: '',
    stockType: 'F',
    defaultTaxCategoryId: Number(firstCode(payload?.lookups.taxCategories, '1')),
  };
}

function emptyItemTypeForm(): InventoryItemTypeForm {
  return {
    code: '',
    name: '',
  };
}

function formFromItem(item: InventoryItem): InventoryItemForm {
  return {
    stockId: item.stockId,
    description: item.description,
    longDescription: item.longDescription,
    categoryId: item.categoryId,
    units: item.units,
    mbFlag: item.mbFlag,
    taxCatId: item.taxCatId,
    discountCategory: item.discountCategory,
    controlled: item.controlled,
    serialised: item.serialised,
    perishable: item.perishable,
    discontinued: item.discontinued,
    decimalPlaces: item.decimalPlaces,
    eoq: item.eoq,
    volume: item.volume,
    grossWeight: item.grossWeight,
    kgs: item.kgs,
    netWeight: item.netWeight,
    barcode: item.barcode,
  };
}

function optionLabel(option: InventoryItemLookupOption): string {
  return option.code === option.name ? option.name : `${option.code} - ${option.name}`;
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function statusLabel(item: InventoryItem): string {
  return item.discontinued ? 'Inactive' : 'Active';
}

function formatNumber(value: number, decimals = 2): string {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function toNumber(value: string): number {
  if (value.trim() === '') return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function badgeClass(value: 'active' | 'muted' | 'warning'): string {
  if (value === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  if (value === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text-muted';
}

export function InventoryItems() {
  const [payload, setPayload] = useState<InventoryItemsPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryItemForm>(() => emptyForm(null));
  const [categoryForm, setCategoryForm] = useState<InventoryCategoryForm>(() => emptyCategoryForm(null));
  const [typeForm, setTypeForm] = useState<InventoryItemTypeForm>(() => emptyItemTypeForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [quickError, setQuickError] = useState('');

  const loadItems = async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchInventoryItems();
      setPayload(nextPayload);
      setForm((previous) => ({
        ...previous,
        categoryId: previous.categoryId || firstCode(nextPayload.lookups.categories),
        units: previous.units || firstCode(nextPayload.lookups.units, 'each'),
        mbFlag: previous.mbFlag || firstCode(nextPayload.lookups.itemTypes, 'B'),
        taxCatId: previous.taxCatId || Number(firstCode(nextPayload.lookups.taxCategories, '1')),
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Inventory items could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  useEffect(() => {
    document.title = 'Inventory Items Maintenance | Akiva';
  }, []);

  const stats = payload?.stats ?? {
    totalItems: 0,
    activeItems: 0,
    discontinuedItems: 0,
    controlledItems: 0,
    serialisedItems: 0,
    categories: 0,
  };

  const categoryOptions = useMemo(
    () => [
      { value: 'all', label: 'All categories' },
      ...(payload?.lookups.categories ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    ],
    [payload]
  );

  const formCategoryOptions = useMemo(
    () => (payload?.lookups.categories ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    [payload]
  );

  const unitOptions = useMemo(
    () => (payload?.lookups.units ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    [payload]
  );

  const typeOptions = useMemo(
    () => [
      { value: 'all', label: 'All item types' },
      ...(payload?.lookups.itemTypes ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    ],
    [payload]
  );

  const formTypeOptions = useMemo(
    () => (payload?.lookups.itemTypes ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    [payload]
  );

  const taxCategoryOptions = useMemo(
    () => (payload?.lookups.taxCategories ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    [payload]
  );

  const discountCategoryOptions = useMemo(
    () => [
      { value: '', label: 'No discount category' },
      ...(payload?.lookups.discountCategories ?? []).map((option) => ({ value: option.code, label: optionLabel(option) })),
    ],
    [payload]
  );

  const filteredItems = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return (payload?.items ?? []).filter((item) => {
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) return false;
      if (typeFilter !== 'all' && item.mbFlag !== typeFilter) return false;
      if (statusFilter === 'active' && item.discontinued) return false;
      if (statusFilter === 'inactive' && !item.discontinued) return false;
      if (statusFilter === 'controlled' && !item.controlled) return false;
      if (statusFilter === 'serialised' && !item.serialised) return false;
      if (!needle) return true;

      return [
        item.stockId,
        item.description,
        item.longDescription,
        item.categoryId,
        item.categoryName,
        item.units,
        item.mbFlag,
        item.mbFlagLabel,
        item.taxCategoryName,
        item.discountCategoryName,
        item.barcode,
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [categoryFilter, payload, searchTerm, statusFilter, typeFilter]);

  const setField = <K extends keyof InventoryItemForm>(fieldName: K, value: InventoryItemForm[K]) => {
    setForm((previous) => ({ ...previous, [fieldName]: value }));
  };

  const setCategoryField = <K extends keyof InventoryCategoryForm>(fieldName: K, value: InventoryCategoryForm[K]) => {
    setCategoryForm((previous) => ({ ...previous, [fieldName]: value }));
  };

  const setTypeField = <K extends keyof InventoryItemTypeForm>(fieldName: K, value: InventoryItemTypeForm[K]) => {
    setTypeForm((previous) => ({ ...previous, [fieldName]: value }));
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setForm(emptyForm(payload));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item);
    setForm(formFromItem(item));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openCategoryDialog = () => {
    setCategoryForm(emptyCategoryForm(payload));
    setQuickError('');
    setCategoryDialogOpen(true);
  };

  const openTypeDialog = () => {
    setTypeForm(emptyItemTypeForm());
    setQuickError('');
    setTypeDialogOpen(true);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await saveInventoryItem(form, editingItem?.stockId);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingItem(null);
      setForm(emptyForm(response.data ?? payload));
      setMessage(response.message ?? 'Inventory item saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Inventory item could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submitCategoryForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuickSaving(true);
    setQuickError('');
    try {
      const response = await saveInventoryCategory(categoryForm);
      if (response.data) setPayload(response.data);
      const selectedId = String(response.data?.selectedId ?? categoryForm.code).toUpperCase();
      setField('categoryId', selectedId);
      setCategoryDialogOpen(false);
      setCategoryForm(emptyCategoryForm(response.data ?? payload));
    } catch (saveError) {
      setQuickError(saveError instanceof Error ? saveError.message : 'Inventory category could not be saved.');
    } finally {
      setQuickSaving(false);
    }
  };

  const submitItemTypeForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuickSaving(true);
    setQuickError('');
    try {
      const response = await saveInventoryItemType(typeForm);
      if (response.data) setPayload(response.data);
      const selectedId = String(response.data?.selectedId ?? typeForm.code).toUpperCase();
      setField('mbFlag', selectedId);
      setTypeDialogOpen(false);
      setTypeForm(emptyItemTypeForm());
    } catch (saveError) {
      setQuickError(saveError instanceof Error ? saveError.message : 'Inventory item type could not be saved.');
    } finally {
      setQuickSaving(false);
    }
  };

  const columns = useMemo<AdvancedTableColumn<InventoryItem>[]>(
    () => [
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        cell: (item) => (
          <Button size="sm" variant="secondary" onClick={() => openEditDialog(item)}>
            <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Edit</span>
          </Button>
        ),
        width: 120,
        sortable: false,
        filterable: false,
        sticky: 'right',
      },
      { id: 'stockId', header: 'Code', accessor: (item) => item.stockId, width: 150 },
      { id: 'description', header: 'Description', accessor: (item) => item.description, width: 280 },
      { id: 'category', header: 'Category', accessor: (item) => `${item.categoryId} ${item.categoryName}`, cell: (item) => item.categoryName, width: 220 },
      { id: 'type', header: 'Type', accessor: (item) => item.mbFlagLabel, width: 170 },
      { id: 'units', header: 'Units', accessor: (item) => item.units, width: 120 },
      { id: 'onHand', header: 'On Hand', accessor: (item) => item.onHand, cell: (item) => formatNumber(item.onHand, item.decimalPlaces), align: 'right', width: 130 },
      { id: 'tax', header: 'Tax', accessor: (item) => item.taxCategoryName, width: 180 },
      { id: 'discount', header: 'Discount', accessor: (item) => item.discountCategoryName || item.discountCategory, width: 160 },
      { id: 'controlled', header: 'Controlled', accessor: (item) => yesNo(item.controlled), width: 130 },
      { id: 'serialised', header: 'Serialised', accessor: (item) => yesNo(item.serialised), width: 130 },
      { id: 'decimalPlaces', header: 'Decimals', accessor: (item) => item.decimalPlaces, align: 'right', width: 120 },
      {
        id: 'status',
        header: 'Status',
        accessor: statusLabel,
        cell: (item) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(item.discontinued ? 'warning' : 'active')}`}>
            {statusLabel(item)}
          </span>
        ),
        width: 140,
      },
      { id: 'priceCount', header: 'Prices', accessor: (item) => item.priceCount, align: 'right', width: 100 },
      { id: 'supplierCount', header: 'Suppliers', accessor: (item) => item.supplierCount, align: 'right', width: 120 },
    ],
    []
  );

  const renderNumberField = (name: keyof InventoryItemForm, label: string, step = '0.0001') => (
    <label className="block text-sm font-medium text-akiva-text">
      {label}
      <input
        className={`${inputClassName} mt-1`}
        type="number"
        min="0"
        step={step}
        value={String(form[name] ?? 0)}
        onChange={(event) => setField(name, toNumber(event.target.value) as never)}
      />
    </label>
  );

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Inventory Maintenance</p>
              <h1 className="mt-1 text-xl font-bold leading-tight text-akiva-text sm:text-[1.625rem]">Inventory Items</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                Maintain stock master records, item classification, controls, units, and tax setup.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadItems()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
              <Button onClick={openCreateDialog}>
                <span className="inline-flex items-center justify-center gap-2"><PackagePlus className="h-4 w-4" />Add Item</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
            {[
              ['Total Items', stats.totalItems, Boxes],
              ['Active', stats.activeItems, CheckCircle2],
              ['Inactive', stats.discontinuedItems, Layers3],
              ['Controlled', stats.controlledItems, ShieldCheck],
              ['Serialised', stats.serialisedItems, Barcode],
              ['Categories', stats.categories, Tags],
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
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(10rem,14rem))]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder="Search code, name, category, barcode..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <SearchableSelect value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} inputClassName={inputClassName} placeholder="Category" />
            <SearchableSelect value={typeFilter} onChange={setTypeFilter} options={typeOptions} inputClassName={inputClassName} placeholder="Type" />
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'controlled', label: 'Controlled' },
                { value: 'serialised', label: 'Serialised' },
              ]}
              inputClassName={inputClassName}
              placeholder="Status"
            />
          </div>

          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          <div className="mt-4 flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">Item List</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                {filteredItems.length.toLocaleString()} shown from {(payload?.items.length ?? 0).toLocaleString()} loaded records
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId="inventory-items-maintenance"
              columns={columns}
              rows={filteredItems}
              rowKey={(item) => item.stockId}
              loading={loading}
              loadingMessage="Loading inventory items..."
              emptyMessage="No inventory items found."
              initialPageSize={25}
              initialScroll="left"
            />
          </div>
        </section>
      </div>

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`${editingItem ? 'Edit' : 'Add'} Inventory Item`}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="inventory-item-form" disabled={saving}>
              <span className="inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </span>
            </Button>
          </>
        }
      >
        <form id="inventory-item-form" onSubmit={submitForm} className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-akiva-text">
              Item code
              <input className={`${inputClassName} mt-1 uppercase`} value={form.stockId} onChange={(event) => setField('stockId', event.target.value)} maxLength={20} required disabled={Boolean(editingItem)} />
            </label>
            <div className="block text-sm font-medium text-akiva-text">
              Item type
              <div className="mt-1 flex gap-2">
                <SearchableSelect className="min-w-0 flex-1" value={form.mbFlag} onChange={(value) => setField('mbFlag', value)} options={formTypeOptions} required />
                <button type="button" className={iconButtonClassName} onClick={openTypeDialog} title="Add item type" aria-label="Add item type">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="block text-sm font-medium text-akiva-text">
              Status
              <div className="mt-1 grid grid-cols-2 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface p-1">
                {[
                  ['active', 'Active'],
                  ['inactive', 'Inactive'],
                ].map(([value, label]) => {
                  const selected = (form.discontinued ? 'inactive' : 'active') === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setField('discontinued', value === 'inactive')}
                      className={`min-h-9 rounded-md px-3 text-sm font-semibold transition ${
                        selected
                          ? value === 'active'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-amber-600 text-white shadow-sm'
                          : 'text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="block text-sm font-medium text-akiva-text sm:col-span-2">
              Description
              <input className={`${inputClassName} mt-1`} value={form.description} onChange={(event) => setField('description', event.target.value)} maxLength={50} required />
            </label>
            <label className="block text-sm font-medium text-akiva-text sm:col-span-2">
              Long description
              <textarea className={`${inputClassName} mt-1 min-h-24 resize-y`} value={form.longDescription} onChange={(event) => setField('longDescription', event.target.value)} />
            </label>
            <div className="block text-sm font-medium text-akiva-text">
              Category
              <div className="mt-1 flex gap-2">
                <SearchableSelect className="min-w-0 flex-1" value={form.categoryId} onChange={(value) => setField('categoryId', value)} options={formCategoryOptions} required />
                <button type="button" className={iconButtonClassName} onClick={openCategoryDialog} title="Add category" aria-label="Add category">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <label className="block text-sm font-medium text-akiva-text">
              Units
              <SearchableSelect className="mt-1" value={form.units} onChange={(value) => setField('units', value)} options={unitOptions} required />
            </label>
            <label className="block text-sm font-medium text-akiva-text">
              Tax category
              <SearchableSelect className="mt-1" value={String(form.taxCatId)} onChange={(value) => setField('taxCatId', Number(value))} options={taxCategoryOptions} required />
            </label>
            <label className="block text-sm font-medium text-akiva-text">
              Discount category
              <SearchableSelect className="mt-1" value={form.discountCategory} onChange={(value) => setField('discountCategory', value)} options={discountCategoryOptions} />
            </label>
            <label className="block text-sm font-medium text-akiva-text sm:col-span-2">
              Barcode
              <input className={`${inputClassName} mt-1`} value={form.barcode} onChange={(event) => setField('barcode', event.target.value)} maxLength={50} />
            </label>
          </div>

          <div className="grid content-start gap-4 sm:grid-cols-2">
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              {[
                ['controlled', 'Batch controlled'],
                ['serialised', 'Serialised'],
                ['perishable', 'Perishable'],
              ].map(([fieldName, label]) => (
                <label key={fieldName} className={checkboxClassName}>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
                    checked={Boolean(form[fieldName as keyof InventoryItemForm])}
                    onChange={(event) => setField(fieldName as keyof InventoryItemForm, event.target.checked as never)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {renderNumberField('decimalPlaces', 'Decimal places', '1')}
            {renderNumberField('eoq', 'Economic order quantity')}
            {renderNumberField('volume', 'Volume')}
            {renderNumberField('grossWeight', 'Gross weight')}
            {renderNumberField('kgs', 'Kgs')}
            {renderNumberField('netWeight', 'Net weight')}

            {editingItem ? (
              <div className="sm:col-span-2 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 text-sm text-akiva-text-muted">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide">On hand</p>
                    <p className="mt-1 text-base font-semibold text-akiva-text">{formatNumber(editingItem.onHand, editingItem.decimalPlaces)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide">Price rows</p>
                    <p className="mt-1 text-base font-semibold text-akiva-text">{editingItem.priceCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide">Suppliers</p>
                    <p className="mt-1 text-base font-semibold text-akiva-text">{editingItem.supplierCount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        title="Add Inventory Category"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCategoryDialogOpen(false)} disabled={quickSaving}>Cancel</Button>
            <Button type="submit" form="inventory-category-form" disabled={quickSaving}>
              <span className="inline-flex items-center justify-center gap-2">
                {quickSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </span>
            </Button>
          </>
        }
      >
        <form id="inventory-category-form" onSubmit={submitCategoryForm} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-akiva-text">
            Code
            <input className={`${inputClassName} mt-1 uppercase`} value={categoryForm.code} onChange={(event) => setCategoryField('code', event.target.value)} maxLength={6} required />
          </label>
          <label className="block text-sm font-medium text-akiva-text">
            Category name
            <input className={`${inputClassName} mt-1`} value={categoryForm.name} onChange={(event) => setCategoryField('name', event.target.value)} maxLength={20} required />
          </label>
          <label className="block text-sm font-medium text-akiva-text">
            Stock type
            <SearchableSelect className="mt-1" value={categoryForm.stockType} onChange={(value) => setCategoryField('stockType', value)} options={categoryStockTypeOptions} required />
          </label>
          <label className="block text-sm font-medium text-akiva-text">
            Default tax category
            <SearchableSelect className="mt-1" value={String(categoryForm.defaultTaxCategoryId)} onChange={(value) => setCategoryField('defaultTaxCategoryId', Number(value))} options={taxCategoryOptions} required />
          </label>
          {quickError ? <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{quickError}</div> : null}
        </form>
      </Modal>

      <Modal
        isOpen={typeDialogOpen}
        onClose={() => setTypeDialogOpen(false)}
        title="Add Item Type"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTypeDialogOpen(false)} disabled={quickSaving}>Cancel</Button>
            <Button type="submit" form="inventory-item-type-form" disabled={quickSaving}>
              <span className="inline-flex items-center justify-center gap-2">
                {quickSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </span>
            </Button>
          </>
        }
      >
        <form id="inventory-item-type-form" onSubmit={submitItemTypeForm} className="grid gap-4">
          <label className="block text-sm font-medium text-akiva-text">
            Code
            <input className={`${inputClassName} mt-1 uppercase`} value={typeForm.code} onChange={(event) => setTypeField('code', event.target.value)} maxLength={1} required />
          </label>
          <label className="block text-sm font-medium text-akiva-text">
            Type name
            <input className={`${inputClassName} mt-1`} value={typeForm.name} onChange={(event) => setTypeField('name', event.target.value)} maxLength={50} required />
          </label>
          {quickError ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{quickError}</div> : null}
        </form>
      </Modal>
    </div>
  );
}
