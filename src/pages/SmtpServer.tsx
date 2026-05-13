import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  KeyRound,
  Loader2,
  MailCheck,
  MailWarning,
  PlugZap,
  RefreshCw,
  Save,
  Send,
  Server,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { fetchSmtpServer, saveSmtpServer, testSmtpServer } from '../data/smtpServerApi';
import type { SmtpPayload, SmtpSettings, SmtpTestResult } from '../types/smtpServer';

const inputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const emptySettings: SmtpSettings = {
  enabled: false,
  host: '',
  port: 25,
  heloAddress: '',
  auth: false,
  username: '',
  password: '',
  passwordConfigured: false,
  timeout: 5,
  encryption: 'none',
  fromAddress: '',
  fromName: '',
};

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ToastNotification({
  type,
  message,
  onClose,
}: {
  type: 'success' | 'error';
  message: string;
  onClose: () => void;
}) {
  const Icon = type === 'success' ? CheckCircle2 : AlertTriangle;
  const tone =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950 dark:text-emerald-100'
      : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100';

  return (
    <div
      role={type === 'success' ? 'status' : 'alert'}
      className={`fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-xl sm:max-w-md ${tone}`}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <p className="min-w-0 flex-1 leading-5">{message}</p>
      <button
        type="button"
        aria-label="Dismiss notification"
        title="Dismiss notification"
        onClick={onClose}
        className="-mr-1 rounded-full p-1 opacity-70 transition hover:bg-white/50 hover:opacity-100 dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatCard({
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

function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-akiva-text">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-white shadow-sm transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-akiva-accent ${checked ? 'border-akiva-accent bg-akiva-accent' : 'border-akiva-border-strong bg-akiva-surface text-transparent'}`}>
        <Check className="h-4 w-4 stroke-[3]" />
      </span>
    </label>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function SmtpServer() {
  const [payload, setPayload] = useState<SmtpPayload | null>(null);
  const [settings, setSettings] = useState<SmtpSettings>(emptySettings);
  const [savedSettings, setSavedSettings] = useState<SmtpSettings>(emptySettings);
  const [testResult, setTestResult] = useState<SmtpTestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchSmtpServer();
      setPayload(data);
      setSettings(data.settings);
      setSavedSettings(data.settings);
      setTestResult(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'SMTP server settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const dirty = useMemo(() => JSON.stringify(settings) !== JSON.stringify(savedSettings), [settings, savedSettings]);

  const updateField = <K extends keyof SmtpSettings>(field: K, value: SmtpSettings[K]) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await saveSmtpServer(settings);
      const data = response.data;
      if (data) {
        setPayload(data);
        setSettings(data.settings);
        setSavedSettings(data.settings);
      }
      setMessage(response.message ?? 'SMTP server settings saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'SMTP server settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setErrorMessage('');
    setTestResult(null);
    try {
      const response = await testSmtpServer(settings);
      setTestResult(response.data?.test ?? null);
      setMessage(response.message ?? 'SMTP server is reachable.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'SMTP server could not be reached.');
    } finally {
      setTesting(false);
    }
  };

  const statusLabel = settings.enabled ? 'SMTP enabled' : 'SMTP disabled';
  const secureLabel = settings.encryption === 'none' ? 'No encryption' : settings.encryption.toUpperCase();
  const authLabel = settings.auth ? 'Auth required' : 'No auth';

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <Server className="h-3.5 w-3.5" />
                  General settings
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <MailCheck className="h-3.5 w-3.5" />
                  Mail delivery
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                SMTP Server
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Configure outgoing mail delivery for system notifications and documents.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <IconButton icon={RefreshCw} label="Reload SMTP settings" onClick={() => void loadSettings()} disabled={loading || saving || testing} />
              <Button variant="secondary" onClick={() => void testConnection()} disabled={loading || saving || testing || !settings.host} className="inline-flex items-center gap-2">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                Test
              </Button>
              <Button onClick={() => void saveSettings()} disabled={loading || saving || testing || !dirty} className="inline-flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
            {errorMessage ? (
              <div className="lg:col-span-12 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            {loading && !payload ? (
              <div className="lg:col-span-12 flex min-h-80 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-raised text-sm text-akiva-text-muted shadow-sm">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading SMTP settings
              </div>
            ) : (
              <>
                <main className="space-y-4 lg:col-span-8">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Status" value={statusLabel} detail="System mail transport" icon={settings.enabled ? MailCheck : MailWarning} />
                    <StatCard label="Host" value={settings.host || 'Not set'} detail={`Port ${settings.port || '-'}`} icon={Server} />
                    <StatCard label="Security" value={secureLabel} detail={authLabel} icon={ShieldCheck} />
                    <StatCard label="Timeout" value={`${settings.timeout || 0}s`} detail={`Saved ${formatDate(settings.updatedAt)}`} icon={Clock3} />
                  </div>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Server host
                        <input className={inputClass} value={settings.host} onChange={(event) => updateField('host', event.target.value)} placeholder="smtp.example.com" />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Port
                        <input type="number" min={1} max={65535} className={inputClass} value={settings.port} onChange={(event) => updateField('port', Number(event.target.value))} />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Encryption
                        <select className={inputClass} value={settings.encryption} onChange={(event) => updateField('encryption', event.target.value as SmtpSettings['encryption'])}>
                          {(payload?.lookups.encryptionOptions ?? []).map((option) => (
                            <option key={String(option.value)} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Timeout
                        <input type="number" min={1} max={120} className={inputClass} value={settings.timeout} onChange={(event) => updateField('timeout', Number(event.target.value))} />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted md:col-span-2">
                        HELO address
                        <input className={inputClass} value={settings.heloAddress} onChange={(event) => updateField('heloAddress', event.target.value)} placeholder="mail.example.com" />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Username
                        <input className={inputClass} value={settings.username} onChange={(event) => updateField('username', event.target.value)} autoComplete="username" />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Password
                        <input
                          type="password"
                          className={inputClass}
                          value={settings.password}
                          onChange={(event) => updateField('password', event.target.value)}
                          placeholder={settings.passwordConfigured ? 'Configured' : ''}
                          autoComplete="new-password"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        From address
                        <input type="email" className={inputClass} value={settings.fromAddress} onChange={(event) => updateField('fromAddress', event.target.value)} placeholder="accounts@example.com" />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        From name
                        <input className={inputClass} value={settings.fromName} onChange={(event) => updateField('fromName', event.target.value)} placeholder="Akiva" />
                      </label>
                    </div>
                  </section>
                </main>

                <aside className="space-y-4 lg:col-span-4">
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-akiva-text">Delivery controls</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">Outgoing mail behaviour</p>
                      </div>
                      <Send className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
                    </div>
                    <div className="space-y-2.5">
                      <ToggleRow checked={settings.enabled} onChange={(value) => updateField('enabled', value)} label="Use SMTP mail" description="Send system email through the configured SMTP server." />
                      <ToggleRow checked={settings.auth} onChange={(value) => updateField('auth', value)} label="Authentication required" description="Use the configured username and password." />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-akiva-text">Connection test</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">Checks host and port reachability.</p>
                      </div>
                      <KeyRound className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
                    </div>
                    {testResult ? (
                      <div className={`rounded-lg border px-3 py-2.5 text-sm shadow-sm ${
                        testResult.status === 'pass'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100'
                          : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-100'
                      }`}>
                        <p className="font-semibold">{testResult.status === 'pass' ? 'Reachable' : 'Failed'}</p>
                        <p className="mt-1 text-xs opacity-80">{testResult.host}:{testResult.port} · {testResult.elapsedMs} ms</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 text-sm text-akiva-text-muted shadow-sm">
                        No test run yet.
                      </div>
                    )}
                  </section>
                </aside>
              </>
            )}
          </div>
        </section>
      </div>
      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}
