import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ClipboardCheck, Loader2, MapPin, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { addDepartmentAuthorization, deleteDepartmentAuthorization, fetchDepartments, updateDepartmentAuthorization } from '../data/departmentsApi';
import type { DepartmentAuthorization, DepartmentAuthorizationForm, DepartmentLocation, DepartmentsPayload, DepartmentUser } from '../types/departments';

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const compactActionButtonClass =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-akiva-accent/30 disabled:cursor-not-allowed disabled:opacity-60';

const compactSecondaryButtonClass =
  `${compactActionButtonClass} border border-akiva-border bg-akiva-surface-muted text-akiva-text hover:bg-akiva-surface-raised`;

const compactDangerButtonClass =
  `${compactActionButtonClass} border border-red-600 bg-red-600 text-white hover:bg-red-700`;

const compactPrimaryButtonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-akiva-accent px-4 text-sm font-semibold text-white transition hover:bg-akiva-accent-strong focus:outline-none focus:ring-2 focus:ring-akiva-accent/30 disabled:cursor-not-allowed disabled:bg-akiva-accent-soft disabled:text-akiva-text-muted';

const EMPTY_USERS: DepartmentUser[] = [];
const EMPTY_LOCATIONS: DepartmentLocation[] = [];
const EMPTY_AUTHORIZATIONS: DepartmentAuthorization[] = [];

function accessKey(value: string): string {
  return value.trim().toLowerCase();
}

function emptyForm(): DepartmentAuthorizationForm {
  return {
    userId: '',
    locationCode: '',
    canCreate: true,
    canAuthorise: true,
    canFulfill: true,
  };
}

function authorizationKey(row: DepartmentAuthorization): string {
  return `${row.locationCode}::${row.userId}`;
}

function userOptionLabel(user: { userId: string; name: string; blocked: boolean; missingUserRecord: boolean }): string {
  return `${user.name} (${user.userId})${user.missingUserRecord ? ' - assignment only' : user.blocked ? ' - blocked' : ''}`;
}

function permissionSummary(row: DepartmentAuthorization): string {
  const permissions = [
    row.canCreate ? 'Create' : '',
    row.canAuthorise ? 'Authorise' : '',
    row.canFulfill ? 'Fulfill' : '',
  ].filter(Boolean);
  return permissions.length > 0 ? permissions.join(', ') : 'No permissions';
}

function badgeClass(kind: 'active' | 'muted' | 'warning'): string {
  if (kind === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  if (kind === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text-muted';
}

function permissionBadge(enabled: boolean) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(enabled ? 'active' : 'muted')}`}>
      {enabled ? 'Yes' : 'No'}
    </span>
  );
}

interface PermissionToggleProps {
  label: string;
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function PermissionToggle({ label, enabled, onClick, disabled = false }: PermissionToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-akiva-accent/30 disabled:cursor-not-allowed disabled:opacity-60 ${
        enabled
          ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-accent-text'
          : 'border-akiva-border bg-akiva-surface text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
      }`}
    >
      <span className={`flex h-4 w-4 items-center justify-center rounded border ${enabled ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface'}`}>
        {enabled ? <Check className="h-3 w-3" /> : null}
      </span>
      {label}
    </button>
  );
}

