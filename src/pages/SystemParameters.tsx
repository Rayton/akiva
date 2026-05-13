import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  Filter,
  Gauge,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { SYSTEM_PARAMETER_CATEGORIES, SYSTEM_PARAMETER_DEFINITIONS } from '../data/systemParameterDefinitions';
import {
  EMPTY_SYSTEM_PARAMETER_LOOKUPS,
  fetchSystemParameters,
  updateSystemParameters,
} from '../data/systemParametersApi';
import type {
  SystemParameterDefinition,
  SystemParameterLookupOption,
  SystemParameterLookups,
  SystemParameterValues,
} from '../types/systemParameters';

const inputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

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

function normalizeValue(value: string | undefined): string {
  return value ?? '';
}

function optionsForDefinition(
  definition: SystemParameterDefinition,
  lookups: SystemParameterLookups,
  currentValue: string
): SystemParameterLookupOption[] {
  const baseOptions = definition.lookup ? lookups[definition.lookup] : definition.options ?? [];
  const normalized = baseOptions.map((option) => ({
    value: String(option.value),
    label: String(option.label),
  }));

  if (currentValue && !normalized.some((option) => option.value === currentValue)) {
    normalized.unshift({ value: currentValue, label: currentValue });
  }

  return normalized;
}

function SettingControl({
  definition,
  value,
  lookups,
  onChange,
}: {
  definition: SystemParameterDefinition;
  value: string;
  lookups: SystemParameterLookups;
  onChange: (name: string, value: string) => void;
}) {
  const id = `system-param-${definition.name}`;

  if (definition.type === 'textarea') {
    return (
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(definition.name, event.target.value)}
        rows={4}
        className={`${inputClass} h-auto min-h-28 py-3`}
      />
    );
  }

  if (definition.type === 'select') {
    const options = optionsForDefinition(definition, lookups, value);
    return (
      <SearchableSelect
        id={id}
        value={value}
        onChange={(nextValue) => onChange(definition.name, nextValue)}
        options={options}
        className="w-full self-start"
        inputClassName={inputClass}
        placeholder={`Search ${definition.label.toLowerCase()}`}
      />
    );
  }

  return (
    <input
      id={id}
      type={definition.type}
      min={definition.min}
      max={definition.max}
      value={value}
      onChange={(event) => onChange(definition.name, event.target.value)}
      className={inputClass}
    />
  );
}

