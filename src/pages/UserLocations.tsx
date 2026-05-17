import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Eye, Loader2, MapPin, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { addUserLocation, deleteUserLocation, fetchUserLocations, updateUserLocation } from '../data/userLocationsApi';
import type { UserLocationAssignment, UserLocationForm, UserLocationMode, UserLocationsPayload } from '../types/userLocations';

interface UserLocationsProps {
  initialMode?: UserLocationMode;
}

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

function userOptionLabel(user: { userId: string; name: string; blocked: boolean; missingUserRecord: boolean }): string {
  return `${user.name} (${user.userId})${user.missingUserRecord ? ' - assignment only' : user.blocked ? ' - blocked' : ''}`;
}

function accessKey(value: string): string {
  return value.trim().toLowerCase();
}

function emptyForm(): UserLocationForm {
  return {
    userId: '',
    locationCode: '',
    canView: true,
    canUpdate: true,
  };
}

function assignmentKey(row: UserLocationAssignment): string {
  return `${row.userId}::${row.locationCode}`;
}

function accessLabel(row: UserLocationAssignment): string {
  if (row.canUpdate) return 'View and update';
  if (row.canView) return 'View only';
  return 'No access';
}

function badgeClass(kind: 'active' | 'muted' | 'warning'): string {
  if (kind === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  if (kind === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200';
  return 'border-akiva-border bg-akiva-surface-muted text-akiva-text-muted';
}

export function UserLocations({ initialMode = 'user' }: UserLocationsProps) {
  const [mode, setMode] = useState<UserLocationMode>(initialMode);
  const [payload, setPayload] = useState<UserLocationsPayload | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedLocationCode, setSelectedLocationCode] = useState('');
  const [addForm, setAddForm] = useState<UserLocationForm>(() => emptyForm());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingKey, setUpdatingKey] = useState('');
  const [deletingKey, setDeletingKey] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const loadAccess = async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchUserLocations();
      setPayload(nextPayload);
      setSelectedUserId((current) => current || nextPayload.defaults.userId);
      setSelectedLocationCode((current) => current || nextPayload.defaults.locationCode);
      setAddForm(nextPayload.defaults);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'User location access could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccess();
  }, []);

  useEffect(() => {
    document.title = 'User Locations | Akiva';
  }, []);

  const stats = payload?.stats ?? {
    users: 0,
    locations: 0,
    assignments: 0,
    usersWithLocations: 0,
    locationsWithUsers: 0,
    updateAccess: 0,
    viewOnly: 0,
  };

  const users = payload?.users ?? [];
  const locations = payload?.locations ?? [];
  const assignments = payload?.assignments ?? [];

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.userId, label: userOptionLabel(user) })),
    [users]
  );

  const locationOptions = useMemo(
    () => locations.map((location) => ({ value: location.code, label: `${location.name} (${location.code})` })),
    [locations]
  );

  const selectedUser = users.find((user) => user.userId === selectedUserId) ?? null;
  const selectedLocation = locations.find((location) => location.code === selectedLocationCode) ?? null;

  const userAssignments = useMemo(
    () => {
      const selectedKey = accessKey(selectedUserId);
      return assignments.filter((row) => accessKey(row.userId) === selectedKey);
    },
    [assignments, selectedUserId]
  );

  const locationAssignments = useMemo(
    () => {
      const selectedKey = accessKey(selectedLocationCode);
      return assignments.filter((row) => accessKey(row.locationCode) === selectedKey);
    },
    [assignments, selectedLocationCode]
  );

  const availableLocations = useMemo(() => {
    const assigned = new Set(userAssignments.map((row) => accessKey(row.locationCode)));
    return locations.filter((location) => !assigned.has(accessKey(location.code)));
  }, [locations, userAssignments]);

  const availableUsers = useMemo(() => {
    const assigned = new Set(locationAssignments.map((row) => accessKey(row.userId)));
    return users.filter((user) => !assigned.has(accessKey(user.userId)));
  }, [locationAssignments, users]);

  useEffect(() => {
    if (mode === 'user') {
      const nextLocation = availableLocations[0]?.code ?? '';
      setAddForm((previous) => ({
        ...previous,
        userId: selectedUserId,
        locationCode: previous.userId === selectedUserId && availableLocations.some((location) => location.code === previous.locationCode)
          ? previous.locationCode
          : nextLocation,
      }));
      return;
    }

    const nextUser = availableUsers[0]?.userId ?? '';
    setAddForm((previous) => ({
      ...previous,
      userId: previous.locationCode === selectedLocationCode && availableUsers.some((user) => user.userId === previous.userId)
        ? previous.userId
        : nextUser,
      locationCode: selectedLocationCode,
    }));
  }, [availableLocations, availableUsers, mode, selectedLocationCode, selectedUserId]);

  const visibleRows = useMemo(() => {
    const rows = mode === 'user' ? userAssignments : locationAssignments;
    const needle = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'update' && !row.canUpdate) return false;
      if (statusFilter === 'view-only' && (!row.canView || row.canUpdate)) return false;
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
        accessLabel(row),
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [locationAssignments, mode, searchTerm, statusFilter, userAssignments]);

  const setAddField = <K extends keyof UserLocationForm>(fieldName: K, value: UserLocationForm[K]) => {
    setAddForm((previous) => {
      const next = { ...previous, [fieldName]: value };
      if (fieldName === 'canUpdate' && value === true) next.canView = true;
      return next;
    });
  };

  const submitAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await addUserLocation(addForm);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'User location access added.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'User location access could not be added.');
    } finally {
      setSaving(false);
    }
  };

  const updateAccess = async (row: UserLocationAssignment, changes: Partial<UserLocationForm>) => {
    const key = assignmentKey(row);
    setUpdatingKey(key);
    setError('');
    setMessage('');
    try {
      const nextCanUpdate = changes.canUpdate ?? row.canUpdate;
      const nextCanView = (changes.canView ?? row.canView) || nextCanUpdate;
      const response = await updateUserLocation({
        userId: row.userId,
        locationCode: row.locationCode,
        canView: nextCanView,
        canUpdate: nextCanUpdate,
      });
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'User location access updated.');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'User location access could not be updated.');
    } finally {
      setUpdatingKey('');
    }
  };

  const removeAccess = async (row: UserLocationAssignment) => {
    const confirmed = await confirm({
      title: 'Remove Location Access',
      description: 'This will remove the user/location authorisation record.',
      detail: `${row.userName} - ${row.locationName}`,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;

    const key = assignmentKey(row);
    setDeletingKey(key);
    setError('');
    setMessage('');
    try {
      const response = await deleteUserLocation(row.userId, row.locationCode);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'User location access removed.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'User location access could not be removed.');
    } finally {
      setDeletingKey('');
    }
  };

  const columns = useMemo<AdvancedTableColumn<UserLocationAssignment>[]>(() => {
    const accessColumns: AdvancedTableColumn<UserLocationAssignment>[] = [
      {
        id: 'canView',
        header: 'View',
        accessor: (row) => (row.canView ? 'Yes' : 'No'),
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(row.canView ? 'active' : 'muted')}`}>
            {row.canView ? 'Yes' : 'No'}
          </span>
        ),
        width: 110,
      },
      {
        id: 'canUpdate',
        header: 'Update',
        accessor: (row) => (row.canUpdate ? 'Yes' : 'No'),
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(row.canUpdate ? 'active' : 'warning')}`}>
            {row.canUpdate ? 'Yes' : 'No'}
          </span>
        ),
        width: 120,
      },
      {
        id: 'actions',
        header: 'Actions',
        accessor: () => '',
        cell: (row) => {
          const key = assignmentKey(row);
          return (
            <div className="flex flex-wrap gap-2">
              {!row.canView ? (
                <button type="button" className={compactSecondaryButtonClass} disabled={updatingKey === key} onClick={() => void updateAccess(row, { canView: true })}>
                  <Eye className="h-3.5 w-3.5" />
                  View
                </button>
              ) : null}
              <button type="button" className={compactSecondaryButtonClass} disabled={updatingKey === key} onClick={() => void updateAccess(row, { canUpdate: !row.canUpdate })}>
                {updatingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
                {row.canUpdate ? 'Update Off' : 'Update On'}
              </button>
              <button type="button" className={compactDangerButtonClass} disabled={deletingKey === key} onClick={() => void removeAccess(row)}>
                {deletingKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Remove
              </button>
            </div>
          );
        },
        width: 230,
        sortable: false,
        filterable: false,
      },
    ];

    if (mode === 'user') {
      return [
        { id: 'locationCode', header: 'Code', accessor: (row) => row.locationCode, width: 110 },
        { id: 'locationName', header: 'Location', accessor: (row) => row.locationName, width: 280 },
        ...accessColumns,
      ];
    }

    return [
      { id: 'userId', header: 'User ID', accessor: (row) => row.userId, width: 160 },
      { id: 'userName', header: 'User', accessor: (row) => row.userName, width: 260 },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => (row.userMissingRecord ? 'Assignment only' : row.userBlocked ? 'Blocked' : 'Active'),
        cell: (row) => (
          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${badgeClass(row.userMissingRecord || row.userBlocked ? 'warning' : 'active')}`}>
            {row.userMissingRecord ? 'Assignment only' : row.userBlocked ? 'Blocked' : 'Active'}
          </span>
        ),
        width: 130,
      },
      ...accessColumns,
    ];
  }, [deletingKey, mode, updatingKey]);

  const availableLocationOptions = availableLocations.map((location) => ({ value: location.code, label: `${location.name} (${location.code})` }));
  const availableUserOptions = availableUsers.map((user) => ({ value: user.userId, label: userOptionLabel(user) }));
  const addDisabled = saving || (mode === 'user' ? !addForm.userId || !addForm.locationCode : !addForm.locationCode || !addForm.userId);

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Inventory Maintenance</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight text-akiva-text sm:text-3xl">User Locations</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                Maintain inventory location access by user or by location.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadAccess()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-3">
            {[
              ['Users', stats.users, Users],
              ['Locations', stats.locations, MapPin],
              ['Assignments', stats.assignments, ShieldCheck],
              ['Update Access', stats.updateAccess, CheckCircle2],
              ['View Only', stats.viewOnly, Eye],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof Users;
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
          <div className="flex flex-wrap gap-2">
            {[
              ['user', 'By User', UserRound],
              ['location', 'By Location', MapPin],
            ].map(([value, label, Icon]) => {
              const ModeIcon = Icon as typeof UserRound;
              const selected = mode === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => {
                    setMode(value as UserLocationMode);
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${
                    selected
                      ? 'bg-akiva-accent text-white shadow-sm'
                      : 'border border-akiva-border bg-akiva-surface text-akiva-text hover:bg-akiva-surface-muted'
                  }`}
                >
                  <ModeIcon className="h-4 w-4" />
                  {String(label)}
                </button>
              );
            })}
          </div>

          <form onSubmit={submitAdd} className="mt-4 grid gap-3 min-[900px]:grid-cols-[minmax(14rem,1fr)_minmax(14rem,1fr)_auto_auto] min-[900px]:items-end">
            {mode === 'user' ? (
              <>
                <label className="block text-sm font-medium text-akiva-text">
                  User
                  <SearchableSelect className="mt-1" value={selectedUserId} onChange={(value) => setSelectedUserId(value)} options={userOptions} placeholder="Select user" />
                </label>
                <label className="block text-sm font-medium text-akiva-text">
                  Add location
                  <SearchableSelect className="mt-1" value={addForm.locationCode} onChange={(value) => setAddField('locationCode', value)} options={availableLocationOptions} placeholder="Select location" disabled={availableLocationOptions.length === 0} />
                </label>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-akiva-text">
                  Location
                  <SearchableSelect className="mt-1" value={selectedLocationCode} onChange={(value) => setSelectedLocationCode(value)} options={locationOptions} placeholder="Select location" />
                </label>
                <label className="block text-sm font-medium text-akiva-text">
                  Add user
                  <SearchableSelect className="mt-1" value={addForm.userId} onChange={(value) => setAddField('userId', value)} options={availableUserOptions} placeholder="Select user" disabled={availableUserOptions.length === 0} />
                </label>
              </>
            )}

            <button
              type="button"
              aria-pressed={addForm.canUpdate}
              onClick={() => setAddField('canUpdate', !addForm.canUpdate)}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-akiva-accent/30 ${
                addForm.canUpdate
                  ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-accent-text'
                  : 'border-akiva-border bg-akiva-surface text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded border ${addForm.canUpdate ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface'}`}>
                {addForm.canUpdate ? <Check className="h-3 w-3" /> : null}
              </span>
              Update
            </button>

            <button type="submit" className={compactPrimaryButtonClass} disabled={addDisabled}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </button>
          </form>

          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <div className="grid gap-3 min-[900px]:grid-cols-[minmax(18rem,1fr)_minmax(10rem,14rem)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder="Search user, location, or access..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
            <SearchableSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: 'All access' },
                { value: 'update', label: 'Can update' },
                { value: 'view-only', label: 'View only' },
                { value: 'blocked', label: 'Blocked users' },
                { value: 'missing', label: 'Assignment only' },
              ]}
              inputClassName={inputClassName}
              placeholder="Access"
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">
                {mode === 'user' ? selectedUser?.name || 'User Access' : selectedLocation?.name || 'Location Access'}
              </h2>
              <p className="mt-1 text-sm text-akiva-text-muted">
                {visibleRows.length.toLocaleString()} shown from {(mode === 'user' ? userAssignments.length : locationAssignments.length).toLocaleString()} records
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId={`user-locations-${mode}`}
              columns={columns}
              rows={visibleRows}
              rowKey={(row) => assignmentKey(row)}
              loading={loading}
              loadingMessage="Loading user locations..."
              emptyMessage="No user location access found."
              initialPageSize={25}
            />
          </div>
        </section>
      </div>

      {confirmationDialog}
    </div>
  );
}
