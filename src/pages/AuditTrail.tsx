import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Database, Filter, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { fetchAuditTrail } from '../data/auditTrailApi';
import type { AuditTrailFilters, AuditTrailPayload, AuditTrailRecord } from '../types/auditTrail';

const inputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const today = () => new Date().toISOString().slice(0, 10);

function lastMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
}

const DEFAULT_FILTERS: AuditTrailFilters = {
  from: lastMonth(),
  to: today(),
  user: 'ALL',
  table: 'ALL',
  event: '',
  text: '',
  page: 1,
  perPage: 50,
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

  const pagination = payload?.pagination ?? { page: 1, perPage: 50, total: 0, lastPage: 1 };
  const summary = payload?.summary;

  return (
    <div className="min-h-full bg-akiva-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-akiva-surface-raised text-akiva-accent shadow-sm ring-1 ring-akiva-border">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold text-akiva-text">Audit Trail</h1>
                <p className="mt-1 text-sm text-akiva-text-muted">Review recent system activity and changes.</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadAuditTrail(filters)}
            className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm font-medium text-akiva-text shadow-sm transition hover:bg-akiva-surface-muted lg:self-auto"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

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
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">From</span>
              <input type="date" value={pendingFilters.from} onChange={(event) => updatePendingFilter('from', event.target.value)} className={inputClass} />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">To</span>
              <input type="date" value={pendingFilters.to} onChange={(event) => updatePendingFilter('to', event.target.value)} className={inputClass} />
            </label>
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
                    <th className="px-4 py-3">Date/Time</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Table</th>
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
    </div>
  );
}
