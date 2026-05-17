import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { deleteAccessRole, fetchAccessPermissions, saveAccessRole } from '../data/accessPermissionsApi';
import type { AccessPermissionsPayload, AccessRole, AccessRoleForm, AccessToken } from '../types/accessPermissions';

type SummaryFilter = 'all' | 'in-use' | 'with-tokens' | 'without-tokens';

function textInputClassName() {
  return 'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30';
}

function fieldLabelClassName() {
  return 'text-xs font-semibold uppercase text-akiva-text-muted';
}

function responsiveOptionGridClassName() {
  return 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-2';
}

function roleToForm(role: AccessRole): AccessRoleForm {
  return {
    name: role.name,
    tokenIds: [...role.tokenIds],
  };
}

function emptyForm(): AccessRoleForm {
  return {
    name: '',
    tokenIds: [],
  };
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function AkivaCheckbox({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <label
      className={`group flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
        checked
          ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-text shadow-sm'
          : 'border-akiva-border bg-akiva-surface text-akiva-text hover:border-akiva-accent/70 hover:bg-akiva-surface-muted'
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          checked
            ? 'border-akiva-accent bg-akiva-accent text-white'
            : 'border-akiva-border-strong bg-akiva-surface-raised text-transparent group-hover:border-akiva-accent'
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{title}</span>
        {description ? <span className="mt-0.5 block truncate text-xs text-akiva-text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function AccessPermissions() {
  const [payload, setPayload] = useState<AccessPermissionsPayload | null>(null);
  const [form, setForm] = useState<AccessRoleForm>(emptyForm);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [membersRole, setMembersRole] = useState<AccessRole | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [tokenSearchTerm, setTokenSearchTerm] = useState('');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadAccess = async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchAccessPermissions();
      setPayload(nextPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Access permissions could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAccess();
  }, []);

  const roles = payload?.roles ?? [];
  const tokens = payload?.tokens ?? [];
  const stats = payload?.stats ?? {
    totalRoles: 0,
    rolesInUse: 0,
    rolesWithTokens: 0,
    rolesWithoutTokens: 0,
    totalTokens: 0,
    assignedLinks: 0,
  };

  const filteredRoles = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return roles.filter((role) => {
      const matchesSearch =
        !needle ||
        role.name.toLowerCase().includes(needle) ||
        String(role.id).includes(needle) ||
        role.tokenNames.some((tokenName) => tokenName.toLowerCase().includes(needle));

      const matchesSummary =
        summaryFilter === 'all' ||
        (summaryFilter === 'in-use' && role.userCount > 0) ||
        (summaryFilter === 'with-tokens' && role.tokenCount > 0) ||
        (summaryFilter === 'without-tokens' && role.tokenCount === 0);

      return matchesSearch && matchesSummary;
    });
  }, [roles, searchTerm, summaryFilter]);

  const filteredTokens = useMemo(() => {
    const needle = tokenSearchTerm.trim().toLowerCase();
    if (!needle) return tokens;
    return tokens.filter((token) => token.name.toLowerCase().includes(needle) || String(token.id).includes(needle));
  }, [tokenSearchTerm, tokens]);

  const applySummaryFilter = (filter: SummaryFilter) => {
    setSummaryFilter(filter);
    setSearchTerm('');
  };

  const openNewDialog = () => {
    setEditingRoleId(null);
    setForm(emptyForm());
    setTokenSearchTerm('');
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (role: AccessRole) => {
    setEditingRoleId(role.id);
    setForm(roleToForm(role));
    setTokenSearchTerm('');
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const updateToken = (tokenId: number, checked: boolean) => {
    setForm((current) => {
      const tokenIds = new Set(current.tokenIds);
      if (checked) tokenIds.add(tokenId);
      else tokenIds.delete(tokenId);
      return { ...current, tokenIds: Array.from(tokenIds).sort((a, b) => a - b) };
    });
  };

  const selectAllVisibleTokens = () => {
    setForm((current) => ({
      ...current,
      tokenIds: Array.from(new Set([...current.tokenIds, ...filteredTokens.map((token) => token.id)])).sort((a, b) => a - b),
    }));
  };

  const clearVisibleTokens = () => {
    const visibleIds = new Set(filteredTokens.map((token) => token.id));
    setForm((current) => ({
      ...current,
      tokenIds: current.tokenIds.filter((tokenId) => !visibleIds.has(tokenId)),
    }));
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await saveAccessRole(form, editingRoleId ?? undefined);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingRoleId(null);
      setForm(emptyForm());
      setMessage(response.message ?? 'Access role saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Access role could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (role: AccessRole) => {
    const confirmed = await confirm({
      title: 'Delete Access Role',
      description: 'This role will be removed only if no users are assigned to it.',
      detail: `${role.name} (${pluralize(role.userCount, 'user')})`,
      confirmLabel: 'Delete Role',
    });
    if (!confirmed) return;

    setDeletingRoleId(role.id);
    setError('');
    setMessage('');

    try {
      const response = await deleteAccessRole(role.id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? 'Access role deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Access role could not be deleted.');
    } finally {
      setDeletingRoleId(null);
    }
  };

  const tokenPreview = (role: AccessRole) => {
    if (role.tokenNames.length === 0) return 'No tokens assigned';
    if (role.tokenNames.length <= 3) return role.tokenNames.join(', ');
    return `${role.tokenNames.slice(0, 3).join(', ')} +${role.tokenNames.length - 3} more`;
  };

  const openMembersDialog = (role: AccessRole) => {
    setMembersRole(role);
  };

  const columns: AdvancedTableColumn<AccessRole>[] = [
    {
      id: 'role',
      header: 'Role',
      accessor: (row) => `${row.id} ${row.name}`,
      width: 260,
      minWidth: 200,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent text-white">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-akiva-text">{row.name}</p>
            <p className="truncate text-xs text-akiva-text-muted">Role ID {row.id}</p>
          </div>
        </div>
      ),
      exportValue: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: 'users',
      header: 'Users',
      accessor: (row) => row.userCount,
      width: 120,
      minWidth: 100,
      cell: (row) => (
        <button
          type="button"
          onClick={() => openMembersDialog(row)}
          className="inline-flex max-w-full items-center rounded-full border border-akiva-border bg-akiva-surface-muted px-2.5 py-1 text-xs font-medium text-akiva-text transition hover:border-akiva-accent hover:bg-akiva-accent-soft focus:outline-none focus:ring-2 focus:ring-akiva-accent"
          title={`Show users assigned to ${row.name}`}
          aria-label={`Show ${pluralize(row.userCount, 'user')} assigned to ${row.name}`}
        >
          <span className="truncate">{pluralize(row.userCount, 'user')}</span>
        </button>
      ),
    },
    {
      id: 'tokens',
      header: 'Tokens',
      accessor: (row) => tokenPreview(row),
      width: 420,
      minWidth: 260,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-akiva-text">{tokenPreview(row)}</p>
          <p className="mt-0.5 text-xs text-akiva-text-muted">{pluralize(row.tokenCount, 'token')}</p>
        </div>
      ),
      exportValue: (row) => row.tokenNames.join(', '),
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
            onClick={() => openEditDialog(row)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text"
            title="Edit access role"
            aria-label={`Edit ${row.name}`}
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void removeRole(row)}
            disabled={deletingRoleId === row.id}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            title="Delete access role"
            aria-label={`Delete ${row.name}`}
          >
            {deletingRoleId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      ),
    },
  ];

  const summaryCards: Array<{ key: SummaryFilter; label: string; value: number; detail: string }> = [
    { key: 'all', label: 'Total Roles', value: stats.totalRoles, detail: `${stats.totalTokens} tokens available` },
    { key: 'in-use', label: 'Roles In Use', value: stats.rolesInUse, detail: 'Assigned to users' },
    { key: 'with-tokens', label: 'With Tokens', value: stats.rolesWithTokens, detail: `${stats.assignedLinks} token links` },
    { key: 'without-tokens', label: 'Without Tokens', value: stats.rolesWithoutTokens, detail: 'Need assignment review' },
  ];

  if (loading && !payload) {
    return (
      <div className="flex min-h-80 items-center justify-center text-akiva-text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading access permissions...
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
                  <Users className="h-3.5 w-3.5" />
                  General settings
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <KeyRound className="h-3.5 w-3.5" />
                  User access
                </span>
              </div>
              <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                Access
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Maintain security roles and the page tokens each role can use.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" onClick={() => void loadAccess()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={openNewDialog} disabled={!payload}>
                <Plus className="mr-2 h-4 w-4" />
                Add Role
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

            <div className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
              <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    type="text"
                    placeholder="Search access roles..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className={`${textInputClassName()} pl-10`}
                  />
                </div>
                <Button variant="secondary" onClick={() => applySummaryFilter('all')}>
                  Clear Filters
                </Button>
              </div>

              <AdvancedTable
                tableId="configuration-access"
                columns={columns}
                rows={filteredRoles}
                rowKey={(row) => String(row.id)}
                loading={loading}
                loadingMessage="Loading access permissions..."
                emptyMessage="No access roles found."
                initialPageSize={25}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </div>
          </div>
        </section>

        <Modal
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title={editingRoleId ? 'Edit Access Role' : 'Add Access Role'}
          size="lg"
          footer={
            <>
              <Button variant="secondary" type="button" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" form="access-role-form" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Role
              </Button>
            </>
          }
        >
          <form id="access-role-form" onSubmit={submitForm} className="space-y-5">
            <section className="space-y-3">
              <label className="block space-y-1.5">
                <span className={fieldLabelClassName()}>Role Name</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                  minLength={4}
                  maxLength={40}
                  className={textInputClassName()}
                />
              </label>
            </section>

            <section className="space-y-3 border-t border-akiva-border pt-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-akiva-text">Security Tokens</h2>
                  <p className="mt-1 text-xs text-akiva-text-muted">{form.tokenIds.length} selected</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:w-[34rem]">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                    <input
                      type="text"
                      value={tokenSearchTerm}
                      onChange={(event) => setTokenSearchTerm(event.target.value)}
                      placeholder="Find tokens..."
                      className={`${textInputClassName()} pl-10`}
                    />
                  </div>
                  <Button variant="secondary" type="button" onClick={selectAllVisibleTokens}>
                    Select Visible
                  </Button>
                  <Button variant="secondary" type="button" onClick={clearVisibleTokens}>
                    Clear Visible
                  </Button>
                </div>
              </div>

              <div className={responsiveOptionGridClassName()}>
                {filteredTokens.map((token: AccessToken) => (
                  <AkivaCheckbox
                    key={token.id}
                    checked={form.tokenIds.includes(token.id)}
                    onChange={(checked) => updateToken(token.id, checked)}
                    title={token.name}
                    description={`Token ${token.id}`}
                  />
                ))}
              </div>
            </section>
          </form>
        </Modal>

        <Modal
          isOpen={Boolean(membersRole)}
          onClose={() => setMembersRole(null)}
          title={membersRole ? `Assigned Users: ${membersRole.name}` : 'Assigned Users'}
          size="lg"
          footer={
            <Button variant="secondary" type="button" onClick={() => setMembersRole(null)}>
              Close
            </Button>
          }
        >
          {membersRole ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-akiva-border bg-akiva-surface-muted px-4 py-3">
                <p className="text-sm font-semibold text-akiva-text">{pluralize(membersRole.userCount, 'user')}</p>
                <p className="mt-1 text-xs text-akiva-text-muted">Users currently using this access role.</p>
              </div>

              {membersRole.assignedUsers.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {membersRole.assignedUsers.map((member) => (
                    <div
                      key={member.userId}
                      className="flex min-w-0 items-start gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3 shadow-sm"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-akiva-accent text-white">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-akiva-text">{member.realName || member.userId}</p>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              member.blocked
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                            }`}
                          >
                            {member.blocked ? 'Blocked' : 'Open'}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-akiva-text-muted">{member.userId}</p>
                        <p className="mt-2 truncate text-sm text-akiva-text">{member.email || 'No email'}</p>
                        <p className="mt-0.5 truncate text-xs text-akiva-text-muted">{member.phone || 'No phone'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
                  No users are assigned to this role.
                </div>
              )}
            </div>
          ) : null}
        </Modal>
        {confirmationDialog}
      </div>
    </div>
  );
}
