import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Grid3X3,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  Tag,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { BarcodeGraphic } from '../components/common/BarcodeGraphic';
import { Button } from '../components/common/Button';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { archiveLabel, fetchLabels, saveLabel } from '../data/labelTemplateApi';
import type { LabelField, LabelLookups, LabelPayload, LabelPreset, LabelTemplate } from '../types/labelTemplate';

const inputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const emptyLookups: LabelLookups = {
  paperSizes: [{ name: 'A4', pageWidth: 210, pageHeight: 297 }],
  fieldTypes: [
    { value: 'itemcode', label: 'Item code' },
    { value: 'itemdescription', label: 'Item description' },
    { value: 'barcode', label: 'Item barcode' },
    { value: 'price', label: 'Price' },
    { value: 'logo', label: 'Company logo' },
  ],
  presets: [],
};

function makeField(fieldValue = 'itemcode'): LabelField {
  return {
    fieldValue,
    vPos: 8,
    hPos: 6,
    fontSize: fieldValue === 'itemdescription' ? 8 : 10,
    barcode: fieldValue === 'barcode',
  };
}

function newLabel(): LabelTemplate {
  return {
    description: 'New label template',
    pageWidth: 210,
    pageHeight: 297,
    height: 30,
    width: 70,
    topMargin: 0,
    leftMargin: 0,
    rowHeight: 30,
    columnWidth: 70,
    fields: [makeField('itemcode'), makeField('itemdescription'), makeField('price')],
  };
}

function cloneLabel(label: LabelTemplate): LabelTemplate {
  return JSON.parse(JSON.stringify(label)) as LabelTemplate;
}

function rowCount(label: LabelTemplate): number {
  return label.rowHeight > 0 ? Math.max(0, Math.floor((label.pageHeight - label.topMargin) / label.rowHeight)) : 0;
}

function columnCount(label: LabelTemplate): number {
  return label.columnWidth > 0 ? Math.max(0, Math.floor((label.pageWidth - label.leftMargin) / label.columnWidth)) : 0;
}

function labelValue(field: LabelField): string {
  if (field.fieldValue === 'itemcode') return 'A1001';
  if (field.fieldValue === 'itemdescription') return 'Sample stock item';
  if (field.fieldValue === 'price') return '12.50 USD';
  if (field.fieldValue === 'logo') return 'LOGO';
  return '1234567890';
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
          <p className="mt-2 text-2xl font-semibold text-akiva-text">{value}</p>
        </div>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-akiva-surface-muted text-akiva-text">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-sm text-akiva-text-muted">{detail}</p>
    </article>
  );
}

