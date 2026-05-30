import { FormEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Factory,
  KeyRound,
  Loader2,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { requestAkivaPasswordReset, signInWithAkiva } from '../lib/auth/authApi';
import { navigateToPath } from '../lib/navigation';

const inputClass = 'h-12 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm font-medium text-akiva-text shadow-sm outline-none transition placeholder:text-akiva-text-muted focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30';

export function LoginPage() {
  const { setAuthSession } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  const currentDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date());
  }, []);

  const toggleDarkMode = () => {
    setIsDarkMode((current) => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('darkMode', String(next));
      return next;
    });
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setNotice('');
    setLoading(true);

    try {
      const response = await signInWithAkiva({
        identifier,
        password,
        rememberMe,
        callbackURL: '/dashboard',
      });

      setAuthSession(response.session);
      navigateToPath(response.url || '/dashboard');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    setFormError('');
    setNotice('');

    if (!identifier.trim()) {
      setFormError('Enter your email or user ID before requesting a password reset.');
      return;
    }

    setResetLoading(true);
    try {
      setNotice(await requestAkivaPasswordReset(identifier));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Password reset could not be requested.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1520px] items-stretch sm:min-h-[calc(100vh-2rem)] lg:min-h-[calc(100vh-2.5rem)]">
        <section className="akiva-frame grid w-full overflow-hidden rounded-[28px] backdrop-blur lg:grid-cols-[1.05fr_.95fr]">
          <div className="flex min-h-[420px] flex-col justify-between border-b border-akiva-border bg-akiva-surface-raised/80 p-5 sm:p-7 lg:border-b-0 lg:border-r lg:p-8">
            <div className="akiva-login-fade flex items-center justify-between gap-3">
              <button type="button" onClick={() => navigateToPath('/dashboard')} className="flex min-w-0 items-center gap-3 rounded-lg text-left transition hover:opacity-85">
                <img src="/icons/akiva-icon.svg" alt="Akiva" className="h-11 w-11 shrink-0 rounded-2xl shadow-sm" />
                <span className="min-w-0">
                  <span className="block text-lg font-semibold leading-6 text-akiva-text">Akiva</span>
                  <span className="block truncate text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Enterprise operations</span>
                </span>
              </button>
              <button
                type="button"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={toggleDarkMode}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
              >
                {isDarkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>

            <div className="my-8 max-w-2xl">
              <div className="akiva-login-status inline-grid overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface text-xs font-semibold text-akiva-text-muted shadow-sm sm:grid-cols-2">
                <span className="inline-flex min-h-9 items-center gap-2 px-3">
                  <ShieldCheck className="h-4 w-4 text-akiva-accent-text" />
                  <span className="whitespace-nowrap">Protected workspace</span>
                </span>
                <span className="inline-flex min-h-9 items-center gap-2 border-t border-akiva-border px-3 sm:border-l sm:border-t-0">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                  <span className="whitespace-nowrap">{currentDate}</span>
                </span>
              </div>
              <h1 className="akiva-login-fade mt-4 text-2xl font-semibold leading-tight tracking-normal text-akiva-text sm:text-3xl lg:text-4xl" style={{ animationDelay: '90ms' }}>
                Sign in to Akiva
              </h1>
              <p className="akiva-login-fade mt-4 max-w-xl text-sm leading-6 text-akiva-text-muted sm:text-base" style={{ animationDelay: '140ms' }}>
                Access daily finance, inventory, purchasing, sales, and manufacturing work from one calm operating desk.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SignalCard icon={WalletCards} label="Receivables" value="Collections ready" delay={170} />
              <SignalCard icon={Boxes} label="Inventory" value="Stock risk visible" delay={210} />
              <SignalCard icon={Factory} label="Manufacturing" value="Work orders tracked" delay={250} />
              <SignalCard icon={Building2} label="Governance" value="Approvals controlled" delay={290} />
            </div>
          </div>

          <div className="flex items-center justify-center bg-akiva-surface p-5 sm:p-7 lg:p-8">
            <div className="akiva-login-form w-full max-w-md">
              <div className="mb-5">
                <div className="akiva-login-lock inline-flex h-11 w-11 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-akiva-text">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-akiva-text-muted">Use your Akiva account to continue.</p>
              </div>

              {formError ? (
                <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 leading-5">{formError}</span>
                </div>
              ) : null}
              {notice ? (
                <div role="status" className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 leading-5">{notice}</span>
                </div>
              ) : null}

              <form onSubmit={submitForm} className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Email or User ID</span>
                  <span className="relative block">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                    <input
                      type="text"
                      autoComplete="username"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      className={`${inputClass} pl-10`}
                      placeholder="admin or name@company.com"
                      required
                    />
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Password</span>
                  <span className="relative block">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={`${inputClass} pl-10 pr-11`}
                      placeholder="Enter password"
                      required
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="group flex cursor-pointer items-center gap-2 text-sm font-medium text-akiva-text">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="peer sr-only"
                    />
                    <span className={`flex h-5 w-5 items-center justify-center rounded-md border shadow-sm transition ${rememberMe ? 'border-akiva-accent bg-akiva-accent text-white' : 'border-akiva-border bg-akiva-surface-raised text-transparent group-hover:border-akiva-accent'}`}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                    Remember this workstation
                  </label>
                  <button type="button" disabled={resetLoading} onClick={() => void requestPasswordReset()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-akiva-accent-text hover:text-akiva-accent disabled:text-akiva-text-muted">
                    {resetLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Reset password
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-akiva-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-akiva-accent-strong disabled:bg-akiva-accent-soft disabled:text-akiva-text-muted"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Sign in
                </button>
              </form>

              <div className="mt-5 rounded-lg border border-akiva-border bg-akiva-surface-raised px-4 py-3 text-xs leading-5 text-akiva-text-muted shadow-sm">
                Workspace access is monitored by role, location, and approval scope.
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SignalCard({ icon: Icon, label, value, delay }: { icon: LucideIcon; label: string; value: string; delay: number }) {
  return (
    <div className="akiva-login-card rounded-lg border border-akiva-border bg-akiva-surface p-3 shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-akiva-accent-soft text-akiva-accent-text">
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-akiva-text">{label}</span>
          <span className="mt-1 block truncate text-xs text-akiva-text-muted">{value}</span>
        </span>
      </div>
    </div>
  );
}
