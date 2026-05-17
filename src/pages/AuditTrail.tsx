import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Database, Filter, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { DateRangePicker, getDefaultDateRange } from '../components/common/DateRangePicker';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { fetchAuditTrail } from '../data/auditTrailApi';
import type { AuditTrailFilters, AuditTrailPayload, AuditTrailRecord, AuditTrailSortKey } from '../types/auditTrail';

const inputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const defaultRange = getDefaultDateRange();

const DEFAULT_FILTERS: AuditTrailFilters = {
  from: defaultRange.from,
  to: defaultRange.to,
  user: 'ALL',
  table: 'ALL',
  event: '',
  text: '',
  page: 1,
  perPage: 50,
  sort: 'transactionDate',
  sortDir: 'desc',
};

function eventTone(event: string): string {
  switch (event) {
    case 'insert':
    case 'created':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:ring-emerald-900';
    case 'update':
    case 'updated':
    case 'restored':
      return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-900';
    case 'delete':
    case 'deleted':
      return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-900';
    default:
      return 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700';
  }
}

function formatJson(values: Record<string, unknown>) {
  const keys = Object.keys(values);
  if (keys.length === 0) return '';
  return JSON.stringify(values, null, 2);
}

function AuditRow({ record }: { record: AuditTrailRecord }) {
  const oldValues = formatJson(record.oldValues);
  const newValues = formatJson(record.newValues);

  return (
    <tr className="border-b border-akiva-border align-top last:border-0">
      <td className="whitespace-nowrap px-4 py-3 text-sm text-akiva-text">{record.transactionDate}</td>
      <td className="px-4 py-3 text-sm text-akiva-text">{record.userId || 'api'}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${eventTone(record.event)}`}>
          {record.event || 'unknown'}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-akiva-text">
        <div className="font-medium">{record.tableName || 'unknown'}</div>
        <div className="mt-1 text-xs text-akiva-text-muted">{record.source || 'legacy'}</div>
      </td>
      <td className="px-4 py-3">
        <details className="group max-w-3xl">
          <summary className="cursor-pointer list-none text-sm text-akiva-text hover:text-akiva-accent">
            <span className="line-clamp-2 font-mono text-xs leading-5 text-akiva-text-muted group-open:hidden">
              {record.queryString}
            </span>
            <span className="hidden text-xs font-semibold text-akiva-accent group-open:inline">Hide details</span>
          </summary>
          <div className="mt-3 space-y-3">
            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
              {record.queryString}
            </pre>
            {(oldValues || newValues) && (
              <div className="grid gap-3 lg:grid-cols-2">
                {oldValues && (
                  <pre className="max-h-48 overflow-auto rounded-lg border border-akiva-border bg-akiva-surface-muted p-3 text-xs text-akiva-text">
                    {oldValues}
                  </pre>
                )}
                {newValues && (
                  <pre className="max-h-48 overflow-auto rounded-lg border border-akiva-border bg-akiva-surface-muted p-3 text-xs text-akiva-text">
                    {newValues}
                  </pre>
                )}
              </div>
            )}
            <div className="grid gap-2 text-xs text-akiva-text-muted md:grid-cols-2">
              <span>{record.requestMethod || 'REQUEST'} {record.url}</span>
              <span>{record.ipAddress}{record.executionMs !== null ? ` · ${record.executionMs} ms` : ''}</span>
            </div>
          </div>
        </details>
      </td>
    </tr>
  );
}

function SortHeader({
  label,
  sortKey,
  filters,
  onSort,
  className = '',
}: {
  label: string;
  sortKey: AuditTrailSortKey;
  filters: AuditTrailFilters;
  onSort: (sortKey: AuditTrailSortKey) => void;
  className?: string;
}) {
  const active = filters.sort === sortKey;
  const SortIcon = active ? (filters.sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th
      aria-sort={active ? (filters.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-3 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-akiva-text focus:outline-none focus:ring-2 focus:ring-akiva-accent"
      >
        <span>{label}</span>
        <SortIcon className={`h-3.5 w-3.5 ${active ? 'text-akiva-accent' : 'text-akiva-text-muted'}`} />
      </button>
    </th>
  );
}

export function AuditTrail() {
  const [filters, setFilters] = useState<AuditTrailFilters>(DEFAULT_FILTERS);
  const [pendingFilters, setPendingFilters] = useState<AuditTrailFilters>(DEFAULT_FILTERS);
  const [payload, setPayload] = useState<AuditTrailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const userOptions = useMemo(
    () => [{ value: 'ALL', label: 'All users' }, ...(payload?.lookups.users ?? [])],
    [payload?.lookups.users]
  );
  const tableOptions = useMemo(
    () => [{ value: 'ALL', label: 'All tables' }, ...(payload?.lookups.tables ?? [])],
    [payload?.lookups.tables]
  );

  const loadAuditTrail = async (nextFilters = filters) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchAuditTrail(nextFilters);
      setPayload(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Audit trail could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAuditTrail(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const updatePendingFilter = (field: keyof AuditTrailFilters, value: string | number) => {
    setPendingFilters((current) => ({ ...current, [field]: value, page: 1 }));
  };

  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({ ...pendingFilters, page: 1 });
  };

  const changePage = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    setPendingFilters(next);
  };

  const changeSort = (sortKey: AuditTrailSortKey) => {
    const next: AuditTrailFilters = {
      ...filters,
      sort: sortKey,
      sortDir: filters.sort === sortKey && filters.sortDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    };
    setFilters(next);
    setPendingFilters(next);
  };

  const pagination = payload?.pagination ?? { page: 1, perPage: 50, total: 0, lastPage: 1 };
  const summary = payload?.summary;

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Security
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <Database className="h-3.5 w-3.5" />
                  Activity log
                </span>
              </div>
              <h1 className="mt-4 text-lg font-semibold tracking-normal text-akiva-text sm:text-2xl lg:text-[1.875rem]">
                Audit Trail
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Review recent system activity and changes.
              </p>
            </div>

            <button
              type="button"
              aria-label="Refresh audit trail"
              title="Refresh audit trail"
              onClick={() => void loadAuditTrail(filters)}
              className="flex h-10 w-10 items-center justify-center self-start rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text lg:self-center"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-akiva-accent" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Records</p>
                <p className="mt-1 text-2xl font-semibold text-akiva-text">{summary?.total ?? 0}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Range</p>
            <p className="mt-2 text-sm font-medium text-akiva-text">{summary ? `${summary.from} to ${summary.to}` : '-'}</p>
          </div>
          <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Latest Change</p>
            <p className="mt-2 truncate text-sm font-medium text-akiva-text">{summary?.latest || '-'}</p>
          </div>
        </div>

        <form onSubmit={submitFilters} className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="md:col-span-2">
              <DateRangePicker
                value={{ from: pendingFilters.from, to: pendingFilters.to, preset: 'custom' }}
                onChange={(range) => {
                  setPendingFilters((current) => ({ ...current, from: range.from, to: range.to, page: 1 }));
                }}
                triggerClassName="min-h-11 rounded-lg px-3 py-1.5"
              />
            </div>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">User</span>
              <SearchableSelect value={pendingFilters.user} onChange={(value) => updatePendingFilter('user', value)} options={userOptions} inputClassName={inputClass} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Table</span>
              <SearchableSelect value={pendingFilters.table} onChange={(value) => updatePendingFilter('table', value)} options={tableOptions} inputClassName={inputClass} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Event</span>
              <select value={pendingFilters.event} onChange={(event) => updatePendingFilter('event', event.target.value)} className={inputClass}>
                <option value="">All events</option>
                <option value="insert">Insert</option>
                <option value="update">Update</option>
                <option value="delete">Delete</option>
                <option value="created">Model created</option>
                <option value="updated">Model updated</option>
                <option value="deleted">Model deleted</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Text</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-akiva-text-muted" />
                <input value={pendingFilters.text} onChange={(event) => updatePendingFilter('text', event.target.value)} className={`${inputClass} pl-9`} />
              </div>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-akiva-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:opacity-90">
              <Filter className="h-4 w-4" />
              Apply
            </button>
          </div>
        </form>

        {errorMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
            <p>{errorMessage}</p>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface-raised shadow-sm">
          {loading ? (
            <div className="flex min-h-80 items-center justify-center text-akiva-text-muted">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading audit trail
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-akiva-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                  <tr>
                    <SortHeader label="Date/Time" sortKey="transactionDate" filters={filters} onSort={changeSort} />
                    <SortHeader label="User" sortKey="userId" filters={filters} onSort={changeSort} />
                    <SortHeader label="Type" sortKey="event" filters={filters} onSort={changeSort} />
                    <SortHeader label="Table" sortKey="tableName" filters={filters} onSort={changeSort} />
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {payload?.records.length ? (
                    payload.records.map((record, index) => <AuditRow key={`${record.transactionDate}-${record.userId}-${index}`} record={record} />)
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm text-akiva-text-muted">
                        No audit records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 text-sm text-akiva-text-muted sm:flex-row">
          <span>
            Page {pagination.page} of {pagination.lastPage} · {pagination.total} records
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => changePage(pagination.page - 1)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 font-medium text-akiva-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.lastPage}
              onClick={() => changePage(pagination.page + 1)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 font-medium text-akiva-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
          </div>
        </section>
      </div>
    </div>
  );
}