function LabelPreview({ label }: { label: LabelTemplate }) {
  const scale = Math.min(1.9, 560 / Math.max(label.pageWidth, label.pageHeight));
  const rows = Math.min(rowCount(label), 12);
  const columns = Math.min(columnCount(label), 6);
  const sortedFields = [...label.fields].sort((a, b) => a.vPos - b.vPos || a.hPos - b.hPos);

  return (
    <div className="max-h-[760px] overflow-auto rounded-lg border border-akiva-border bg-akiva-surface-muted p-4">
      <div
        className="relative mx-auto bg-white text-slate-900 shadow-md"
        style={{ width: label.pageWidth * scale, height: label.pageHeight * scale }}
      >
        {Array.from({ length: Math.max(1, columns) }).map((_, col) =>
          Array.from({ length: Math.max(1, rows) }).map((__, row) => {
            const left = (label.leftMargin + col * label.columnWidth) * scale;
            const top = (label.topMargin + row * label.rowHeight) * scale;
            return (
              <div
                key={`${col}-${row}`}
                className="absolute overflow-hidden border border-dashed border-slate-300 bg-white"
                style={{
                  left,
                  top,
                  width: label.width * scale,
                  height: label.height * scale,
                }}
              >
                {sortedFields.map((field, index) => {
                  const isBarcode = field.barcode || field.fieldValue === 'barcode';
                  const remainingWidth = Math.max(4, label.width - field.hPos - 2);
                  const nextField = sortedFields.find((candidate, candidateIndex) => candidateIndex > index && candidate.vPos > field.vPos);
                  const availableHeight = Math.max(
                    3,
                    Math.min(
                      label.height - field.vPos - 1,
                      nextField ? nextField.vPos - field.vPos - 1 : label.height - field.vPos - 1,
                    ),
                  );
                  const fontSize = Math.max(6, Math.min(18, field.fontSize * scale * 0.9));
                  const barcodeHeight = Math.max(10, Math.min(availableHeight * scale, 22 * scale));

                  return (
                    <div
                      key={`${field.id ?? index}-${field.fieldValue}`}
                      className={field.fieldValue === 'price' ? 'font-semibold text-akiva-accent-text' : ''}
                      style={{
                        position: 'absolute',
                        left: field.hPos * scale,
                        top: field.vPos * scale,
                        width: remainingWidth * scale,
                        maxHeight: availableHeight * scale,
                        overflow: 'hidden',
                      }}
                    >
                      {isBarcode ? (
                        <div style={{ height: barcodeHeight, width: '100%' }}>
                          <BarcodeGraphic value={labelValue(field)} showText={availableHeight > 12} />
                        </div>
                      ) : (
                        <div
                          style={{
                            fontSize,
                            lineHeight: 1.05,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {labelValue(field)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

export function Labels() {
  const [payload, setPayload] = useState<LabelPayload | null>(null);
  const [lookups, setLookups] = useState<LabelLookups>(emptyLookups);
  const [draft, setDraft] = useState<LabelTemplate | null>(null);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const labels = payload?.labels ?? [];
  const stats = payload?.stats ?? { templates: 0, fields: 0 };

  const loadLabels = async (preferredId?: number) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const data = await fetchLabels();
      setPayload(data);
      setLookups(data.lookups);
      const selected = data.labels.find((label) => label.id === preferredId) ?? data.labels[0] ?? newLabel();
      setDraft(cloneLabel(selected));
      setSelectedId(selected.id ?? 'new');
      setSelectedFieldIndex(0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Label templates could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLabels();
  }, []);

  const dirty = useMemo(() => {
    if (!draft) return false;
    const original = labels.find((label) => label.id === draft.id);
    if (!original) return true;
    return JSON.stringify(original) !== JSON.stringify(draft);
  }, [draft, labels]);

  const selectedField = draft?.fields[selectedFieldIndex] ?? null;

  const updateDraft = (updater: (label: LabelTemplate) => LabelTemplate) => {
    setDraft((current) => (current ? updater(cloneLabel(current)) : current));
  };

  const updateField = (values: Partial<LabelField>) => {
    updateDraft((label) => {
      label.fields[selectedFieldIndex] = { ...label.fields[selectedFieldIndex], ...values };
      return label;
    });
  };

  const selectLabel = (label: LabelTemplate) => {
    setDraft(cloneLabel(label));
    setSelectedId(label.id ?? 'new');
    setSelectedFieldIndex(0);
  };

  const startNew = () => {
    const label = newLabel();
    setDraft(label);
    setSelectedId('new');
    setSelectedFieldIndex(0);
  };

  const duplicate = () => {
    if (!draft) return;
    const copy = cloneLabel(draft);
    delete copy.id;
    copy.description = `${copy.description} Copy`.slice(0, 50);
    copy.fields = copy.fields.map((field) => {
      const next = { ...field };
      delete next.id;
      return next;
    });
    setDraft(copy);
    setSelectedId('new');
    setSelectedFieldIndex(0);
  };

  const applyPreset = (preset: LabelPreset) => {
    updateDraft((label) => ({
      ...label,
      description: label.id ? label.description : preset.description,
      pageWidth: preset.pageWidth,
      pageHeight: preset.pageHeight,
      height: preset.height,
      width: preset.width,
      topMargin: preset.topMargin,
      leftMargin: preset.leftMargin,
      rowHeight: preset.rowHeight,
      columnWidth: preset.columnWidth,
    }));
  };

  const addField = () => {
    updateDraft((label) => {
      label.fields.push(makeField('itemcode'));
      setSelectedFieldIndex(label.fields.length - 1);
      return label;
    });
  };

  const removeField = () => {
    updateDraft((label) => {
      label.fields.splice(selectedFieldIndex, 1);
      setSelectedFieldIndex(Math.max(0, selectedFieldIndex - 1));
      return label;
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await saveLabel(draft);
      setMessage(response.message ?? 'Label template saved.');
      setPayload(response.data ?? null);
      const selected = response.data?.labels.find((label) => label.id === response.data?.selectedId) ?? response.data?.labels[0];
      if (selected) {
        setDraft(cloneLabel(selected));
        setSelectedId(selected.id ?? 'new');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Label template could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!draft?.id) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await archiveLabel(draft.id);
      setMessage(response.message ?? 'Label template archived.');
      setPayload(response.data ?? null);
      const next = response.data?.labels[0] ?? newLabel();
      setDraft(cloneLabel(next));
      setSelectedId(next.id ?? 'new');
      setSelectedFieldIndex(0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Label template could not be archived.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1800px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <Tag className="h-3.5 w-3.5" />
                  General settings
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <Barcode className="h-3.5 w-3.5" />
                  Label templates
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                Labels
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Manage printable item label templates and field placement.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <IconButton icon={RefreshCw} label="Reload labels" onClick={() => void loadLabels(draft?.id)} disabled={loading || saving} />
              <IconButton icon={Plus} label="New label" onClick={startNew} disabled={saving} />
              <IconButton icon={Copy} label="Duplicate label" onClick={duplicate} disabled={!draft || saving} />
              <IconButton icon={Trash2} label="Archive label" onClick={() => void archive()} disabled={!draft?.id || saving} />
              <Button onClick={() => void save()} disabled={!draft || saving || !dirty} className="inline-flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[20rem_minmax(0,1fr)_minmax(24rem,36rem)] lg:px-8 lg:py-7">
            {errorMessage ? (
              <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 xl:col-span-3 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            {loading && !draft ? (
              <div className="flex min-h-80 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-raised text-sm text-akiva-text-muted shadow-sm xl:col-span-3">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading labels
              </div>
            ) : null}

            {draft ? (
              <>
                <aside className="space-y-4">
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-akiva-text">Templates</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{labels.length} available</p>
                      </div>
                      {dirty ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">Unsaved</span> : null}
                    </div>
                    <div className="space-y-2.5">
                      {labels.map((label) => (
                        <button
                          type="button"
                          key={label.id ?? label.description}
                          onClick={() => selectLabel(label)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left shadow-sm transition ${
                            selectedId === label.id
                              ? 'border-akiva-accent bg-akiva-accent-soft/50'
                              : 'border-akiva-border bg-akiva-surface-raised hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70'
                          }`}
                        >
                          <span className="block truncate text-sm font-semibold text-akiva-text">{label.description}</span>
                          <span className="mt-1 block text-xs text-akiva-text-muted">
                            {label.rows ?? rowCount(label)} x {label.columns ?? columnCount(label)} · {label.width} x {label.height} mm
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-akiva-text">Presets</p>
                    <div className="mt-3 space-y-2.5">
                      {lookups.presets.map((preset) => (
                        <button
                          type="button"
                          key={preset.key}
                          onClick={() => applyPreset(preset)}
                          className="w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 text-left shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70"
                        >
                          <span className="block text-sm font-semibold text-akiva-text">{preset.description}</span>
                          <span className="mt-1 block text-xs text-akiva-text-muted">{preset.width} x {preset.height} mm</span>
                        </button>
                      ))}
                    </div>
                  </section>
                </aside>

                <main className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard label="Templates" value={String(stats.templates)} detail="Active label layouts" icon={Tag} />
                    <StatCard label="Fields" value={String(stats.fields)} detail="Printable field placements" icon={FileText} />
                    <StatCard label="Grid" value={`${rowCount(draft)} x ${columnCount(draft)}`} detail="Rows and columns" icon={Grid3X3} />
                  </div>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted sm:col-span-2">
                        Description
                        <input className={inputClass} value={draft.description} onChange={(event) => updateDraft((label) => ({ ...label, description: event.target.value }))} />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Paper size
                        <SearchableSelect
                          inputClassName={inputClass}
                          options={lookups.paperSizes.map((paper) => ({ value: paper.name, label: paper.name }))}
                          value={lookups.paperSizes.find((size) => size.pageWidth === draft.pageWidth && size.pageHeight === draft.pageHeight)?.name ?? 'Custom'}
                          onChange={(value) => {
                            const paper = lookups.paperSizes.find((size) => size.name === value);
                            if (!paper || paper.name === 'Custom') return;
                            updateDraft((label) => ({ ...label, pageWidth: paper.pageWidth, pageHeight: paper.pageHeight }));
                          }}
                          placeholder="Choose paper size"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Last saved
                        <input className={inputClass} value={formatDate(draft.updatedAt)} readOnly />
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      {[
                        ['pageWidth', 'Page width'],
                        ['pageHeight', 'Page height'],
                        ['width', 'Label width'],
                        ['height', 'Label height'],
                        ['topMargin', 'Top margin'],
                        ['leftMargin', 'Left margin'],
                        ['rowHeight', 'Row height'],
                        ['columnWidth', 'Column width'],
                      ].map(([key, labelText]) => (
                        <label key={key} className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          {labelText}
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            className={inputClass}
                            value={draft[key as keyof LabelTemplate] as number}
                            onChange={(event) => updateDraft((label) => ({ ...label, [key]: Number(event.target.value) }))}
                          />
                        </label>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-akiva-text">Fields</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{draft.fields.length} fields on this label</p>
                      </div>
                      <IconButton icon={Plus} label="Add field" onClick={addField} disabled={saving} />
                    </div>

                    <div className="space-y-2.5">
                      {draft.fields.map((field, index) => {
                        const fieldType = lookups.fieldTypes.find((type) => type.value === field.fieldValue)?.label ?? field.fieldValue;
                        return (
                          <button
                            type="button"
                            key={`${field.id ?? index}-${field.fieldValue}`}
                            onClick={() => setSelectedFieldIndex(index)}
                            className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left shadow-sm transition ${
                              selectedFieldIndex === index
                                ? 'border-akiva-accent bg-akiva-accent-soft/50'
                                : 'border-akiva-border bg-akiva-surface-raised hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70'
                            }`}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-akiva-text">{fieldType}</span>
                              <span className="mt-1 block text-xs text-akiva-text-muted">H {field.hPos} · V {field.vPos} · {field.fontSize} pt</span>
                            </span>
                            {field.barcode ? <Barcode className="mt-1 h-4 w-4 shrink-0 text-akiva-text-muted" /> : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {selectedField ? (
                    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-akiva-text">Field placement</p>
                          <p className="mt-1 text-xs text-akiva-text-muted">Measurements are millimetres from label origin.</p>
                        </div>
                        <IconButton icon={Trash2} label="Remove field" onClick={removeField} disabled={draft.fields.length <= 1} />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Field
                          <SearchableSelect
                            inputClassName={inputClass}
                            options={lookups.fieldTypes.map((type) => ({ value: type.value, label: type.label }))}
                            value={selectedField.fieldValue}
                            onChange={(value) => updateField({ fieldValue: value, barcode: value === 'barcode' ? true : selectedField.barcode })}
                            placeholder="Choose field"
                          />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Font size
                          <input type="number" min={4} max={96} className={inputClass} value={selectedField.fontSize} onChange={(event) => updateField({ fontSize: Number(event.target.value) })} />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Horizontal position
                          <input type="number" min={0} step="0.1" className={inputClass} value={selectedField.hPos} onChange={(event) => updateField({ hPos: Number(event.target.value) })} />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Vertical position
                          <input type="number" min={0} step="0.1" className={inputClass} value={selectedField.vPos} onChange={(event) => updateField({ vPos: Number(event.target.value) })} />
                        </label>
                      </div>

                      <label className="mt-3 group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-5 text-akiva-text">Barcode</span>
                          <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">Render this field as a barcode.</span>
                        </span>
                        <input type="checkbox" checked={selectedField.barcode} onChange={(event) => updateField({ barcode: event.target.checked })} className="peer sr-only" />
                        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-white shadow-sm transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-akiva-accent ${selectedField.barcode ? 'border-akiva-accent bg-akiva-accent' : 'border-akiva-border-strong bg-akiva-surface text-transparent'}`}>
                          <Check className="h-4 w-4 stroke-[3]" />
                        </span>
                      </label>
                    </section>
                  ) : null}
                </main>

                <aside className="space-y-4">
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-akiva-text">Preview</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{draft.pageWidth} x {draft.pageHeight} mm sheet</p>
                      </div>
                      <PackageCheck className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
                    </div>
                    <LabelPreview label={draft} />
                  </section>
                </aside>
              </>
            ) : null}
          </div>
        </section>
      </div>
      {message ? <ToastNotification type="success" message={message} onClose={() => setMessage('')} /> : null}
    </div>
  );
}
