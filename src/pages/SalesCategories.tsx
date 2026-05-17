import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Layers3, Loader2, Pencil, Plus, RefreshCw, Save, Search, Tags, Trash2 } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { deleteSalesCategory, fetchSalesCategories, saveSalesCategory } from '../data/salesCategoriesApi';
import type { SalesCategoriesPayload, SalesCategory, SalesCategoryForm } from '../types/salesCategories';

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

function emptyForm(): SalesCategoryForm {
  return {
    name: '',
    parentId: 'root',
    active: true,
  };
}

function formFromCategory(category: SalesCategory): SalesCategoryForm {
  return {
    name: category.name,
    parentId: category.parentId === null ? 'root' : String(category.parentId),
    active: category.active,
  };
}

function statusLabel(category: SalesCategory): string {
  return category.active ? 'Active' : 'Inactive';
}

function statusBadgeClass(active: boolean): string {
  return active
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200';
}

function descendantIds(categories: SalesCategory[], id: number): Set<number> {
  const descendants = new Set<number>();
  let changed = true;
  while (changed) {
    changed = false;
    categories.forEach((category) => {
      if (category.parentId !== null && (category.parentId === id || descendants.has(category.parentId)) && !descendants.has(category.id)) {
        descendants.add(category.id);
        changed = true;
      }
    });
  }
  return descendants;
}

export function SalesCategories() {
  const [payload, setPayload] = useState<SalesCategoriesPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [parentFilter, setParentFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SalesCategory | null>(null);
  const [form, setForm] = useState<SalesCategoryForm>(() => emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      setPayload(await fetchSalesCategories());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Sales categories could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    document.title = 'Sales Categories | Akiva';
  }, []);

  const categories = payload?.categories ?? [];
  const stats = payload?.stats ?? { total: 0, active: 0, inactive: 0, productLinks: 0 };

  const parentOptions = useMemo(
    () => [
      { value: 'all', label: 'All parents' },
      { value: 'root', label: 'Root categories' },
      ...categories.map((category) => ({ value: String(category.id), label: category.path || category.name })),
    ],
    [categories]
  );

  const formParentOptions = useMemo(() => {
    const blocked = editingCategory ? descendantIds(categories, editingCategory.id) : new Set<number>();
    if (editingCategory) blocked.add(editingCategory.id);
    return [
      { value: 'root', label: 'Root category' },
      ...categories
        .filter((category) => !blocked.has(category.id))
        .map((category) => ({ value: String(category.id), label: category.path || category.name })),
    ];
  }, [categories, editingCategory]);

  const filteredCategories = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return categories.filter((category) => {
      if (statusFilter === 'active' && !category.active) return false;
      if (statusFilter === 'inactive' && category.active) return false;
      if (parentFilter === 'root' && category.parentId !== null) return false;
      if (parentFilter !== 'all' && parentFilter !== 'root' && String(category.parentId ?? '') !== parentFilter) return false;
      if (!needle) return true;

      return [
        category.id,
        category.name,
        category.parentName,
        category.path,
        statusLabel(category),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [categories, parentFilter, searchTerm, statusFilter]);

  const setField = <K extends keyof SalesCategoryForm>(fieldName: K, value: SalesCategoryForm[K]) => {
    setForm((previous) => ({ ...previous, [fieldName]: value }));
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setForm(emptyForm());
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (category: SalesCategory) => {
    setEditingCategory(category);
    setForm(formFromCategory(category));
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
      const response = await saveSalesCategory(form, editingCategory?.id);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingCategory(null);
      setForm(emptyForm());
      setMessage(response.message ?? 'Sales category saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Sales category could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (category: SalesCategory) => {
    const confirmed = await confirm({
      title: 'Delete Sales Category',
      description: 'The category will be removed only if no products or subcategories use it.',
      detail: category.path || category.name,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setDeletingId(category.id);
    setError('');
    setMessage('');
    try {
      const response = await deleteSalesCategory(category.id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Sales category deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Sales category could not be deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo<AdvancedTableColumn<SalesCategory>[]>(
    () => [
      { id: 'id', header: 'ID', accessor: (category) => category.id, align: 'right', width: 80 },
      { id: 'name', header: 'Category', accessor: (category) => category.name, width: 240 },
      { id: 'parent', header: 'Parent', accessor: (category) => category.parentName || 'Root', width: 220 },
      { id: 'path', header: 'Path', accessor: (category) => category.path, width: 300 },
      {
        id: 'status',
        header: 'Status',
        accessor: statusLabel,
        cell: (category) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(category.active)}`}>
            {statusLabel(category)}
          </span>
        ),
        width: 130,
      },
      { id: 'products', header: 'Products', accessor: (category) => category.productCount, align: 'right', width: 120 },
      { id: 'children', header: 'Subcategories', accessor: (category) => category.childCount, align: 'right', width: 150 },
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        cell: (category) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openEditDialog(category)}>
              <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Edit</span>
            </Button>
            <Button size="sm" variant="danger" disabled={deletingId === category.id} onClick={() => void deleteCategory(category)}>
              <span className="inline-flex items-center gap-2">
                {deletingId === category.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </span>
            </Button>
          </div>
        ),
        width: 210,
        sortable: false,
        filterable: false,
      },
    ],
    [deletingId]
  );

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Inventory Maintenance</p>
              <h1 className="mt-1 text-xl font-bold leading-tight text-akiva-text sm:text-[1.625rem]">Sales Categories</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                Maintain storefront category hierarchy and active status for stock item grouping.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadCategories()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
              <Button onClick={openCreateDialog}>
                <span className="inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" />Add Category</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
            {[
              ['Total', stats.total, Tags],
              ['Active', stats.active, CheckCircle2],
              ['Inactive', stats.inactive, Layers3],
              ['Product Links', stats.productLinks, Tags],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof Tags;
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
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(18rem,1fr)_repeat(2,minmax(10rem,14rem))]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder="Search category, parent, or path..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <SearchableSelect value={parentFilter} onChange={setParentFilter} options={parentOptions} inputClassName={inputClassName} placeholder="Parent" />
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              inputClassName={inputClassName}
              placeholder="Status"
            />
          </div>

          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          <div className="mt-4 flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">Category List</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                {filteredCategories.length.toLocaleString()} shown from {categories.length.toLocaleString()} records
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId="sales-categories-maintenance"
              columns={columns}
              rows={filteredCategories}
              rowKey={(category) => String(category.id)}
              loading={loading}
              loadingMessage="Loading sales categories..."
              emptyMessage="No sales categories found."
              initialPageSize={25}
            />
          </div>
        </section>
      </div>

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`${editingCategory ? 'Edit' : 'Add'} Sales Category`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="sales-category-form" disabled={saving}>
              <span className="inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </span>
            </Button>
          </>
        }
      >
        <form id="sales-category-form" onSubmit={submitForm} className="grid gap-4">
          <label className="block text-sm font-medium text-akiva-text">
            Category name
            <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setField('name', event.target.value)} maxLength={50} required />
          </label>
          <label className="block text-sm font-medium text-akiva-text">
            Parent category
            <SearchableSelect className="mt-1" value={form.parentId} onChange={(value) => setField('parentId', value)} options={formParentOptions} required />
          </label>
          <div className="block text-sm font-medium text-akiva-text">
            Status
            <div className="mt-1 grid grid-cols-2 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface p-1">
              {[
                ['active', 'Active'],
                ['inactive', 'Inactive'],
              ].map(([value, label]) => {
                const selected = (form.active ? 'active' : 'inactive') === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setField('active', value === 'active')}
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
        </form>
      </Modal>

      {confirmationDialog}
    </div>
  );
}
