import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Edit, Loader2, Plus, RefreshCw, Save, Search, Shield, Trash2, User, X } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Table } from '../components/common/Table';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
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

function checkboxClassName() {
  return 'h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent';
}

export function UserManagement() {
  const [payload, setPayload] = useState<WwwUsersPayload | null>(null);
  const [form, setForm] = useState<WwwUserForm | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

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
        user.securityRoleName.toLowerCase().includes(needle);
      const matchesRole = !selectedRole || String(user.securityRoleId) === selectedRole;
      const matchesStatus =
        !selectedStatus ||
        (selectedStatus === 'open' && !user.blocked) ||
        (selectedStatus === 'blocked' && user.blocked);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [searchTerm, selectedRole, selectedStatus, users]);

  const startNewUser = () => {
    if (!payload) return;
    setEditingUserId(null);
    setForm({ ...payload.defaults, modulesAllowed: [...payload.defaults.modulesAllowed], password: '' });
    setMessage('');
    setError('');
  };

  const startEditUser = (user: WwwUser) => {
    setEditingUserId(user.userId);
    setForm(userToForm(user));
    setMessage('');
    setError('');
  };

  const updateForm = <Key extends keyof WwwUserForm>(key: Key, value: WwwUserForm[Key]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
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
      if (response.data) setPayload(response.data);
      setEditingUserId(response.data?.selectedUserId ?? form.userId);
      setForm(userToForm(response.data?.users.find((user) => user.userId === form.userId) ?? { ...form, lastVisitDate: null, securityRoleName: '', defaultLocationName: '' }));
      setMessage(response.message ?? 'User saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'User could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (user: WwwUser) => {
    const confirmed = window.confirm(`Delete user ${user.userId}?`);
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

  const columns = [
    {
      key: 'userId',
      header: 'User',
      render: (_value: string, row: WwwUser) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent text-white">
            <User className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-akiva-text">{row.userId}</p>
            <p className="text-xs text-akiva-text-muted">{row.realName}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Contact',
      render: (_value: string, row: WwwUser) => (
        <div>
          <p className="text-akiva-text">{row.email}</p>
          <p className="text-xs text-akiva-text-muted">{row.phone || 'No phone'}</p>
        </div>
      ),
    },
    {
      key: 'securityRoleName',
      header: 'Security Role',
      render: (value: string) => (
        <span className="inline-flex items-center rounded-full bg-akiva-surface-muted px-2.5 py-1 text-xs font-medium text-akiva-text">
          {value}
        </span>
      ),
    },
    {
      key: 'defaultLocationName',
      header: 'Default Location',
      render: (_value: string, row: WwwUser) => row.defaultLocationName || row.defaultLocation || '-',
    },
    {
      key: 'lastVisitDate',
      header: 'Last Visit',
      render: (value: string | null) => formatDate(value),
    },
    {
      key: 'blocked',
      header: 'Status',
      render: (value: boolean) => (
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            value
              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          }`}
        >
          {value ? 'Blocked' : 'Open'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      sortable: false,
      className: 'text-right',
      render: (_value: unknown, row: WwwUser) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => startEditUser(row)}
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-akiva-text">WWW Users</h1>
          <p className="text-sm text-akiva-text-muted">Configuration / Users / WWW Users</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={startNewUser} disabled={!payload}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

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
        {[
          ['Total Users', stats.total],
          ['Open Accounts', stats.open],
          ['Blocked Accounts', stats.blocked],
          ['With Login Record', stats.withRecentLogin],
        ].map(([label, value]) => (
          <Card key={label} className="text-center">
            <p className="text-sm font-medium text-akiva-text-muted">{label}</p>
            <p className="mt-2 text-2xl font-bold text-akiva-text">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
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
              className="lg:w-64"
              inputClassName="border-akiva-border focus:ring-akiva-accent/30"
            />
            <SearchableSelect
              value={selectedStatus}
              onChange={setSelectedStatus}
              placeholder="All Status"
              options={[
                { value: '', label: 'All Status' },
                { value: 'open', label: 'Open' },
                { value: 'blocked', label: 'Blocked' },
              ]}
              className="lg:w-44"
              inputClassName="border-akiva-border focus:ring-akiva-accent/30"
            />
          </div>

          <Table columns={columns} data={filteredUsers} initialSortKey="userId" />
        </Card>

        <Card title={editingUserId ? `Edit ${editingUserId}` : 'Add WWW User'}>
          {form ? (
            <form onSubmit={submitForm} className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">User Login</span>
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
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Password</span>
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
                <span className="text-xs font-semibold uppercase text-akiva-text-muted">Full Name</span>
                <input
                  value={form.realName}
                  onChange={(event) => updateForm('realName', event.target.value)}
                  required
                  maxLength={35}
                  className={textInputClassName()}
                />
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Email</span>
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
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Phone</span>
                  <input
                    value={form.phone}
                    onChange={(event) => updateForm('phone', event.target.value)}
                    maxLength={30}
                    className={textInputClassName()}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Security Role</span>
                  <SearchableSelect
                    value={String(form.securityRoleId)}
                    onChange={(value) => updateForm('securityRoleId', Number(value))}
                    options={(lookups?.securityRoles ?? []).map((role) => ({ value: String(role.value), label: role.label }))}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Default Location</span>
                  <SearchableSelect
                    value={form.defaultLocation}
                    onChange={(value) => updateForm('defaultLocation', value)}
                    options={lookups?.locations ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Page Size</span>
                  <SearchableSelect
                    value={form.pageSize}
                    onChange={(value) => updateForm('pageSize', value)}
                    options={lookups?.pageSizes ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Theme</span>
                  <SearchableSelect
                    value={form.theme}
                    onChange={(value) => updateForm('theme', value)}
                    options={lookups?.themes ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Language</span>
                  <SearchableSelect
                    value={form.language}
                    onChange={(value) => updateForm('language', value)}
                    options={lookups?.languages ?? []}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">PDF Language</span>
                  <SearchableSelect
                    value={String(form.pdfLanguage)}
                    onChange={(value) => updateForm('pdfLanguage', Number(value))}
                    options={(lookups?.pdfLanguages ?? []).map((option) => ({ value: String(option.value), label: option.label }))}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Customer Code</span>
                  <input value={form.customerId} onChange={(event) => updateForm('customerId', event.target.value)} maxLength={10} className={textInputClassName()} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Branch Code</span>
                  <input value={form.branchCode} onChange={(event) => updateForm('branchCode', event.target.value)} maxLength={10} className={textInputClassName()} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Supplier Code</span>
                  <input value={form.supplierId} onChange={(event) => updateForm('supplierId', event.target.value)} maxLength={10} className={textInputClassName()} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase text-akiva-text-muted">Salesperson</span>
                  <SearchableSelect
                    value={form.salesman}
                    onChange={(value) => updateForm('salesman', value)}
                    options={[{ value: '', label: 'Not restricted' }, ...(lookups?.salespeople ?? [])]}
                    inputClassName="border-akiva-border focus:ring-akiva-accent/30"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-akiva-border p-3">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-akiva-text">
                  <Shield className="h-4 w-4" />
                  Modules
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(lookups?.modules ?? []).map((module, index) => (
                    <label key={module.key} className="flex items-center gap-2 text-sm text-akiva-text">
                      <input
                        type="checkbox"
                        checked={Boolean(form.modulesAllowed[index])}
                        onChange={(event) => updateModule(index, event.target.checked)}
                        className={checkboxClassName()}
                      />
                      {module.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[
                  ['canCreateTender', 'Can create tenders'],
                  ['showDashboard', 'Show dashboard'],
                  ['showPageHelp', 'Show page help'],
                  ['showFieldHelp', 'Show field help'],
                  ['blocked', 'Blocked'],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-akiva-text">
                    <input
                      type="checkbox"
                      checked={Boolean(form[key as keyof WwwUserForm])}
                      onChange={(event) => updateForm(key as keyof WwwUserForm, event.target.checked as never)}
                      className={checkboxClassName()}
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-akiva-border pt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setEditingUserId(null);
                    setForm(payload?.defaults ?? null);
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-akiva-text-muted">Load users to begin editing.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
