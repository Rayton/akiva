import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  type LucideIcon,
  X,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import {
  DEFAULT_COMPANY_PREFERENCES,
  DEFAULT_COMPANY_PREFERENCES_PAYLOAD,
  fetchCompanyPreferences,
  updateCompanyPreferences,
} from '../data/companyPreferencesApi';
import type { CompanyAccountOption, CompanyPreferencesForm } from '../types/companyPreferences';

type CompanyPreferencesKey = keyof CompanyPreferencesForm;

const textInputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const selectInputClass =
  'h-11 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent';

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
      <Icon className={`h-4 w-4 ${disabled ? '' : ''}`} />
    </button>
  );
}

function FieldLabel({ label, htmlFor, required = false }: { label: string; htmlFor: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-akiva-text">
      {label}
      {required ? <span className="ml-1 text-akiva-accent-text">*</span> : null}
    </label>
  );
}

function TextField({
  field,
  label,
  form,
  onChange,
  type = 'text',
  required = false,
  maxLength,
  placeholder,
}: {
  field: CompanyPreferencesKey;
  label: string;
  form: CompanyPreferencesForm;
  onChange: (field: CompanyPreferencesKey, value: string | boolean) => void;
  type?: string;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = `company-pref-${String(field)}`;
  return (
    <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
      <FieldLabel htmlFor={id} label={label} required={required} />
      <input
        id={id}
        type={type}
        required={required}
        maxLength={maxLength}
        value={String(form[field] ?? '')}
        placeholder={placeholder}
        onChange={(event) => onChange(field, event.target.value)}
        className={textInputClass}
      />
    </div>
  );
}

function SelectField({
  field,
  label,
  form,
  options,
  onChange,
  required = false,
}: {
  field: CompanyPreferencesKey;
  label: string;
  form: CompanyPreferencesForm;
  options: { value: string; label: string; searchText?: string }[];
  onChange: (field: CompanyPreferencesKey, value: string | boolean) => void;
  required?: boolean;
}) {
  const id = `company-pref-${String(field)}`;
  return (
    <div className="grid gap-2 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
      <FieldLabel htmlFor={id} label={label} required={required} />
      <SearchableSelect
        id={id}
        value={String(form[field] ?? '')}
        onChange={(value) => onChange(field, value)}
        options={options}
        required={required}
        className="w-full"
        inputClassName={selectInputClass}
        placeholder={`Search ${label.toLowerCase()}`}
      />
    </div>
  );
}

function ToggleRow({
  field,
  label,
  description,
  form,
  onChange,
}: {
  field: CompanyPreferencesKey;
  label: string;
  description: string;
  form: CompanyPreferencesForm;
  onChange: (field: CompanyPreferencesKey, value: string | boolean) => void;
}) {
  const checked = Boolean(form[field]);
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-akiva-border bg-akiva-surface p-3">
      <span>
        <span className="block text-sm font-semibold text-akiva-text">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(field, event.target.checked)}
        className="mt-1 h-5 w-5 rounded border-akiva-border-strong text-akiva-accent focus:ring-akiva-accent"
      />
    </label>
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

function ensureAccountOptions(options: CompanyAccountOption[], codes: string[]): { value: string; label: string; searchText: string }[] {
  const normalized = options.map((option) => ({
    value: option.code,
    label: option.label || `${option.name} (${option.code})`,
    searchText: `${option.code} ${option.name} ${option.label}`,
  }));

  codes
    .filter(Boolean)
    .filter((code, index, allCodes) => allCodes.indexOf(code) === index)
    .reverse()
    .forEach((code) => {
      if (!normalized.some((option) => option.value === code)) {
        normalized.unshift({ value: code, label: `Account ${code}`, searchText: code });
      }
    });

  return normalized;
}

function exportPreferences(form: CompanyPreferencesForm) {
  const rows = Object.entries(form).map(([key, value]) => `${key},${JSON.stringify(value)}`);
  const blob = new Blob([`field,value\n${rows.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'company-preferences.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function CompanyPreferences() {
  const [form, setForm] = useState<CompanyPreferencesForm>(DEFAULT_COMPANY_PREFERENCES);
  const [savedForm, setSavedForm] = useState<CompanyPreferencesForm>(DEFAULT_COMPANY_PREFERENCES);
  const [currencies, setCurrencies] = useState(DEFAULT_COMPANY_PREFERENCES_PAYLOAD.currencies);
  const [balanceSheetAccounts, setBalanceSheetAccounts] = useState(DEFAULT_COMPANY_PREFERENCES_PAYLOAD.balanceSheetAccounts);
  const [profitLossAccounts, setProfitLossAccounts] = useState(DEFAULT_COMPANY_PREFERENCES_PAYLOAD.profitLossAccounts);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const loadPreferences = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      const payload = await fetchCompanyPreferences();
      setForm(payload.preferences);
      setSavedForm(payload.preferences);
      setCurrencies(payload.currencies.length > 0 ? payload.currencies : DEFAULT_COMPANY_PREFERENCES_PAYLOAD.currencies);
      setBalanceSheetAccounts(
        payload.balanceSheetAccounts.length > 0
          ? payload.balanceSheetAccounts
          : DEFAULT_COMPANY_PREFERENCES_PAYLOAD.balanceSheetAccounts
      );
      setProfitLossAccounts(
        payload.profitLossAccounts.length > 0
          ? payload.profitLossAccounts
          : DEFAULT_COMPANY_PREFERENCES_PAYLOAD.profitLossAccounts
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Company preferences could not be loaded.');
      setForm(DEFAULT_COMPANY_PREFERENCES);
      setSavedForm(DEFAULT_COMPANY_PREFERENCES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPreferences();
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

  const updateField = (field: CompanyPreferencesKey, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setSuccessMessage('');
  };

  const currencyOptions = useMemo(
    () =>
      currencies.map((currency) => ({
        value: currency.code,
        label: currency.name,
        searchText: `${currency.code} ${currency.name}`,
      })),
    [currencies]
  );

  const balanceSheetOptions = useMemo(
    () =>
      ensureAccountOptions(balanceSheetAccounts, [
        form.debtorsAct,
        form.creditorsAct,
        form.payrollAct,
        form.grnAct,
        form.retainedEarnings,
      ]),
    [balanceSheetAccounts, form.creditorsAct, form.debtorsAct, form.grnAct, form.payrollAct, form.retainedEarnings]
  );

  const profitLossOptions = useMemo(
    () =>
      ensureAccountOptions(profitLossAccounts, [
        form.freightAct,
        form.exchangeDiffAct,
        form.purchasesExchangeDiffAct,
        form.pytDiscountAct,
      ]),
    [form.exchangeDiffAct, form.freightAct, form.purchasesExchangeDiffAct, form.pytDiscountAct, profitLossAccounts]
  );

  const selectedCurrency = currencies.find((currency) => currency.code === form.currencyDefault);
  const addressSummary = [form.regOffice1, form.regOffice5, form.regOffice6].filter(Boolean).join(', ') || 'No address set';
  const enabledGlLinks = [form.glLinkDebtors, form.glLinkCreditors, form.glLinkStock].filter(Boolean).length;
  const hasUnsavedChanges = JSON.stringify(form) !== JSON.stringify(savedForm);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.coyName.trim() || !form.regOffice1.trim() || !form.telephone.trim() || !form.email.trim()) {
      setErrorMessage('Company name, address line 1, telephone, and email are required.');
      return;
    }

    try {
      setSaving(true);
      setErrorMessage('');
      const payload = await updateCompanyPreferences(form);
      setForm(payload.preferences);
      setSavedForm(payload.preferences);
      setCurrencies(payload.currencies.length > 0 ? payload.currencies : currencies);
      setBalanceSheetAccounts(payload.balanceSheetAccounts.length > 0 ? payload.balanceSheetAccounts : balanceSheetAccounts);
      setProfitLossAccounts(payload.profitLossAccounts.length > 0 ? payload.profitLossAccounts : profitLossAccounts);
      setSuccessMessage('Company preferences updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Company preferences could not be updated.');
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
                    <CalendarDays className="h-3.5 w-3.5" />
                    Company profile
                  </span>
                </div>
                <h1 className="mt-4 text-3xl font-semibold tracking-normal text-akiva-text sm:text-4xl lg:text-5xl">
                  Company preferences
                </h1>
                <p className="mt-2 text-sm text-akiva-text-muted">
                  Maintain the company identity, reporting address, home currency, and GL control accounts.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start lg:self-center">
                <IconButton icon={RefreshCw} label="Reload preferences" onClick={loadPreferences} disabled={loading || saving} />
                <IconButton icon={RotateCcw} label="Reset unsaved changes" onClick={() => setForm(savedForm)} disabled={!hasUnsavedChanges || saving} />
                <IconButton icon={Download} label="Export preferences" onClick={() => exportPreferences(form)} disabled={loading} />
                <Button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Update
                </Button>
              </div>
            </div>

            <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
              <div className="space-y-4 lg:col-span-8">
                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm sm:p-5">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-akiva-text">Company identity</p>
                      <p className="text-xs text-akiva-text-muted">Names and registration details used on reports and statements.</p>
                    </div>
                    {loading ? <Loader2 className="h-5 w-5 animate-spin text-akiva-text-muted" /> : <Building2 className="h-5 w-5 text-akiva-text-muted" />}
                  </div>
                  <div className="space-y-3">
                    <TextField field="coyName" label="Name (to appear on reports)" form={form} onChange={updateField} required maxLength={50} />
                    <TextField field="companyNumber" label="Official company number" form={form} onChange={updateField} maxLength={20} />
                    <TextField field="gstNo" label="Tax authority reference" form={form} onChange={updateField} maxLength={20} />
                  </div>
                </section>

                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm sm:p-5">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-akiva-text">Address and contact</p>
                      <p className="text-xs text-akiva-text-muted">Registered office and contact lines shown on commercial documents.</p>
                    </div>
                    <MapPin className="h-5 w-5 text-akiva-text-muted" />
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2">
                    <div className="space-y-3">
                      <TextField field="regOffice1" label="Address line 1" form={form} onChange={updateField} required maxLength={40} />
                      <TextField field="regOffice2" label="Address line 2" form={form} onChange={updateField} maxLength={40} />
                      <TextField field="regOffice3" label="Address line 3" form={form} onChange={updateField} maxLength={40} />
                      <TextField field="regOffice4" label="Address line 4" form={form} onChange={updateField} maxLength={40} />
                      <TextField field="regOffice5" label="Address line 5" form={form} onChange={updateField} maxLength={20} />
                      <TextField field="regOffice6" label="Address line 6" form={form} onChange={updateField} maxLength={15} />
                    </div>
                    <div className="space-y-3">
                      <TextField field="telephone" label="Telephone number" type="tel" form={form} onChange={updateField} required maxLength={25} />
                      <TextField field="fax" label="Facsimile number" form={form} onChange={updateField} maxLength={25} />
                      <TextField field="email" label="Email address" type="email" form={form} onChange={updateField} required maxLength={55} />
                      <TextField field="location1" label="Location 1" form={form} onChange={updateField} maxLength={255} />
                      <TextField field="location2" label="Location 2" form={form} onChange={updateField} maxLength={255} />
                      <TextField field="office1" label="Office 1" form={form} onChange={updateField} maxLength={255} />
                      <TextField field="office2" label="Office 2" form={form} onChange={updateField} maxLength={255} />
                      <TextField field="fax2" label="Facsimile number 2" form={form} onChange={updateField} maxLength={255} />
                      <TextField field="telephone2" label="Telephone 2" form={form} onChange={updateField} maxLength={255} />
                      <TextField field="website" label="Website" type="url" form={form} onChange={updateField} maxLength={255} placeholder="https://example.com" />
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm sm:p-5">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-akiva-text">Accounting controls</p>
                      <p className="text-xs text-akiva-text-muted">Default currency and control accounts for company transactions.</p>
                    </div>
                    <Landmark className="h-5 w-5 text-akiva-text-muted" />
                  </div>
                  <div className="space-y-3">
                    <SelectField field="currencyDefault" label="Home currency" form={form} onChange={updateField} options={currencyOptions} required />
                    <SelectField field="debtorsAct" label="Debtors control GL account" form={form} onChange={updateField} options={balanceSheetOptions} required />
                    <SelectField field="creditorsAct" label="Creditors control GL account" form={form} onChange={updateField} options={balanceSheetOptions} required />
                    <SelectField field="payrollAct" label="Payroll net pay clearing GL account" form={form} onChange={updateField} options={balanceSheetOptions} required />
                    <SelectField field="grnAct" label="Goods received clearing GL account" form={form} onChange={updateField} options={balanceSheetOptions} required />
                    <SelectField field="retainedEarnings" label="Retained earning clearing GL account" form={form} onChange={updateField} options={balanceSheetOptions} required />
                    <SelectField field="freightAct" label="Freight re-charged GL account" form={form} onChange={updateField} options={profitLossOptions} required />
                    <SelectField field="exchangeDiffAct" label="Sales exchange variances GL account" form={form} onChange={updateField} options={profitLossOptions} required />
                    <SelectField field="purchasesExchangeDiffAct" label="Purchases exchange variances GL account" form={form} onChange={updateField} options={profitLossOptions} required />
                    <SelectField field="pytDiscountAct" label="Payment discount GL account" form={form} onChange={updateField} options={profitLossOptions} required />
                  </div>
                </section>
              </div>

              <aside className="space-y-4 lg:col-span-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <StatCard label="Company" value={form.companyNumber || 'Not set'} detail={form.coyName || 'Company name required'} icon={Building2} />
                  <StatCard label="Currency" value={form.currencyDefault || 'Not set'} detail={selectedCurrency?.name || 'Home currency'} icon={Landmark} />
                  <StatCard label="Contact" value={form.telephone || 'Not set'} detail={form.email || 'Email required'} icon={Phone} />
                  <StatCard label="GL links" value={`${enabledGlLinks}/3`} detail="Automatic posting switches enabled" icon={ShieldCheck} />
                </div>

                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-akiva-text">GL integration</p>
                      <p className="text-xs text-akiva-text-muted">Controls journal creation for sub-ledger activity.</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-akiva-text-muted" />
                  </div>
                  <div className="space-y-2">
                    <ToggleRow field="glLinkDebtors" label="Accounts receivable transactions" description="Create GL entries for customer invoices, receipts, and adjustments." form={form} onChange={updateField} />
                    <ToggleRow field="glLinkCreditors" label="Accounts payable transactions" description="Create GL entries for supplier invoices, credits, and payments." form={form} onChange={updateField} />
                    <ToggleRow field="glLinkStock" label="Stock transactions" description="Create GL entries for inventory movements and stock valuation." form={form} onChange={updateField} />
                  </div>
                </section>

                <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm font-semibold text-akiva-text">Document profile</p>
                    <Mail className="h-5 w-5 text-akiva-text-muted" />
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="rounded-lg bg-akiva-surface p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Registered address</p>
                      <p className="mt-2 text-akiva-text">{addressSummary}</p>
                    </div>
                    <div className="rounded-lg bg-akiva-surface p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Primary contact</p>
                      <p className="mt-2 break-words text-akiva-text">{form.email || 'Email required'}</p>
                    </div>
                    <div className="rounded-lg bg-akiva-surface p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Reports identity</p>
                      <p className="mt-2 break-words text-akiva-text">{form.coyName || 'Company name required'}</p>
                    </div>
                    {hasUnsavedChanges ? (
                      <div className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                        Unsaved changes
                      </div>
                    ) : (
                      <div className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                        Preferences are in sync
                      </div>
                    )}
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