export function Departments() {
  const [payload, setPayload] = useState<DepartmentsPayload | null>(null);
  const [selectedLocationCode, setSelectedLocationCode] = useState('');
  const [addForm, setAddForm] = useState<DepartmentAuthorizationForm>(() => emptyForm());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingKey, setUpdatingKey] = useState('');
  const [deletingKey, setDeletingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadDepartments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchDepartments();
      setPayload(nextPayload);
      setSelectedLocationCode((current) => current || nextPayload.defaults.locationCode);
      setAddForm(nextPayload.defaults);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Departments could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  useEffect(() => {
    document.title = 'Departments | Akiva';
  }, []);

  const stats = payload?.stats ?? {
    users: 0,
    locations: 0,
    authorizations: 0,
    locationsWithUsers: 0,
    createAccess: 0,
    authoriseAccess: 0,
    fulfillAccess: 0,
  };

  const users = payload?.users ?? EMPTY_USERS;
  const locations = payload?.locations ?? EMPTY_LOCATIONS;
  const authorizations = payload?.authorizations ?? EMPTY_AUTHORIZATIONS;

  const locationOptions = useMemo(
    () => locations.map((location) => ({ value: location.code, label: `${location.name} (${location.code})` })),
    [locations]
  );

  const selectedLocation = locations.find((location) => location.code === selectedLocationCode) ?? null;

  const locationAuthorizations = useMemo(() => {
    const selectedKey = accessKey(selectedLocationCode);
    return authorizations.filter((row) => accessKey(row.locationCode) === selectedKey);
  }, [authorizations, selectedLocationCode]);

  const availableUsers = useMemo(() => {
    const assigned = new Set(locationAuthorizations.map((row) => accessKey(row.userId)));
    return users.filter((user) => !assigned.has(accessKey(user.userId)));
  }, [locationAuthorizations, users]);

  useEffect(() => {
    const nextUser = availableUsers[0]?.userId ?? '';
    setAddForm((previous) => ({
      ...previous,
      locationCode: selectedLocationCode,
      userId: previous.locationCode === selectedLocationCode && availableUsers.some((user) => user.userId === previous.userId)
        ? previous.userId
        : nextUser,
    }));
  }, [availableUsers, selectedLocationCode]);

  const availableUserOptions = useMemo(
    () => availableUsers.map((user) => ({ value: user.userId, label: userOptionLabel(user) })),
    [availableUsers]
  );

  const visibleRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return locationAuthorizations.filter((row) => {
      if (statusFilter === 'create' && !row.canCreate) return false;
      if (statusFilter === 'authorise' && !row.canAuthorise) return false;
      if (statusFilter === 'fulfill' && !row.canFulfill) return false;
      if (statusFilter === 'no-permissions' && (row.canCreate || row.canAuthorise || row.canFulfill)) return false;
      if (statusFilter === 'blocked' && !row.userBlocked) return false;
      if (statusFilter === 'missing' && !row.userMissingRecord) return false;
      if (!needle) return true;

      return [
        row.userId,
        row.userName,
        row.userEmail,
        row.userMissingRecord ? 'assignment only missing user record' : '',
        row.locationCode,
        row.locationName,
        permissionSummary(row),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [locationAuthorizations, searchTerm, statusFilter]);

  const setAddField = <K extends keyof DepartmentAuthorizationForm>(fieldName: K, value: DepartmentAuthorizationForm[K]) => {
    setAddForm((previous) => ({ ...previous, [fieldName]: value }));
  };

  const submitAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await addDepartmentAuthorization(addForm);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Department authorisation added.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Department authorisation could not be added.');
    } finally {
      setSaving(false);
    }
  };

  const updateAuthorization = useCallback(async (row: DepartmentAuthorization, changes: Partial<DepartmentAuthorizationForm>) => {
    const key = authorizationKey(row);
    setUpdatingKey(key);
    setError('');
    setMessage('');
    try {
      const response = await updateDepartmentAuthorization({
        userId: row.userId,
        locationCode: row.locationCode,
        canCreate: changes.canCreate ?? row.canCreate,
        canAuthorise: changes.canAuthorise ?? row.canAuthorise,
        canFulfill: changes.canFulfill ?? row.canFulfill,
      });
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Department authorisation updated.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Department authorisation could not be updated.');
    } finally {
      setUpdatingKey('');
    }
  }, []);

  const removeAuthorization = useCallback(async (row: DepartmentAuthorization) => {
    const confirmed = await confirm({
      title: 'Remove Department Authorisation',
      description: 'This will remove the user from the selected internal stock request location.',
      detail: `${row.userName} - ${row.locationName}`,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;

    const key = authorizationKey(row);
    setDeletingKey(key);
    setError('');
    setMessage('');
    try {
      const response = await deleteDepartmentAuthorization(row.locationCode, row.userId);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Department authorisation removed.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Department authorisation could not be removed.');
    } finally {
      setDeletingKey('');
    }
  }, [confirm]);

  const columns = useMemo<AdvancedTableColumn<DepartmentAuthorization>[]>(
    () => [
      { id: 'userId', header: 'User ID', accessor: (row) => row.userId, width: 150 },
      {
        id: 'userName',
        header: 'User',
        accessor: (row) => [row.userName, row.userId, row.userEmail].join(' '),
        cell: (row) => row.userName,
        exportValue: (row) => row.userName,
        sortValue: (row) => row.userName,
        width: 260,
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => [
          row.userMissingRecord ? 'Assignment only missing user record' : row.userBlocked ? 'Blocked disabled' : 'Active enabled',
          row.userBlocked ? '1 yes true' : '0 no false',
        ].join(' '),
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(row.userMissingRecord || row.userBlocked ? 'warning' : 'active')}`}>
            {row.userMissingRecord ? 'Assignment only' : row.userBlocked ? 'Blocked' : 'Active'}
          </span>
        ),
        exportValue: (row) => (row.userMissingRecord ? 'Assignment only' : row.userBlocked ? 'Blocked' : 'Active'),
        sortValue: (row) => (row.userMissingRecord ? 'Assignment only' : row.userBlocked ? 'Blocked' : 'Active'),
        width: 140,
      },
      {
        id: 'canCreate',
        header: 'Create',
        accessor: (row) => (row.canCreate ? 'Yes 1 true create can create' : 'No 0 false no create cannot create'),
        cell: (row) => permissionBadge(row.canCreate),
        exportValue: (row) => (row.canCreate ? 'Yes' : 'No'),
        sortValue: (row) => (row.canCreate ? 1 : 0),
        width: 110,
      },
      {
        id: 'canAuthorise',
        header: 'Authorise',
        accessor: (row) => (row.canAuthorise ? 'Yes 1 true authorise authorize can authorise' : 'No 0 false no authorise no authorize cannot authorise'),
        cell: (row) => permissionBadge(row.canAuthorise),
        exportValue: (row) => (row.canAuthorise ? 'Yes' : 'No'),
        sortValue: (row) => (row.canAuthorise ? 1 : 0),
        width: 130,
      },
      {
        id: 'canFulfill',
        header: 'Fulfill',
        accessor: (row) => (row.canFulfill ? 'Yes 1 true fulfill fullfill can fulfill' : 'No 0 false no fulfill no fullfill cannot fulfill'),
        cell: (row) => permissionBadge(row.canFulfill),
        exportValue: (row) => (row.canFulfill ? 'Yes' : 'No'),
        sortValue: (row) => (row.canFulfill ? 1 : 0),
        width: 115,
      },
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        cell: (row) => {
          const key = authorizationKey(row);
          const busy = updatingKey === key;
          return (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={compactSecondaryButtonClass} disabled={busy} onClick={() => void updateAuthorization(row, { canCreate: !row.canCreate })}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                {row.canCreate ? 'Create Off' : 'Create On'}
              </button>
              <button type="button" className={compactSecondaryButtonClass} disabled={busy} onClick={() => void updateAuthorization(row, { canAuthorise: !row.canAuthorise })}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {row.canAuthorise ? 'Authorise Off' : 'Authorise On'}
              </button>
              <button type="button" className={compactSecondaryButtonClass} disabled={busy} onClick={() => void updateAuthorization(row, { canFulfill: !row.canFulfill })}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                {row.canFulfill ? 'Fulfill Off' : 'Fulfill On'}
              </button>
              <button type="button" className={compactDangerButtonClass} disabled={deletingKey === key} onClick={() => void removeAuthorization(row)}>
                {deletingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </button>
            </div>
          );
        },
        width: 430,
        sortable: false,
        filterable: false,
      },
    ],
    [deletingKey, removeAuthorization, updateAuthorization, updatingKey]
  );

  const addDisabled = saving || !addForm.locationCode || !addForm.userId;

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Inventory Maintenance</p>
              <h1 className="mt-1 text-xl font-bold leading-tight text-akiva-text sm:text-[1.625rem]">Departments</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                Maintain internal stock request permissions by inventory location.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadDepartments()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
            {[
              ['Locations', stats.locations, MapPin],
              ['Users', stats.users, Users],
              ['Authorisations', stats.authorizations, ShieldCheck],
              ['Create', stats.createAccess, CheckCircle2],
              ['Authorise', stats.authoriseAccess, ShieldCheck],
              ['Fulfill', stats.fulfillAccess, ClipboardCheck],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof MapPin;
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
          <form onSubmit={submitAdd} className="grid gap-3 min-[1100px]:grid-cols-[minmax(14rem,1.1fr)_minmax(14rem,1.2fr)_auto_auto_auto_auto] min-[1100px]:items-end">
            <label className="block text-sm font-medium text-akiva-text">
              Location
              <SearchableSelect className="mt-1" value={selectedLocationCode} onChange={setSelectedLocationCode} options={locationOptions} placeholder="Select location" />
            </label>
            <label className="block text-sm font-medium text-akiva-text">
              Add user
              <SearchableSelect className="mt-1" value={addForm.userId} onChange={(value) => setAddField('userId', value)} options={availableUserOptions} placeholder="Select user" disabled={availableUserOptions.length === 0} />
            </label>

            <PermissionToggle label="Create" enabled={addForm.canCreate} onClick={() => setAddField('canCreate', !addForm.canCreate)} disabled={saving} />
            <PermissionToggle label="Authorise" enabled={addForm.canAuthorise} onClick={() => setAddField('canAuthorise', !addForm.canAuthorise)} disabled={saving} />
            <PermissionToggle label="Fulfill" enabled={addForm.canFulfill} onClick={() => setAddField('canFulfill', !addForm.canFulfill)} disabled={saving} />

            <button type="submit" className={compactPrimaryButtonClass} disabled={addDisabled}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </form>

          {availableUserOptions.length === 0 && selectedLocationCode ? (
            <p className="mt-3 text-sm text-akiva-text-muted">All available users are already assigned to this location.</p>
          ) : null}
          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(18rem,1fr)_minmax(10rem,14rem)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder="Search user or permission..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All permissions' },
                { value: 'create', label: 'Can create' },
                { value: 'authorise', label: 'Can authorise' },
                { value: 'fulfill', label: 'Can fulfill' },
                { value: 'no-permissions', label: 'No permissions' },
                { value: 'blocked', label: 'Blocked users' },
                { value: 'missing', label: 'Assignment only' },
              ]}
              inputClassName={inputClassName}
              placeholder="Permission"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">{selectedLocation?.name || 'Location Authorisations'}</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                {visibleRows.length.toLocaleString()} shown from {locationAuthorizations.length.toLocaleString()} records
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId="departments-authorizations"
              columns={columns}
              rows={visibleRows}
              rowKey={(row) => authorizationKey(row)}
              loading={loading}
              loadingMessage="Loading departments..."
              emptyMessage="No department authorisations found."
              initialPageSize={25}
            />
          </div>
        </section>
      </div>

      {confirmationDialog}
    </div>
  );
}
