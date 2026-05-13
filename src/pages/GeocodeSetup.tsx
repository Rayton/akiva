import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import {
  deleteGeocodeRecord,
  fetchGeocodeSetup,
  saveGeocodeRecord,
  updateGeocodeEnabled,
} from '../data/geocodeSetupApi';
import type { GeocodeForm, GeocodeRecord, GeocodeSetupPayload, GeocodeStatsItem } from '../types/geocodeSetup';

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
  stats,
  icon: Icon,
}: {
  label: string;
  stats: GeocodeStatsItem;
  icon: LucideIcon;
}) {
  const percent = stats.total > 0 ? Math.round((stats.geocoded / stats.total) * 100) : 0;

  return (
    <article className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-akiva-text">{percent}%</p>
        </div>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-akiva-surface-muted text-akiva-text">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-sm text-akiva-text-muted">
        {stats.geocoded} of {stats.total} records mapped
      </p>
    </article>
  );
}

function ChecklistToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-akiva-text">Geocode customers and suppliers</span>
        <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">Store map coordinates on customer branches and supplier records.</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-white shadow-sm transition group-hover:scale-105 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-akiva-accent ${
          checked
            ? 'border-akiva-accent bg-akiva-accent'
            : 'border-akiva-border-strong bg-akiva-surface text-transparent'
        }`}
      >
        <Check className="h-4 w-4 stroke-[3]" />
      </span>
    </label>
  );
}

function emptyForm(defaults?: GeocodeSetupPayload['defaults']): GeocodeForm {
  return {
    geocodeKey: defaults?.geocodeKey ?? '',
    centerLong: defaults?.centerLong ?? '0',
    centerLat: defaults?.centerLat ?? '0',
    mapHeight: defaults?.mapHeight ?? '420',
    mapWidth: defaults?.mapWidth ?? '640',
    mapHost: defaults?.mapHost ?? 'maps.googleapis.com',
  };
}

function recordToForm(record: GeocodeRecord): GeocodeForm {
  return {
    geocodeKey: record.geocodeKey,
    centerLong: record.centerLong,
    centerLat: record.centerLat,
    mapHeight: record.mapHeight,
    mapWidth: record.mapWidth,
    mapHost: record.mapHost,
  };
}

function maskKey(value: string): string {
  if (!value) return 'Not set';
  if (value.length <= 8) return 'Configured';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function GeocodeSetup() {
  const [payload, setPayload] = useState<GeocodeSetupPayload | null>(null);
  const [form, setForm] = useState<GeocodeForm>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadSetup = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchGeocodeSetup();
      setPayload(data);
      if (editingId === null) {
        setForm(emptyForm(data.defaults));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Geocode setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRecord = useMemo(
    () => payload?.records.find((record) => record.id === editingId) ?? null,
    [editingId, payload?.records]
  );

  const updateField = (field: keyof GeocodeForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm(payload?.defaults));
  };

  const editRecord = (record: GeocodeRecord) => {
    setEditingId(record.id);
    setForm(recordToForm(record));
  };

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await saveGeocodeRecord(form, editingId ?? undefined);
      setPayload(response.data);
      setEditingId(response.data.selectedId ?? editingId);
      setMessage(response.message ?? 'Geocode setup saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Geocode setup could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async (record: GeocodeRecord) => {
    if (!window.confirm(`Delete geocode setup #${record.id}?`)) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await deleteGeocodeRecord(record.id);
      setPayload(response.data);
      if (editingId === record.id) resetForm();
      setMessage(response.message ?? 'Geocode setup deleted.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Geocode setup could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  const updateEnabled = async (enabled: boolean) => {
    setSaving(true);
    setErrorMessage('');
    try {
      setPayload(await updateGeocodeEnabled(enabled));
      setMessage('Geocode integration setting updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Geocode integration setting could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const stats = payload?.stats ?? {
    customerBranches: { total: 0, geocoded: 0, missing: 0 },
    suppliers: { total: 0, geocoded: 0, missing: 0 },
  };

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <Settings2 className="h-3.5 w-3.5" />
                  General settings
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <MapPin className="h-3.5 w-3.5" />
                  Mapping
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                Geocode Setup
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Configure map integration and default map display settings.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-center">
              <IconButton icon={RefreshCw} label="Reload geocode setup" onClick={loadSetup} disabled={loading || saving} />
              <Button type="button" onClick={resetForm} disabled={saving} className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
            <div className="space-y-4 lg:col-span-8">
              {errorMessage ? (
                <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                  <p>{errorMessage}</p>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Customer branches" stats={stats.customerBranches} icon={MapPin} />
                <StatCard label="Suppliers" stats={stats.suppliers} icon={Globe2} />
              </div>

              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-akiva-text">Map parameters</p>
                    <p className="mt-1 text-xs leading-5 text-akiva-text-muted">API key, map center point, size, and host used for geocoding tools.</p>
                  </div>
                  <Globe2 className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
                </div>

                <form onSubmit={saveRecord} className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Geocode key</span>
                    <input value={form.geocodeKey} onChange={(event) => updateField('geocodeKey', event.target.value)} className={inputClass} placeholder="Google Maps API key" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Center longitude</span>
                    <input value={form.centerLong} onChange={(event) => updateField('centerLong', event.target.value)} className={inputClass} inputMode="decimal" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Center latitude</span>
                    <input value={form.centerLat} onChange={(event) => updateField('centerLat', event.target.value)} className={inputClass} inputMode="decimal" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Map height</span>
                    <input value={form.mapHeight} onChange={(event) => updateField('mapHeight', event.target.value)} className={inputClass} inputMode="numeric" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Map width</span>
                    <input value={form.mapWidth} onChange={(event) => updateField('mapWidth', event.target.value)} className={inputClass} inputMode="numeric" />
                  </label>
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Map host</span>
                    <input value={form.mapHost} onChange={(event) => updateField('mapHost', event.target.value)} className={inputClass} placeholder="maps.googleapis.com" />
                  </label>

                  <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                    <Button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {editingId ? 'Update' : 'Add setup'}
                    </Button>
                    {editingId ? (
                      <Button type="button" variant="secondary" onClick={resetForm} disabled={saving}>
                        Cancel edit
                      </Button>
                    ) : null}
                    {selectedRecord ? (
                      <span className="text-xs text-akiva-text-muted">Editing setup #{selectedRecord.id}</span>
                    ) : null}
                  </div>
                </form>
              </section>

              <section className="overflow-hidden rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 shadow-sm">
                <div className="border-b border-akiva-border px-4 py-3 sm:px-5">
                  <p className="text-sm font-semibold text-akiva-text">Defined geocode setups</p>
                </div>
                {loading ? (
                  <div className="flex min-h-40 items-center justify-center text-sm text-akiva-text-muted">
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Loading geocode setup
                  </div>
                ) : payload?.records.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-akiva-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        <tr>
                          <th className="px-4 py-3">ID</th>
                          <th className="px-4 py-3">Key</th>
                          <th className="px-4 py-3">Center</th>
                          <th className="px-4 py-3">Size</th>
                          <th className="px-4 py-3">Host</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.records.map((record) => (
                          <tr key={record.id} className="border-b border-akiva-border last:border-0">
                            <td className="px-4 py-3 text-sm font-semibold text-akiva-text">#{record.id}</td>
                            <td className="px-4 py-3 text-sm text-akiva-text-muted">{maskKey(record.geocodeKey)}</td>
                            <td className="px-4 py-3 text-sm text-akiva-text">{record.centerLat}, {record.centerLong}</td>
                            <td className="px-4 py-3 text-sm text-akiva-text">{record.mapWidth} x {record.mapHeight}</td>
                            <td className="px-4 py-3 text-sm text-akiva-text">{record.mapHost}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <IconButton icon={Pencil} label={`Edit setup ${record.id}`} onClick={() => editRecord(record)} disabled={saving} />
                                <IconButton icon={Trash2} label={`Delete setup ${record.id}`} onClick={() => void deleteRecord(record)} disabled={saving} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-akiva-text-muted">
                    No geocode setup records found.
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-4 lg:col-span-4">
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-akiva-text">Integration</p>
                    <p className="mt-1 text-xs leading-5 text-akiva-text-muted">Controls whether map coordinates are maintained on customer and supplier records.</p>
                  </div>
                  <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
                </div>
                <ChecklistToggle checked={Boolean(payload?.enabled)} onChange={(enabled) => void updateEnabled(enabled)} disabled={saving || loading} />
              </section>

              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-akiva-text">Map tools</p>
                    <p className="mt-1 text-xs leading-5 text-akiva-text-muted">Open the existing long-running map utilities when needed.</p>
                  </div>
                  <ExternalLink className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
                </div>
                <div className="space-y-2">
                  {payload?.links ? (
                    <>
                      <a className="flex items-center justify-between rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 text-sm font-semibold text-akiva-text shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted" href={payload.links.runProcess} target="_blank" rel="noreferrer">
                        Run geocode process
                        <ExternalLink className="h-4 w-4 text-akiva-text-muted" />
                      </a>
                      <a className="flex items-center justify-between rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 text-sm font-semibold text-akiva-text shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted" href={payload.links.customerMap} target="_blank" rel="noreferrer">
                        Customer branch map
                        <ExternalLink className="h-4 w-4 text-akiva-text-muted" />
                      </a>
                      <a className="flex items-center justify-between rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 text-sm font-semibold text-akiva-text shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted" href={payload.links.supplierMap} target="_blank" rel="noreferrer">
                        Supplier map
                        <ExternalLink className="h-4 w-4 text-akiva-text-muted" />
                      </a>
                    </>
                  ) : null}
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>

      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}
