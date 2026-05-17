import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Check, Edit, Loader2, Plus, RefreshCw, Save, Search, Shield, ShieldCheck, Trash2, User, Users } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { deleteWwwUser, fetchWwwUsers, saveWwwUser } from '../data/wwwUsersApi';
import type { WwwUser, WwwUserForm, WwwUsersPayload } from '../types/wwwUsers';

function userToForm(user: WwwUser): WwwUserForm {
  return {
    ...user,
    password: '',
  };
}

function formatDate(value: string | null): string {
  if (!value) return 'No login record';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function textInputClassName() {
  return 'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30';
}

function fieldLabelClassName() {
  return 'text-xs font-semibold uppercase text-akiva-text-muted';
}

function responsiveFieldGridClassName() {
  return 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-3';
}

function responsiveOptionGridClassName() {
  return 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2';
}

function AkivaCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={`group flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
        checked
          ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-text shadow-sm'
          : 'border-akiva-border bg-akiva-surface text-akiva-text hover:border-akiva-accent/70 hover:bg-akiva-surface-muted'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          checked
            ? 'border-akiva-accent bg-akiva-accent text-white'
            : 'border-akiva-border-strong bg-akiva-surface-raised text-transparent group-hover:border-akiva-accent'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 truncate font-medium">{label}</span>
    </label>
  );
}

type SummaryFilter = 'all' | 'open' | 'blocked' | 'with-login';

export function UserManagement() {
  const [payload, setPayload] = useState<WwwUsersPayload | null>(null);
  const [form, setForm] = useState<WwwUserForm | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchWwwUsers();
      setPayload(nextPayload);
      setForm((current) => current ?? nextPayload.defaults);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Users could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const users = payload?.users ?? [];
  const lookups = payload?.lookups;
  const stats = payload?.stats ?? { total: 0, open: 0, blocked: 0, withRecentLogin: 0 };

  const filteredUsers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !needle ||
        user.userId.toLowerCase().includes(needle) ||
        user.realName.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.securityRoleName.toLowerCase().includes(needle) ||
        user.defaultLocationName.toLowerCase().includes(needle);
      const matchesRole = !selectedRole || String(user.securityRoleId) === selectedRole;
      const matchesStatus =
        !selectedStatus ||
        (selectedStatus === 'open' && !user.blocked) ||
        (selectedStatus === 'blocked' && user.blocked);
      const matchesSummary = summaryFilter !== 'with-login' || user.lastVisitDate !== null;
      return matchesSearch && matchesRole && matchesStatus && matchesSummary;
    });
  }, [searchTerm, selectedRole, selectedStatus, summaryFilter, users]);

  const applySummaryFilter = (filter: SummaryFilter) => {
    setSummaryFilter(filter);
    setSearchTerm('');
    setSelectedRole('');
    if (filter === 'open' || filter === 'blocked') {
      setSelectedStatus(filter);
    } else {
      setSelectedStatus('');
    }
  };

  const openNewUserDialog = () => {
    if (!payload) return;
    setEditingUserId(null);
    setForm({ ...payload.defaults, modulesAllowed: [...payload.defaults.modulesAllowed], password: '' });
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditUserDialog = (user: WwwUser) => {
    setEditingUserId(user.userId);
    setForm(userToForm(user));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
  };

  const updateForm = <Key extends keyof WwwUserForm>(key: Key, value: WwwUserForm[Key]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const updateBooleanForm = (key: keyof WwwUserForm, checked: boolean) => {
    setForm((current) => (current ? { ...current, [key]: checked } : current));
  };

  const updateModule = (index: number, checked: boolean) => {
    setForm((current) => {
      if (!current) return current;
      const modulesAllowed = [...current.modulesAllowed];
      modulesAllowed[index] = checked;
      return { ...current, modulesAllowed };
    });
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await saveWwwUser(form, editingUserId ?? undefined);
      if (response.data) {
        setPayload(response.data);
        setForm(response.data.defaults);
      }
      setEditingUserId(null);
      setDialogOpen(false);
      setMessage(response.message ?? 'User saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'User could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (user: WwwUser) => {
    const confirmed = await confirm({
      title: 'Delete User',
      description: 'This will remove the user account after server-side dependency checks pass.',
      detail: `${user.userId} - ${user.realName}`,
      confirmLabel: 'Delete User',
    });
    if (!confirmed) return;

    setDeletingUserId(user.userId);
    setError('');
    setMessage('');

    try {
      const response = await deleteWwwUser(user.userId);
      if (response.data) {
        setPayload(response.data);
        setEditingUserId(null);
        setForm(response.data.defaults);
      }
      setMessage(response.message ?? 'User deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'User could not be deleted.');
    } finally {
      setDeletingUserId('');
    }
  };

  const columns: AdvancedTableColumn<WwwUser>[] = [
    {
      id: 'user',
      header: 'User',
      accessor: (row) => `${row.userId} ${row.realName}`,
      width: 220,
      minWidth: 180,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent text-white">
            <User className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-akiva-text">{row.userId}</p>
            <p className="truncate text-xs text-akiva-text-muted">{row.realName}</p>
          </div>
        </div>
      ),
      exportValue: (row) => row.userId,
      sortValue: (row) => row.userId,
    },
    {
      id: 'contact',
      header: 'Contact',
      accessor: (row) => `${row.email} ${row.phone}`,
      width: 230,
      minWidth: 190,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-akiva-text">{row.email}</p>
          <p className="truncate text-xs text-akiva-text-muted">{row.phone || 'No phone'}</p>
        </div>
      ),
      exportValue: (row) => row.email,
    },
    {
      id: 'role',
      header: 'Security Role',
      accessor: (row) => row.securityRoleName,
      width: 210,
      minWidth: 170,
      cell: (row) => (
        <span className="inline-flex max-w-full items-center rounded-full bg-akiva-surface-muted px-2.5 py-1 text-xs font-medium text-akiva-text">
          <span className="truncate">{row.securityRoleName}</span>
        </span>
      ),
    },
    {
      id: 'location',
      header: 'Default Location',
      accessor: (row) => row.defaultLocationName || row.defaultLocation || '-',
      width: 220,
      minWidth: 170,
    },
    {
      id: 'lastVisitDate',
      header: 'Last Visit',
      accessor: (row) => formatDate(row.lastVisitDate),
      sortValue: (row) => row.lastVisitDate ?? '',
      width: 150,
      minWidth: 130,
    },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => (row.blocked ? 'Blocked' : 'Open'),
      width: 120,
      minWidth: 110,
      cell: (row) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            row.blocked
              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          }`}
        >
          {row.blocked ? 'Blocked' : 'Open'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: () => '',
      filterable: false,
      sortable: false,
      width: 120,
      minWidth: 110,
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => openEditUserDialog(row)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text"
            title="Edit user"
            aria-label={`Edit ${row.userId}`}
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void removeUser(row)}
            disabled={deletingUserId === row.userId}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            title="Delete user"
            aria-label={`Delete ${row.userId}`}
          >
            {deletingUserId === row.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];

  if (loading && !payload) {
    return (
      <div className="flex min-h-80 items-center justify-center text-akiva-text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading users...
      </div>
    );
  }

  const summaryCards: Array<{ key: SummaryFilter; label: string; value: number; detail: string }> = [
    { key: 'all', label: 'Total Users', value: stats.total, detail: 'All configured accounts' },
    { key: 'open', label: 'Open Accounts', value: stats.open, detail: 'Ready for sign-in' },
    { key: 'blocked', label: 'Blocked Accounts', value: stats.blocked, detail: 'Access disabled' },
    { key: 'with-login', label: 'With Login Record', value: stats.withRecentLogin, detail: 'Users with activity' },
  ];

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px] space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <Users className="h-3.5 w-3.5" />
                  General settings
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  User accounts
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                Users
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Manage application users, security roles, module access, and account status.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" onClick={() => void loadUsers()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={openNewUserDialog} disabled={!payload}>
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </div>
          </div>
        </section>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => applySummaryFilter(card.key)}
            aria-pressed={summaryFilter === card.key}
            className={`rounded-lg border bg-akiva-surface-raised p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-akiva-accent hover:shadow-md focus:outline-none focus:ring-2 focus:ring-akiva-accent ${
              summaryFilter === card.key ? 'border-akiva-accent ring-2 ring-akiva-accent/25' : 'border-akiva-border'
            }`}
          >
            <p className="text-sm font-medium text-akiva-text-muted">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-akiva-text">{card.value}</p>
            <p className="mt-1 text-xs text-akiva-text-muted">{card.detail}</p>
          </button>
        ))}
      </div>

      <Card>
        <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem_11rem]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className={`${textInputClassName()} pl-10`}
            />
          </div>
          <SearchableSelect
            value={selectedRole}
            onChange={setSelectedRole}
            placeholder="All Roles"
            options={[{ value: '', label: 'All Roles' }, ...(lookups?.securityRoles ?? []).map((role) => ({ value: String(role.value), label: role.label }))]}
            inputClassName="border-akiva-border focus:ring-akiva-accent/30"
          />
          <SearchableSelect
            value={selectedStatus}
            onChange={(value) => {
              setSelectedStatus(value);
              setSummaryFilter(value === 'open' || value === 'blocked' ? value : 'all');
            }}
            placeholder="All Status"
            options={[
              { value: '', label: 'All Status' },
              { value: 'open', label: 'Open' },
              { value: 'blocked', label: 'Blocked' },
            ]}
            inputClassName="border-akiva-border focus:ring-akiva-accent/30"
          />
        </div>

        <AdvancedTable
          tableId="configuration-users"
          columns={columns}
          rows={filteredUsers}
          rowKey={(row) => row.userId}
          loading={loading}
          loadingMessage="Loading users..."
          emptyMessage="No users found."
          initialPageSize={25}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </Card>

      <Modal
        isOpen={dialogOpen}
        onClose={closeDialog}
        title={editingUserId ? `Edit User: ${editingUserId}` : 'Add User'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" type="button" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="user-management-form" disabled={saving || !form}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save User
            </Button>
          </>
        }
      >
        {form ? (
          <form id="user-management-form" onSubmit={submitForm} className="space-y-5">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-akiva-text">Profile</h2>
              <div className={responsiveFieldGridClassName()}>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>User Login</span>
                  <input
                    value={form.userId}
                    onChange={(event) => updateForm('userId', event.target.value)}
                    disabled={Boolean(editingUserId)}
                    required
                    minLength={4}
                    maxLength={20}
                    className={textInputClassName()}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Password</span>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) => updateForm('password', event.target.value)}
                    required={!editingUserId}
                    minLength={5}
                    maxLength={72}
                    placeholder={editingUserId ? 'Leave unchanged' : ''}
                    className={textInputClassName()}
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className={fieldLabelClassName()}>Full Name</span>
                <input
                  value={form.realName}
                  onChange={(event) => updateForm('realName', event.target.value)}
                  required
                  maxLength={35}
                  className={textInputClassName()}
                />
              </label>

              <div className={responsiveFieldGridClassName()}>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateForm('email', event.target.value)}
                    required
                    maxLength={55}
                    className={textInputClassName()}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Phone</span>
                  <input
                    value={form.phone}
                    onChange={(event) => updateForm('phone', event.target.value)}
                    maxLength={30}
                    className={textInputClassName()}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3 border-t border-akiva-border pt-5">
              <h2 className="text-sm font-semibold text-akiva-text">Access</h2>
              <div className={responsiveFieldGridClassName()}>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Security Role</span>
                  <SearchableSelect
                    value={String(form.securityRoleId)}
                    onChange={(value) => updateForm('securityRoleId', Number(value))}
                    options={(lookups?.securityRoles ?? []).map((role) => ({ value: String(role.value), label: role.label }))}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Default Location</span>
                  <SearchableSelect
                    value={form.defaultLocation}
                    onChange={(value) => updateForm('defaultLocation', value)}
                    options={lookups?.locations ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
              </div>

              <div className={responsiveFieldGridClassName()}>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Page Size</span>
                  <SearchableSelect
                    value={form.pageSize}
                    onChange={(value) => updateForm('pageSize', value)}
                    options={lookups?.pageSizes ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Theme</span>
                  <SearchableSelect
                    value={form.theme}
                    onChange={(value) => updateForm('theme', value)}
                    options={lookups?.themes ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Language</span>
                  <SearchableSelect
                    value={form.language}
                    onChange={(value) => updateForm('language', value)}
                    options={lookups?.languages ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>PDF Language</span>
                  <SearchableSelect
                    value={String(form.pdfLanguage)}
                    onChange={(value) => updateForm('pdfLanguage', Number(value))}
                    options={(lookups?.pdfLanguages ?? []).map((option) => ({ value: String(option.value), label: option.label }))}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3 border-t border-akiva-border pt-5">
              <h2 className="text-sm font-semibold text-akiva-text">Linked Records</h2>
              <div className={responsiveFieldGridClassName()}>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Customer Code</span>
                  <input value={form.customerId} onChange={(event) => updateForm('customerId', event.target.value)} maxLength={10} className={textInputClassName()} />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Branch Code</span>
                  <input value={form.branchCode} onChange={(event) => updateForm('branchCode', event.target.value)} maxLength={10} className={textInputClassName()} />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Supplier Code</span>
                  <input value={form.supplierId} onChange={(event) => updateForm('supplierId', event.target.value)} maxLength={10} className={textInputClassName()} />
                </label>
                <label className="space-y-1.5">
                  <span className={fieldLabelClassName()}>Salesperson</span>
                  <SearchableSelect
                    value={form.salesman}
                    onChange={(value) => updateForm('salesman', value)}
                    options={[{ value: '', label: 'Not restricted' }, ...(lookups?.salespeople ?? [])]}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3 border-t border-akiva-border pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-akiva-text">
                <Shield className="h-4 w-4" />
                Modules
              </div>
              <div className={responsiveOptionGridClassName()}>
                {(lookups?.modules ?? []).map((module, index) => (
                  <AkivaCheckbox
                    key={module.key}
                    checked={Boolean(form.modulesAllowed[index])}
                    onChange={(checked) => updateModule(index, checked)}
                    label={module.label}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-3 border-t border-akiva-border pt-5">
              <h2 className="text-sm font-semibold text-akiva-text">Preferences</h2>
              <div className={responsiveOptionGridClassName()}>
                {[
                  ['canCreateTender', 'Can create tenders'],
                  ['showDashboard', 'Show dashboard'],
                  ['showPageHelp', 'Show page help'],
                  ['showFieldHelp', 'Show field help'],
                  ['blocked', 'Blocked'],
                ].map(([key, label]) => (
                  <AkivaCheckbox
                    key={key}
                    checked={Boolean(form[key as keyof WwwUserForm])}
                    onChange={(checked) => updateBooleanForm(key as keyof WwwUserForm, checked)}
                    label={label}
                  />
                ))}
              </div>
            </section>
          </form>
        ) : (
          <p className="text-sm text-akiva-text-muted">Load users to begin editing.</p>
        )}
      </Modal>
      {confirmationDialog}
      </div>
    </div>
  );
}
