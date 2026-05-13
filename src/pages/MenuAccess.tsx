import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers3,
  ListChecks,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import { fetchMenuAccess, saveMenuAccess } from '../data/menuAccessApi';
import type { MenuAccessMenuItem, MenuAccessPayload, MenuAccessUser } from '../types/menuAccess';

type SummaryFilter = 'all' | 'with-access' | 'without-access' | 'blocked';

interface FlatMenuItem extends MenuAccessMenuItem {
  depth: number;
  descendantIds: number[];
}

const USER_PAGE_SIZE = 8;

function textInputClassName() {
  return 'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30';
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function flattenMenu(items: MenuAccessMenuItem[], depth = 0): FlatMenuItem[] {
  return items.flatMap((item) => {
    const children = Array.isArray(item.children) ? item.children : [];
    const flattenedChildren = flattenMenu(children, depth + 1);
    const descendantIds = flattenedChildren.map((child) => child.id);
    return [{ ...item, children, depth, descendantIds }, ...flattenedChildren];
  });
}

function branchIds(item: Pick<FlatMenuItem, 'id' | 'descendantIds'>) {
  return [item.id, ...item.descendantIds];
}

function AkivaMenuCheckbox({
  checked,
  partial,
  onChange,
  title,
  description,
  depth,
  childCount,
}: {
  checked: boolean;
  partial: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
  depth: number;
  childCount: number;
}) {
  return (
    <label
      className={`group flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition ${
        checked
          ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-text shadow-sm'
          : partial
            ? 'border-akiva-accent/70 bg-akiva-accent-soft/45 text-akiva-text'
            : 'border-akiva-border bg-akiva-surface text-akiva-text hover:border-akiva-accent/70 hover:bg-akiva-surface-muted'
      }`}
      style={{ paddingLeft: `${Math.min(depth, 3) * 1 + 0.75}rem` }}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
          checked
            ? 'border-akiva-accent bg-akiva-accent text-white'
            : partial
              ? 'border-akiva-accent bg-akiva-surface text-akiva-accent'
              : 'border-akiva-border-strong bg-akiva-surface-raised text-transparent group-hover:border-akiva-accent'
        }`}
      >
        {checked ? <Check className="h-3.5 w-3.5" /> : <span className="h-0.5 w-2.5 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {childCount > 0 ? (
            <span className="shrink-0 rounded-full bg-akiva-surface-muted px-2 py-0.5 text-[11px] font-medium text-akiva-text-muted">
              {pluralize(childCount, 'child menu')}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-akiva-text-muted">{description}</span>
      </span>
    </label>
  );
}

export function MenuAccess() {
  const [payload, setPayload] = useState<MenuAccessPayload | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeRootId, setActiveRootId] = useState<number | null>(null);
  const [selectedMenuIds, setSelectedMenuIds] = useState<number[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [menuSearchTerm, setMenuSearchTerm] = useState('');
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>('all');
  const [userPage, setUserPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  const loadMenuAccess = async () => {
    setLoading(true);
    setError('');
    try {
      const nextPayload = await fetchMenuAccess();
      setPayload(nextPayload);
      const nextSelectedUser =
        nextPayload.users.find((user) => user.userId === selectedUserId) ??
        nextPayload.users.find((user) => user.allowedCount > 0) ??
        nextPayload.users[0];

      if (nextSelectedUser) {
        setSelectedUserId(nextSelectedUser.userId);
        setSelectedMenuIds(nextSelectedUser.allowedMenuIds);
      }

      const firstAllowedRoot = nextPayload.menu.find((root) => {
        const ids = branchIds({ id: root.id, descendantIds: flattenMenu(root.children).map((item) => item.id) });
        return nextSelectedUser?.allowedMenuIds.some((id) => ids.includes(id));
      });
      setActiveRootId((current) => current ?? firstAllowedRoot?.id ?? nextPayload.menu[0]?.id ?? null);
      if (nextPayload.menu.length === 0) setActiveRootId(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Menu access could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMenuAccess();
  }, []);

  const users = payload?.users ?? [];
  const menu = payload?.menu ?? [];
  const stats = payload?.stats ?? {
    totalUsers: 0,
    usersWithAccess: 0,
    usersWithoutAccess: 0,
    blockedUsers: 0,
    menuItems: 0,
    assignedLinks: 0,
  };

  const flatMenu = useMemo(() => flattenMenu(menu), [menu]);
  const selectedUser = users.find((user) => user.userId === selectedUserId) ?? null;
  const activeRoot = menu.find((root) => root.id === activeRootId) ?? menu[0] ?? null;
  const selectedSet = useMemo(() => new Set(selectedMenuIds), [selectedMenuIds]);
  const originalSet = useMemo(() => new Set(selectedUser?.allowedMenuIds ?? []), [selectedUser]);
  const isDirty = useMemo(() => {
    if (!selectedUser) return false;
    if (selectedSet.size !== originalSet.size) return true;
    for (const id of selectedSet) {
      if (!originalSet.has(id)) return true;
    }
    return false;
  }, [originalSet, selectedSet, selectedUser]);

  const filteredUsers = useMemo(() => {
    const needle = userSearchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !needle ||
        user.userId.toLowerCase().includes(needle) ||
        user.realName.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle);

      const matchesSummary =
        summaryFilter === 'all' ||
        (summaryFilter === 'with-access' && user.allowedCount > 0) ||
        (summaryFilter === 'without-access' && user.allowedCount === 0) ||
        (summaryFilter === 'blocked' && user.blocked);

      return matchesSearch && matchesSummary;
    });
  }, [summaryFilter, userSearchTerm, users]);

  useEffect(() => {
    setUserPage(0);
  }, [summaryFilter, userSearchTerm]);

  const userPageCount = Math.max(1, Math.ceil(filteredUsers.length / USER_PAGE_SIZE));
  const pagedUsers = filteredUsers.slice(userPage * USER_PAGE_SIZE, userPage * USER_PAGE_SIZE + USER_PAGE_SIZE);

  const visibleMenu = useMemo(() => {
    const needle = menuSearchTerm.trim().toLowerCase();
    if (needle) {
      return flatMenu.filter((item) => {
        return (
          item.caption.toLowerCase().includes(needle) ||
          item.path.toLowerCase().includes(needle) ||
          item.href.toLowerCase().includes(needle)
        );
      });
    }

    return activeRoot ? flattenMenu([activeRoot]) : [];
  }, [activeRoot, flatMenu, menuSearchTerm]);

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        value: user.userId,
        label: `${user.realName || user.userId} (${user.userId})`,
        searchText: `${user.realName} ${user.userId} ${user.email}`,
      })),
    [users]
  );

  const selectUser = async (user: MenuAccessUser) => {
    if (user.userId === selectedUserId) return;
    if (isDirty) {
      const confirmed = await confirm({
        title: 'Switch User',
        description: 'You have unsaved menu access changes for the current user.',
        detail: 'Switching users will discard those unsaved changes.',
        confirmLabel: 'Switch User',
      });
      if (!confirmed) return;
    }

    setSelectedUserId(user.userId);
    setSelectedMenuIds(user.allowedMenuIds);
    setMessage('');
    setError('');

    const firstAllowedRoot = menu.find((root) => {
      const ids = branchIds({ id: root.id, descendantIds: flattenMenu(root.children).map((item) => item.id) });
      return user.allowedMenuIds.some((id) => ids.includes(id));
    });
    if (firstAllowedRoot) setActiveRootId(firstAllowedRoot.id);
  };

  const selectUserById = async (userId: string) => {
    const user = users.find((candidate) => candidate.userId === userId);
    if (user) await selectUser(user);
  };

  const updateBranch = (item: FlatMenuItem, checked: boolean) => {
    const ids = new Set(branchIds(item));
    setSelectedMenuIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return Array.from(next).sort((a, b) => a - b);
    });
  };

  const updateRoot = (root: MenuAccessMenuItem, checked: boolean) => {
    const flattenedRoot = flattenMenu([root]);
    const ids = new Set(flattenedRoot.map((item) => item.id));
    setSelectedMenuIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return Array.from(next).sort((a, b) => a - b);
    });
  };

  const enableVisible = () => {
    setSelectedMenuIds((current) => {
      const next = new Set(current);
      visibleMenu.forEach((item) => next.add(item.id));
      return Array.from(next).sort((a, b) => a - b);
    });
  };

  const disableVisible = async () => {
    const confirmed = await confirm({
      title: 'Disable Visible Menus',
      description: 'The visible menu items will be removed from this user until you save.',
      detail: `${pluralize(visibleMenu.length, 'visible menu')} selected by the current view.`,
      confirmLabel: 'Disable Visible',
    });
    if (!confirmed) return;

    const visibleIds = new Set(visibleMenu.map((item) => item.id));
    setSelectedMenuIds((current) => current.filter((id) => !visibleIds.has(id)));
  };

  const saveSelectedUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const response = await saveMenuAccess(selectedUser.userId, { allowedMenuIds: selectedMenuIds });
      if (response.data) {
        setPayload(response.data);
        setSelectedUserId(response.data.selectedUserId ?? selectedUser.userId);
        const updatedUser = response.data.users.find((user) => user.userId === selectedUser.userId);
        setSelectedMenuIds(updatedUser?.allowedMenuIds ?? selectedMenuIds);
      }
      setMessage(response.message ?? 'Menu access saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Menu access could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const applySummaryFilter = (filter: SummaryFilter) => {
    setSummaryFilter(filter);
    setUserSearchTerm('');
  };

  const summaryCards: Array<{ key: SummaryFilter; label: string; value: number; detail: string }> = [
    { key: 'all', label: 'Users', value: stats.totalUsers, detail: `${stats.menuItems} menu items` },
    { key: 'with-access', label: 'Configured', value: stats.usersWithAccess, detail: `${stats.assignedLinks} allowed links` },
    { key: 'without-access', label: 'No Menus', value: stats.usersWithoutAccess, detail: 'Need review' },
    { key: 'blocked', label: 'Blocked', value: stats.blockedUsers, detail: 'Blocked accounts' },
  ];

  if (loading && !payload) {
    return (
      <div className="flex min-h-80 items-center justify-center text-akiva-text-muted">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading menu access...
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
                  <ListChecks className="h-3.5 w-3.5" />
                  User menus
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                Menu Access
              </h1>
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button variant="secondary" onClick={() => void loadMenuAccess()} disabled={loading || saving}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => void saveSelectedUser()} disabled={!selectedUser || !isDirty || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
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

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {['1 Select user', '2 Choose menu access', '3 Save changes'].map((step, index) => (
                <div
                  key={step}
                  className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                    index === 0 && selectedUser
                      ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-text'
                      : index === 1 && selectedMenuIds.length > 0
                        ? 'border-akiva-accent bg-akiva-accent-soft text-akiva-text'
                        : index === 2 && isDirty
                          ? 'border-akiva-accent bg-akiva-surface-raised text-akiva-text'
                          : 'border-akiva-border bg-akiva-surface text-akiva-text-muted'
                  }`}
                >
                  {step}
                </div>
              ))}
            </div>

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

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(20rem,25rem)_minmax(0,1fr)]">
              <aside className="space-y-4 rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="space-y-2">
                  <h2 className="text-base font-semibold text-akiva-text">Select User</h2>
                  <SearchableSelect
                    value={selectedUserId}
                    onChange={(value) => void selectUserById(String(value))}
                    options={userOptions}
                    placeholder="Find user..."
                    className="min-h-11 rounded-lg"
                    panelClassName="z-[120]"
                  />
                </div>

                {selectedUser ? (
                  <div className="rounded-xl border border-akiva-border bg-akiva-surface px-4 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-akiva-accent text-white">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-akiva-text">{selectedUser.realName || selectedUser.userId}</p>
                        <p className="truncate text-xs text-akiva-text-muted">{selectedUser.userId}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-akiva-accent-soft px-2.5 py-1 text-xs font-medium text-akiva-text">
                            {pluralize(selectedMenuIds.length, 'menu')}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              selectedUser.blocked
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                            }`}
                          >
                            {selectedUser.blocked ? 'Blocked' : 'Open'}
                          </span>
                          {isDirty ? (
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                              Unsaved
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                    <input
                      type="text"
                      placeholder="Filter user list..."
                      value={userSearchTerm}
                      onChange={(event) => setUserSearchTerm(event.target.value)}
                      className={`${textInputClassName()} pl-10`}
                    />
                  </div>

                  <div className="space-y-2">
                    {pagedUsers.map((user) => (
                      <button
                        key={user.userId}
                        type="button"
                        onClick={() => void selectUser(user)}
                        className={`flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-2 text-left transition focus:outline-none focus:ring-2 focus:ring-akiva-accent ${
                          user.userId === selectedUserId
                            ? 'border-akiva-accent bg-akiva-accent-soft'
                            : 'border-akiva-border bg-akiva-surface hover:border-akiva-accent hover:bg-akiva-surface-muted'
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-akiva-accent text-white">
                          <User className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-akiva-text">{user.realName || user.userId}</p>
                          <p className="truncate text-xs text-akiva-text-muted">{user.userId}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-akiva-border bg-akiva-surface-muted px-2 py-1 text-xs text-akiva-text-muted">
                          {user.allowedCount}
                        </span>
                      </button>
                    ))}
                    {pagedUsers.length === 0 ? (
                      <div className="rounded-lg border border-akiva-border bg-akiva-surface px-4 py-8 text-center text-sm text-akiva-text-muted">
                        No users match the current filter.
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 text-xs text-akiva-text-muted">
                    <span>
                      {filteredUsers.length === 0 ? '0 users' : `${userPage * USER_PAGE_SIZE + 1}-${Math.min(filteredUsers.length, (userPage + 1) * USER_PAGE_SIZE)} of ${filteredUsers.length}`}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setUserPage((current) => Math.max(0, current - 1))}
                        disabled={userPage === 0}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface text-akiva-text-muted transition hover:text-akiva-text disabled:opacity-40"
                        aria-label="Previous users"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPage((current) => Math.min(userPageCount - 1, current + 1))}
                        disabled={userPage >= userPageCount - 1}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface text-akiva-text-muted transition hover:text-akiva-text disabled:opacity-40"
                        aria-label="Next users"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </aside>

              <div className="space-y-4 rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-akiva-text">Choose Menu Access</h2>
                    <p className="mt-1 text-xs text-akiva-text-muted">
                      {activeRoot ? activeRoot.caption : 'No module selected'} · {pluralize(selectedMenuIds.length, 'selected menu')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:w-[36rem]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                      <input
                        type="text"
                        value={menuSearchTerm}
                        onChange={(event) => setMenuSearchTerm(event.target.value)}
                        placeholder="Search all menus..."
                        className={`${textInputClassName()} pl-10`}
                      />
                    </div>
                    <Button variant="secondary" type="button" onClick={enableVisible} disabled={!selectedUser || visibleMenu.length === 0}>
                      Enable View
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => void disableVisible()} disabled={!selectedUser || visibleMenu.length === 0}>
                      Disable View
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[17rem_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-akiva-text-muted">
                      <Layers3 className="h-4 w-4" />
                      Modules
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                      {menu.map((root) => {
                        const rootFlat = flattenMenu([root]);
                        const rootIds = rootFlat.map((item) => item.id);
                        const selectedCount = rootIds.filter((id) => selectedSet.has(id)).length;
                        const allSelected = selectedCount > 0 && selectedCount === rootIds.length;
                        const partial = selectedCount > 0 && selectedCount < rootIds.length;
                        return (
                          <div
                            key={root.id}
                            className={`rounded-lg border bg-akiva-surface px-3 py-3 transition ${
                              activeRoot?.id === root.id && !menuSearchTerm
                                ? 'border-akiva-accent ring-2 ring-akiva-accent/20'
                                : 'border-akiva-border'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveRootId(root.id);
                                setMenuSearchTerm('');
                              }}
                              className="flex w-full min-w-0 items-start justify-between gap-3 text-left"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-akiva-text">{root.caption}</span>
                                <span className="mt-0.5 block text-xs text-akiva-text-muted">
                                  {selectedCount}/{rootIds.length} selected
                                </span>
                              </span>
                              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-akiva-text-muted" />
                            </button>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => updateRoot(root, true)}
                                disabled={allSelected}
                                className="min-h-9 rounded-lg border border-akiva-border bg-akiva-surface-muted px-2 text-xs font-medium text-akiva-text transition hover:border-akiva-accent disabled:opacity-50"
                              >
                                Enable
                              </button>
                              <button
                                type="button"
                                onClick={() => updateRoot(root, false)}
                                disabled={!allSelected && !partial}
                                className="min-h-9 rounded-lg border border-akiva-border bg-akiva-surface-muted px-2 text-xs font-medium text-akiva-text transition hover:border-akiva-accent disabled:opacity-50"
                              >
                                Disable
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="min-w-0">
                    {selectedUser ? (
                      <div className="max-h-[42rem] overflow-auto rounded-xl border border-akiva-border bg-akiva-surface p-2">
                        <div className="grid grid-cols-1 gap-2">
                          {visibleMenu.map((item) => {
                            const ids = branchIds(item);
                            const selectedCount = ids.filter((id) => selectedSet.has(id)).length;
                            const checked = selectedCount > 0 && selectedCount === ids.length;
                            const partial = selectedCount > 0 && selectedCount < ids.length;
                            const description = item.descendantIds.length > 0 ? item.path : `${item.path} · ${item.href || '#'}`;
                            return (
                              <AkivaMenuCheckbox
                                key={item.id}
                                checked={checked}
                                partial={partial}
                                onChange={(nextChecked) => updateBranch(item, nextChecked)}
                                title={item.caption}
                                description={description}
                                depth={menuSearchTerm ? 0 : item.depth}
                                childCount={item.descendantIds.length}
                              />
                            );
                          })}
                        </div>
                        {visibleMenu.length === 0 ? (
                          <div className="rounded-lg border border-akiva-border bg-akiva-surface-muted px-4 py-8 text-center text-sm text-akiva-text-muted">
                            No menu items match the current search.
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-akiva-border bg-akiva-surface px-4 py-12 text-center text-sm text-akiva-text-muted">
                        Select a user to edit menu access.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl border border-akiva-border bg-akiva-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="grid grid-cols-3 gap-3 text-sm sm:min-w-[24rem]">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-akiva-text-muted">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Selected
                      </div>
                      <p className="mt-1 text-lg font-bold text-akiva-text">{selectedMenuIds.length}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-akiva-text-muted">
                        <Layers3 className="h-3.5 w-3.5" />
                        Available
                      </div>
                      <p className="mt-1 text-lg font-bold text-akiva-text">{flatMenu.length}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-akiva-text-muted">
                        <ListChecks className="h-3.5 w-3.5" />
                        View
                      </div>
                      <p className="mt-1 text-lg font-bold text-akiva-text">{visibleMenu.length}</p>
                    </div>
                  </div>
                  <Button onClick={() => void saveSelectedUser()} disabled={!selectedUser || !isDirty || saving} className="sm:min-w-40">
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
        {confirmationDialog}
      </div>
    </div>
  );
}
