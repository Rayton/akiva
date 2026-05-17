import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Layers3, Loader2, Plus, RefreshCw, Search, ShieldCheck, Tags, Trash2, UserRound } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { addInternalStockCategoryRole, deleteInternalStockCategoryRole, fetchInternalStockCategoryRoles } from '../data/internalStockCategoryRolesApi';
import type {
  InternalStockCategory,
  InternalStockCategoryRole,
  InternalStockCategoryRoleAssignment,
  InternalStockCategoryRoleForm,
  InternalStockCategoryRolesPayload,
} from '../types/internalStockCategoryRoles';

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const compactActionButtonClass =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-akiva-accent/30 disabled:cursor-not-allowed disabled:opacity-60';

const compactDangerButtonClass =
  `${compactActionButtonClass} border border-red-600 bg-red-600 text-white hover:bg-red-700`;

const compactPrimaryButtonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-akiva-accent px-4 text-sm font-semibold text-white transition hover:bg-akiva-accent-strong focus:outline-none focus:ring-2 focus:ring-akiva-accent/30 disabled:cursor-not-allowed disabled:bg-akiva-accent-soft disabled:text-akiva-text-muted';

const EMPTY_ROLES: InternalStockCategoryRole[] = [];
const EMPTY_CATEGORIES: InternalStockCategory[] = [];
const EMPTY_ASSIGNMENTS: InternalStockCategoryRoleAssignment[] = [];

function accessKey(value: string): string {
  return value.trim().toLowerCase();
}

function assignmentKey(row: InternalStockCategoryRoleAssignment): string {
  return `${row.roleId}::${row.categoryId}`;
}

function emptyForm(): InternalStockCategoryRoleForm {
  return {
    roleId: 0,
    categoryId: '',
  };
}

function roleOptionLabel(role: InternalStockCategoryRole): string {
  return `${role.roleId} - ${role.name}${role.missingRoleRecord ? ' - assignment only' : ''}`;
}

function categoryOptionLabel(category: InternalStockCategory): string {
  return `${category.categoryId} - ${category.description}${category.missingCategoryRecord ? ' - assignment only' : ''}`;
}

function stockTypeLabel(stockType: string): string {
  const key = stockType.trim().toUpperCase();
  if (key === 'F') return 'Finished goods';
  if (key === 'D') return 'Dummy';
  if (key === 'L') return 'Labour';
  if (key === 'M') return 'Manufactured';
  if (key === 'A') return 'Assembly';
  return key || 'Unspecified';
}