function exportSettings(values: SystemParameterValues) {
  const rows = Object.entries(values).map(([key, value]) => `${key},${JSON.stringify(value)}`);
  const blob = new Blob([`setting,value\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'system-settings.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function SystemParameters() {
  const [values, setValues] = useState<SystemParameterValues>({});
  const [savedValues, setSavedValues] = useState<SystemParameterValues>({});
  const [lookups, setLookups] = useState<SystemParameterLookups>(EMPTY_SYSTEM_PARAMETER_LOOKUPS);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadParameters = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const payload = await fetchSystemParameters();
      setValues(payload.parameters);
      setSavedValues(payload.parameters);
      setLookups(payload.lookups);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'System settings could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadParameters();
  }, []);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(() => setErrorMessage(''), 7000);
    return () => window.clearTimeout(timer);
  }, [errorMessage]);

  const updateValue = (name: string, value: string) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setSuccessMessage('');
  };

  const visibleDefinitions = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return SYSTEM_PARAMETER_DEFINITIONS.filter((definition) => {
      const matchesCategory = selectedCategory === 'All' || definition.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!search) return true;
      return (
        definition.label.toLowerCase().includes(search) ||
        definition.category.toLowerCase().includes(search) ||
        definition.note.toLowerCase().includes(search)
      );
    });
  }, [searchTerm, selectedCategory]);

  const groupedDefinitions = useMemo(() => {
    return visibleDefinitions.reduce<Record<string, SystemParameterDefinition[]>>((groups, definition) => {
      if (!groups[definition.category]) groups[definition.category] = [];
      groups[definition.category].push(definition);
      return groups;
    }, {});
  }, [visibleDefinitions]);

  const hasUnsavedChanges = JSON.stringify(values) !== JSON.stringify(savedValues);
  const enabledSwitches = SYSTEM_PARAMETER_DEFINITIONS.filter((definition) => {
    const options = definition.options ?? [];
    return options.length === 2 && options.some((option) => option.value === '1') && values[definition.name] === '1';
  }).length;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      setErrorMessage('');
      const payload = await updateSystemParameters(values);
      setValues(payload.parameters);
      setSavedValues(payload.parameters);
      setLookups(payload.lookups);
      setSuccessMessage('System settings updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'System settings could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <form onSubmit={onSubmit}>
          <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
            <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                    <Settings2 className="h-3.5 w-3.5" />
                    General settings
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    System controls
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                  System settings
                </h1>
                <p className="mt-2 text-sm text-akiva-text-muted">
                  Configure operational defaults for sales, purchasing, inventory, security, workflow, and notifications.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-center">
                <IconButton icon={RefreshCw} label="Reload settings" onClick={loadParameters} disabled={loading || saving} />
                <IconButton icon={RotateCcw} label="Reset unsaved changes" onClick={() => setValues(savedValues)} disabled={!hasUnsavedChanges || saving} />
                <IconButton icon={Download} label="Export settings" onClick={() => exportSettings(values)} disabled={loading} />
                <Button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Update
                </Button>
              </div>
            </div>

            <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
              <div className="space-y-4 lg:col-span-8">
                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm sm:p-5">
                  <div className="grid gap-3 xl:grid-cols-[1fr_260px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                      <input
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search settings"
                        className="h-11 w-full rounded-full border border-akiva-border bg-akiva-surface pl-10 pr-4 text-sm text-akiva-text placeholder:text-akiva-text-muted focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent"
                      />
                    </div>
                    <SearchableSelect
                      value={selectedCategory}
                      onChange={(value) => setSelectedCategory(value)}
                      options={[
                        { value: 'All', label: 'All settings' },
                        ...SYSTEM_PARAMETER_CATEGORIES.map((category) => ({ value: category, label: category })),
                      ]}
                      inputClassName="h-11 rounded-full"
                      placeholder="Search categories"
                    />
                  </div>
                </section>

                {loading ? (
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-8 text-center text-sm text-akiva-text-muted shadow-sm">
                    <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
                    Loading system settings...
                  </section>
                ) : null}

                {!loading && visibleDefinitions.length === 0 ? (
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-8 text-center text-sm text-akiva-text-muted shadow-sm">
                    No settings match your search.
                  </section>
                ) : null}

                {!loading
                  ? Object.entries(groupedDefinitions).map(([category, definitions]) => (
                      <section key={category} className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm sm:p-5">
                        <div className="mb-5 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-akiva-text">{category}</p>
                            <p className="text-xs text-akiva-text-muted">{definitions.length} settings in this group</p>
                          </div>
                          <Filter className="h-5 w-5 text-akiva-text-muted" />
                        </div>

                        <div className="space-y-3">
                          {definitions.map((definition) => {
                            const value = normalizeValue(values[definition.name]);
                            return (
                              <div key={definition.name} className="grid gap-2 rounded-lg border border-akiva-border bg-akiva-surface p-3 xl:grid-cols-[240px_minmax(0,1fr)]">
                                <div>
                                  <label htmlFor={`system-param-${definition.name}`} className="text-sm font-semibold text-akiva-text">
                                    {definition.label}
                                  </label>
                                  <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{definition.note}</p>
                                </div>
                                <SettingControl definition={definition} value={value} lookups={lookups} onChange={updateValue} />
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))
                  : null}
              </div>

              <aside className="space-y-4 lg:col-span-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <StatCard label="Settings" value={String(SYSTEM_PARAMETER_DEFINITIONS.length)} detail="Managed defaults" icon={Settings2} />
                  <StatCard label="Visible" value={String(visibleDefinitions.length)} detail="Filtered settings" icon={Gauge} />
                  <StatCard label="Enabled" value={String(enabledSwitches)} detail="Active yes/no controls" icon={ShieldCheck} />
                  <StatCard label="Status" value={hasUnsavedChanges ? 'Unsaved' : 'Synced'} detail="Current form state" icon={Clock3} />
                </div>

                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-akiva-text">Setting groups</p>
                      <p className="text-xs text-akiva-text-muted">Jump between operational areas.</p>
                    </div>
                    <SlidersHorizontal className="h-5 w-5 text-akiva-text-muted" />
                  </div>
                  <div className="space-y-2">
                    {['All', ...SYSTEM_PARAMETER_CATEGORIES].map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                          selectedCategory === category
                            ? 'bg-akiva-text text-akiva-surface-raised'
                            : 'bg-akiva-surface text-akiva-text hover:bg-akiva-surface-muted'
                        }`}
                      >
                        <span className="truncate">{category === 'All' ? 'All settings' : category}</span>
                        <span className="ml-3 rounded-full bg-white/20 px-2 py-0.5 text-xs">
                          {category === 'All'
                            ? SYSTEM_PARAMETER_DEFINITIONS.length
                            : SYSTEM_PARAMETER_DEFINITIONS.filter((definition) => definition.category === category).length}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                  <p className="text-sm font-semibold text-akiva-text">Update impact</p>
                  <p className="mt-2 text-sm leading-6 text-akiva-text-muted">
                    These settings affect defaults used throughout the ERP. Review unsaved changes carefully before updating.
                  </p>
                  <div className={`mt-4 rounded-lg p-3 text-sm font-semibold ${
                    hasUnsavedChanges
                      ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-200'
                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200'
                  }`}>
                    {hasUnsavedChanges ? 'Unsaved changes' : 'Settings are in sync'}
                  </div>
                </section>
              </aside>
            </div>
          </section>
        </form>
      </div>
      {errorMessage ? (
        <ToastNotification type="error" message={errorMessage} onClose={() => setErrorMessage('')} />
      ) : successMessage ? (
        <ToastNotification type="success" message={successMessage} onClose={() => setSuccessMessage('')} />
      ) : null}
    </div>
  );
}
