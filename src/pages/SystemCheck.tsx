import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FolderCheck,
  Loader2,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { fetchSystemCheck } from '../data/systemCheckApi';
import type { SystemCheckItem, SystemCheckPayload, SystemCheckSection, SystemCheckStatus } from '../types/systemCheck';

const sectionIcons: Record<string, LucideIcon> = {
  Server,
  Database,
  FolderCheck,
  Settings2,
  ClipboardCheck,
};

function statusTone(status: SystemCheckStatus): string {
  if (status === 'pass') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200';
  return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200';
}

function statusIcon(status: SystemCheckStatus): LucideIcon {
  if (status === 'pass') return CheckCircle2;
  if (status === 'warning') return AlertTriangle;
  return XCircle;
}

function statusLabel(status: SystemCheckStatus): string {
  if (status === 'pass') return 'Healthy';
  if (status === 'warning') return 'Needs review';
  return 'Action required';
}

function formatCheckedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-akiva-surface-muted text-akiva-text">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-sm text-akiva-text-muted">{detail}</p>
    </article>
  );
}

function CheckRow({ item }: { item: SystemCheckItem }) {
  const Icon = statusIcon(item.status);
  const checked = item.status === 'pass';

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold leading-5 text-akiva-text">{item.label}</p>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(item.status)}`}>
            <Icon className="h-3 w-3" />
            {statusLabel(item.status)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{item.detail}</p>
        <p className="mt-1 truncate text-xs font-semibold text-akiva-text">{item.value}</p>
      </div>
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border shadow-sm ${
          checked
            ? 'border-akiva-accent bg-akiva-accent text-white'
            : item.status === 'warning'
              ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200'
              : 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
        }`}
      >
        {checked ? <Check className="h-4 w-4 stroke-[3]" /> : <Icon className="h-4 w-4" />}
      </span>
    </div>
  );
}

function CheckSection({ section }: { section: SystemCheckSection }) {
  const Icon = sectionIcons[section.icon] ?? ClipboardCheck;

  return (
    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-akiva-text">{section.title}</p>
          <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{section.description}</p>
        </div>
        <Icon className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
      </div>
      <div className="space-y-2.5">
        {section.items.map((item) => (
          <CheckRow key={`${section.id}-${item.label}`} item={item} />
        ))}
      </div>
    </section>
  );
}

export function SystemCheck() {
  const [payload, setPayload] = useState<SystemCheckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadSystemCheck = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      setPayload(await fetchSystemCheck());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'System check could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSystemCheck();
  }, []);

  const summary = payload?.summary;
  const sections = useMemo(() => payload?.sections ?? [], [payload?.sections]);
  const StatusIcon = summary ? statusIcon(summary.status) : ShieldCheck;

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  General settings
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <StatusIcon className="h-3.5 w-3.5" />
                  {summary ? statusLabel(summary.status) : 'System check'}
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                System Check
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Review application, database, storage, and configuration readiness.
              </p>
            </div>

            <button
              type="button"
              aria-label="Refresh system check"
              title="Refresh system check"
              onClick={() => void loadSystemCheck()}
              disabled={loading}
              className="flex h-10 w-10 items-center justify-center self-start rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60 lg:self-center"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-7">
            {errorMessage ? (
              <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Passed" value={String(summary?.passed ?? 0)} detail={`${summary?.total ?? 0} checks evaluated`} icon={CheckCircle2} />
              <SummaryCard label="Warnings" value={String(summary?.warnings ?? 0)} detail="Items to review" icon={AlertTriangle} />
              <SummaryCard label="Failures" value={String(summary?.failed ?? 0)} detail="Items requiring action" icon={XCircle} />
              <SummaryCard label="Last checked" value={summary ? formatCheckedAt(summary.checkedAt) : '-'} detail={`Environment: ${summary?.environment ?? '-'}`} icon={RefreshCw} />
            </div>

            {loading && !payload ? (
              <div className="flex min-h-80 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-raised text-sm text-akiva-text-muted shadow-sm">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Running system check
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {sections.map((section) => (
                  <CheckSection key={section.id} section={section} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