function badgeClass(kind: 'active' | 'muted' | 'warning'): string {
  if (kind === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  if (kind === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text-muted';
}

export function InternalStockCategoryRoles() {
  const [payload, setPayload] = useState<InternalStockCategoryRolesPayload | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState(0);
  const [addForm, setAddForm] = useState<InternalStockCategoryRoleForm>(() => emptyForm());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchInternalStockCategoryRoles();
      setPayload(nextPayload);
      setSelectedRoleId((current) => current || nextPayload.defaults.roleId);
      setAddForm(nextPayload.defaults);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Internal stock category roles could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    document.title = 'Category Roles | Akiva';
  }, []);

  const stats = payload?.stats ?? {
    roles: 0,
    categories: 0,
    assignments: 0,
    rolesWithCategories: 0,
    categoriesAssigned: 0,
  };

  const roles = payload?.roles ?? EMPTY_ROLES;
  const categories = payload?.categories ?? EMPTY_CATEGORIES;
  const assignments = payload?.assignments ?? EMPTY_ASSIGNMENTS;

  const roleOptions = useMemo(
    () => roles.map((role) => ({ value: String(role.roleId), label: roleOptionLabel(role) })),
    [roles]
  );

  const selectedRole = roles.find((role) => role.roleId === selectedRoleId) ?? null;

  const roleAssignments = useMemo(
    () => assignments.filter((row) => row.roleId === selectedRoleId),
    [assignments, selectedRoleId]
  );

  const availableCategories = useMemo(() => {
    const assigned = new Set(roleAssignments.map((row) => accessKey(row.categoryId)));
    return categories.filter((category) => !assigned.has(accessKey(category.categoryId)) && !category.missingCategoryRecord);
  }, [categories, roleAssignments]);

  useEffect(() => {
    const nextCategoryId = availableCategories[0]?.categoryId ?? '';
    setAddForm((previous) => ({
      ...previous,
      roleId: selectedRoleId,
      categoryId: previous.roleId === selectedRoleId && availableCategories.some((category) => category.categoryId === previous.categoryId)
        ? previous.categoryId
        : nextCategoryId,
    }));
  }, [availableCategories, selectedRoleId]);

  const availableCategoryOptions = useMemo(
    () => availableCategories.map((category) => ({ value: category.categoryId, label: categoryOptionLabel(category) })),
    [availableCategories]
  );

  const visibleRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return roleAssignments.filter((row) => {
      if (statusFilter === 'missing-role' && !row.roleMissingRecord) return false;
      if (statusFilter === 'missing-category' && !row.categoryMissingRecord) return false;
      if (!needle) return true;

      return [
        row.roleId,
        row.roleName,
        row.categoryId,
        row.categoryDescription,
        row.stockType,
        stockTypeLabel(row.stockType),
        row.roleMissingRecord ? 'missing role assignment only' : '',
        row.categoryMissingRecord ? 'missing category assignment only' : '',
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [roleAssignments, searchTerm, statusFilter]);

  const submitAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await addInternalStockCategoryRole(addForm);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Internal stock category role added.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Internal stock category role could not be added.');
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = useCallback(async (row: InternalStockCategoryRoleAssignment) => {
    const confirmed = await confirm({
      title: 'Remove Category Role',
      description: 'This will remove the stock category from the selected security role.',
      detail: `${row.roleName} - ${row.categoryId} ${row.categoryDescription}`,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;

    const key = assignmentKey(row);
    setDeletingKey(key);
    setError('');
    setMessage('');
    try {
      const response = await deleteInternalStockCategoryRole(row.roleId, row.categoryId);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Internal stock category role removed.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Internal stock category role could not be removed.');
    } finally {
      setDeletingKey('');
    }
  }, [confirm]);

  const columns = useMemo<AdvancedTableColumn<InternalStockCategoryRoleAssignment>[]>(
    () => [
      { id: 'categoryId', header: 'Category Code', accessor: (row) => row.categoryId, width: 150 },
      {
        id: 'categoryDescription',
        header: 'Description',
        accessor: (row) => [row.categoryDescription, row.categoryId].join(' '),
        cell: (row) => row.categoryDescription,
        exportValue: (row) => row.categoryDescription,
        sortValue: (row) => row.categoryDescription,
        width: 260,
      },
      {
        id: 'stockType',
        header: 'Stock Type',
        accessor: (row) => [row.stockType, stockTypeLabel(row.stockType)].join(' '),
        cell: (row) => stockTypeLabel(row.stockType),
        exportValue: (row) => stockTypeLabel(row.stockType),
        sortValue: (row) => stockTypeLabel(row.stockType),
        width: 150,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => [
          row.roleMissingRecord ? 'Missing role assignment only warning' : '',
          row.categoryMissingRecord ? 'Missing category assignment only warning' : '',
          !row.roleMissingRecord && !row.categoryMissingRecord ? 'Active valid' : '',
        ].join(' '),
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(row.roleMissingRecord || row.categoryMissingRecord ? 'warning' : 'active')}`}>
            {row.roleMissingRecord ? 'Missing role' : row.categoryMissingRecord ? 'Missing category' : 'Active'}
          </span>
        ),
        exportValue: (row) => (row.roleMissingRecord ? 'Missing role' : row.categoryMissingRecord ? 'Missing category' : 'Active'),
        sortValue: (row) => (row.roleMissingRecord ? 'Missing role' : row.categoryMissingRecord ? 'Missing category' : 'Active'),
        width: 150,
      },
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        cell: (row) => {
          const key = assignmentKey(row);
          return (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={compactDangerButtonClass} disabled={deletingKey === key} onClick={() => void removeAssignment(row)}>
                {deletingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </button>
            </div>
          );
        },
        width: 130,
        sortable: false,
        filterable: false,
      },
    ],
    [deletingKey, removeAssignment]
  );

  const addDisabled = saving || !addForm.roleId || !addForm.categoryId;

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Inventory Maintenance</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight text-akiva-text sm:text-3xl">Category Roles</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                Maintain which stock categories can be used for internal requests by security role.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadRoles()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
            {[
              ['Roles', stats.roles, UserRound],
              ['Categories', stats.categories, Tags],
              ['Assignments', stats.assignments, ShieldCheck],
              ['Roles Assigned', stats.rolesWithCategories, CheckCircle2],
              ['Categories Used', stats.categoriesAssigned, Layers3],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof UserRound;
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
          <form onSubmit={submitAdd} className="grid gap-3 min-[900px]:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_auto] min-[900px]:items-end">
            <label className="block text-sm font-medium text-akiva-text">
              Security role
              <SearchableSelect
                className="mt-1"
                value={selectedRoleId ? String(selectedRoleId) : ''}
                onChange={(value) => setSelectedRoleId(Number(value))}
                options={roleOptions}
                placeholder="Select role"
              />
            </label>
            <label className="block text-sm font-medium text-akiva-text">
              Add category
              <SearchableSelect
                className="mt-1"
                value={addForm.categoryId}
                onChange={(value) => setAddForm((previous) => ({ ...previous, categoryId: value }))}
                options={availableCategoryOptions}
                placeholder="Select category"
                disabled={availableCategoryOptions.length === 0}
              />
            </label>
            <button type="submit" className={compactPrimaryButtonClass} disabled={addDisabled}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </form>

          {availableCategoryOptions.length === 0 && selectedRoleId ? (
            <p className="mt-3 text-sm text-akiva-text-muted">All stock categories are already assigned to this role.</p>
          ) : null}
          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(18rem,1fr)_minmax(10rem,14rem)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder="Search category or role..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All assignments' },
                { value: 'missing-role', label: 'Missing role' },
                { value: 'missing-category', label: 'Missing category' },
              ]}
              inputClassName={inputClassName}
              placeholder="Status"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">{selectedRole ? roleOptionLabel(selectedRole) : 'Role Categories'}</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                {visibleRows.length.toLocaleString()} shown from {roleAssignments.length.toLocaleString()} records
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId="internal-stock-category-roles"
              columns={columns}
              rows={visibleRows}
              rowKey={(row) => assignmentKey(row)}
              loading={loading}
              loadingMessage="Loading category roles..."
              emptyMessage="No internal stock category roles found."
              initialPageSize={25}
            />
          </div>
        </section>
      </div>

      {confirmationDialog}
    </div>
  );
}
