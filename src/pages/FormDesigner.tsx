import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  FileSignature,
  FileText,
  Grid3X3,
  Image,
  Loader2,
  PanelTop,
  Plus,
  RefreshCw,
  Save,
  ScissorsLineDashed,
  Square,
  Table2,
  TextCursorInput,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/common/Button';
import {
  archiveDocumentTemplate,
  duplicateDocumentTemplate,
  fetchDocumentTemplates,
  saveDocumentTemplate,
} from '../data/documentTemplateApi';
import type {
  DocumentTemplate,
  DocumentTemplateBlock,
  DocumentTemplateLayout,
  DocumentTemplateLookups,
  TemplateSection,
  TemplateStatus,
} from '../types/documentTemplate';

const inputClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';
const textareaClass =
  'min-h-24 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-sm text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent';

const emptyLookups: DocumentTemplateLookups = {
  paperSizes: ['A4'],
  orientations: ['portrait', 'landscape'],
  statuses: ['active', 'draft', 'archived'],
  documentTypes: [{ value: 'custom', label: 'Custom' }],
  blockTypes: [
    { value: 'text', label: 'Text' },
    { value: 'field', label: 'Field' },
    { value: 'table', label: 'Table' },
  ],
  tokens: [],
};

const sectionLabels: Record<TemplateSection, string> = {
  header: 'Header',
  body: 'Body',
  footer: 'Footer',
};

const blockIcons: Record<string, LucideIcon> = {
  text: Type,
  field: TextCursorInput,
  table: Table2,
  totals: Grid3X3,
  image: Image,
  signature: FileSignature,
  divider: ScissorsLineDashed,
  spacer: Square,
};

const sampleValues: Record<string, string> = {
  '{company.name}': 'Akiva Trading Company',
  '{company.address}': '18 Market Street, Dar es Salaam',
  '{company.phone}': '+255 700 000 000',
  '{company.email}': 'accounts@example.com',
  '{document.number}': 'PO-10458',
  '{document.date}': '13 May 2026',
  '{document.reference}': 'REF-9024',
  '{customer.name}': 'Nyangao Medical Stores',
  '{supplier.name}': 'Lakeview Supplies Ltd',
  '{delivery.address}': 'Receiving Dock 3, Main Warehouse',
  '{totals.subtotal}': '3,420.00',
  '{totals.tax}': '615.60',
  '{totals.grandTotal}': '4,035.60',
  '{prepared.by}': 'Prepared by',
  '{approved.by}': 'Approved by',
};

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `block-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultLayout(): DocumentTemplateLayout {
  return {
    schemaVersion: 1,
    sections: {
      header: [
        createBlock('text', 'Company name', '{company.name}'),
        createBlock('field', 'Document number', '{document.number}'),
      ],
      body: [createBlock('table', 'Line items', '{lines.table}')],
      footer: [createBlock('signature', 'Approved by', '{approved.by}')],
    },
  };
}

function createBlock(type: string, label?: string, token?: string): DocumentTemplateBlock {
  return {
    id: makeId(),
    type,
    label: label ?? blockLabel(type),
    content: type === 'text' ? token ?? 'Document text' : '',
    token: type === 'text' ? '' : token ?? '',
    fontSize: type === 'text' ? 18 : 12,
    align: 'left',
    width: 'full',
    emphasis: type === 'text',
    visible: true,
    columns:
      type === 'table'
        ? [
            { label: 'Item', token: '{item.description}' },
            { label: 'Quantity', token: '{item.quantity}' },
            { label: 'Amount', token: '{item.amount}' },
          ]
        : undefined,
    height: type === 'spacer' ? 18 : undefined,
  };
}

function blockLabel(type: string): string {
  const labels: Record<string, string> = {
    text: 'Text',
    field: 'Field',
    table: 'Table',
    totals: 'Totals',
    image: 'Image',
    signature: 'Signature',
    divider: 'Divider',
    spacer: 'Spacer',
  };
  return labels[type] ?? 'Block';
}

function newTemplate(): DocumentTemplate {
  const suffix = Date.now().toString().slice(-5);
  return {
    code: `custom-template-${suffix}`,
    name: 'New Template',
    documentType: 'custom',
    description: '',
    paperSize: 'A4',
    orientation: 'portrait',
    margins: { top: 18, right: 18, bottom: 18, left: 18 },
    layoutJson: defaultLayout(),
    status: 'draft',
    version: 1,
  };
}

function applyToken(value: string): string {
  return Object.entries(sampleValues).reduce((current, [token, sample]) => current.replaceAll(token, sample), value);
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

function cloneTemplate(template: DocumentTemplate): DocumentTemplate {
  return JSON.parse(JSON.stringify(template)) as DocumentTemplate;
}

function statusTone(status: TemplateStatus): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (status === 'draft') return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
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

function PreviewBlock({ block }: { block: DocumentTemplateBlock }) {
  if (!block.visible) return null;

  const style = {
    fontSize: `${block.fontSize}px`,
    textAlign: block.align,
  } as const;

  if (block.type === 'divider') {
    return <div className="my-3 border-t border-slate-300" />;
  }

  if (block.type === 'spacer') {
    return <div style={{ height: `${block.height ?? 18}px` }} />;
  }

  if (block.type === 'image') {
    return (
      <div className="flex h-24 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold uppercase text-slate-400">
        {block.label || 'Image'}
      </div>
    );
  }

  if (block.type === 'table') {
    const columns = block.columns?.length ? block.columns : createBlock('table').columns ?? [];
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{block.label || 'Table'}</p>
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={`${block.id}-${column.label}`} className="border border-slate-300 bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((row) => (
              <tr key={`${block.id}-row-${row}`}>
                {columns.map((column, index) => (
                  <td key={`${block.id}-${row}-${column.label}`} className="border border-slate-200 px-2 py-1 text-slate-600">
                    {index === 0 ? `Sample item ${row}` : index === 1 ? row + 1 : `${(row * 420).toLocaleString()}.00`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === 'totals') {
    return (
      <div className="ml-auto w-56 space-y-1 text-xs">
        <div className="flex justify-between"><span>Subtotal</span><span>{sampleValues['{totals.subtotal}']}</span></div>
        <div className="flex justify-between"><span>Tax</span><span>{sampleValues['{totals.tax}']}</span></div>
        <div className="flex justify-between border-t border-slate-300 pt-1 font-semibold"><span>{block.label || 'Total'}</span><span>{sampleValues['{totals.grandTotal}']}</span></div>
      </div>
    );
  }

  if (block.type === 'signature') {
    return (
      <div className="mt-5 max-w-56">
        <div className="border-t border-slate-400 pt-2 text-xs text-slate-600" style={style}>
          {applyToken(block.token || block.label || 'Signature')}
        </div>
      </div>
    );
  }

  if (block.type === 'field') {
    return (
      <div className={block.emphasis ? 'font-semibold' : ''} style={style}>
        <span className="text-slate-500">{block.label}: </span>
        <span>{applyToken(block.token || block.content)}</span>
      </div>
    );
  }

  return (
    <div className={block.emphasis ? 'font-semibold' : ''} style={style}>
      {applyToken(block.content || block.token || block.label)}
    </div>
  );
}

function Preview({ template }: { template: DocumentTemplate }) {
  const isLandscape = template.orientation === 'landscape';
  const width = isLandscape ? 760 : 540;
  const minHeight = isLandscape ? 500 : 760;

  return (
    <div className="overflow-auto rounded-lg border border-akiva-border bg-akiva-surface-muted p-3">
      <div
        className="mx-auto bg-white text-slate-900 shadow-sm"
        style={{
          width,
          minHeight,
          padding: `${template.margins.top}px ${template.margins.right}px ${template.margins.bottom}px ${template.margins.left}px`,
        }}
      >
        <div className="space-y-3 border-b border-slate-200 pb-4">
          {template.layoutJson.sections.header.map((block) => (
            <PreviewBlock key={block.id} block={block} />
          ))}
        </div>
        <div className="space-y-4 py-5">
          {template.layoutJson.sections.body.map((block) => (
            <PreviewBlock key={block.id} block={block} />
          ))}
        </div>
        <div className="mt-auto space-y-3 border-t border-slate-200 pt-4">
          {template.layoutJson.sections.footer.map((block) => (
            <PreviewBlock key={block.id} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormDesigner() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [lookups, setLookups] = useState<DocumentTemplateLookups>(emptyLookups);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<DocumentTemplate | null>(null);
  const [activeSection, setActiveSection] = useState<TemplateSection>('header');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadTemplates = async (preferredId?: number) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const payload = await fetchDocumentTemplates();
      setTemplates(payload.templates);
      setLookups(payload.lookups);
      const selected = payload.templates.find((template) => template.id === preferredId) ?? payload.templates[0] ?? newTemplate();
      setSelectedId(selected.id ?? 'new');
      setDraft(cloneTemplate(selected));
      setActiveSection('header');
      setSelectedBlockId(selected.layoutJson.sections.header[0]?.id ?? '');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Form designer could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const selectedBlock = useMemo(() => {
    if (!draft) return null;
    return draft.layoutJson.sections[activeSection].find((block) => block.id === selectedBlockId) ?? null;
  }, [activeSection, draft, selectedBlockId]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    const original = templates.find((template) => template.id === draft.id);
    if (!original) return true;
    return JSON.stringify(original) !== JSON.stringify(draft);
  }, [draft, templates]);

  const updateDraft = (updater: (template: DocumentTemplate) => DocumentTemplate) => {
    setDraft((current) => (current ? updater(cloneTemplate(current)) : current));
  };

  const selectTemplate = (template: DocumentTemplate) => {
    setSelectedId(template.id ?? 'new');
    setDraft(cloneTemplate(template));
    setActiveSection('header');
    setSelectedBlockId(template.layoutJson.sections.header[0]?.id ?? '');
  };

  const updateBlock = (values: Partial<DocumentTemplateBlock>) => {
    updateDraft((template) => {
      template.layoutJson.sections[activeSection] = template.layoutJson.sections[activeSection].map((block) =>
        block.id === selectedBlockId ? { ...block, ...values } : block,
      );
      return template;
    });
  };

  const addBlock = (type: string) => {
    const block = createBlock(type);
    updateDraft((template) => {
      template.layoutJson.sections[activeSection].push(block);
      return template;
    });
    setSelectedBlockId(block.id);
  };

  const removeBlock = () => {
    updateDraft((template) => {
      template.layoutJson.sections[activeSection] = template.layoutJson.sections[activeSection].filter((block) => block.id !== selectedBlockId);
      setSelectedBlockId(template.layoutJson.sections[activeSection][0]?.id ?? '');
      return template;
    });
  };

  const moveBlock = (direction: -1 | 1) => {
    updateDraft((template) => {
      const blocks = template.layoutJson.sections[activeSection];
      const index = blocks.findIndex((block) => block.id === selectedBlockId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return template;
      [blocks[index], blocks[nextIndex]] = [blocks[nextIndex], blocks[index]];
      return template;
    });
  };

  const saveTemplate = async () => {
    if (!draft) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await saveDocumentTemplate(draft);
      const saved = response.data?.template;
      if (!saved) return;
      setMessage(response.message ?? 'Template saved.');
      await loadTemplates(saved.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Template could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!draft?.id) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await duplicateDocumentTemplate(draft.id);
      setMessage(response.message ?? 'Template duplicated.');
      await loadTemplates(response.data?.template.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Template could not be duplicated.');
    } finally {
      setSaving(false);
    }
  };

  const archiveTemplate = async () => {
    if (!draft?.id) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const response = await archiveDocumentTemplate(draft.id);
      setMessage(response.message ?? 'Template archived.');
      await loadTemplates(response.data?.templates?.[0]?.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Template could not be archived.');
    } finally {
      setSaving(false);
    }
  };

  const startNewTemplate = () => {
    const template = newTemplate();
    setSelectedId('new');
    setDraft(template);
    setActiveSection('header');
    setSelectedBlockId(template.layoutJson.sections.header[0]?.id ?? '');
  };

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  <PanelTop className="h-3.5 w-3.5" />
                  General settings
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  <FileText className="h-3.5 w-3.5" />
                  Document templates
                </span>
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-akiva-text sm:text-3xl lg:text-4xl">
                Form Designer
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">
                Design forms, labels, and operational document layouts.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <IconButton icon={RefreshCw} label="Refresh templates" onClick={() => void loadTemplates(draft?.id)} disabled={loading || saving} />
              <IconButton icon={Plus} label="New template" onClick={startNewTemplate} disabled={saving} />
              <IconButton icon={Copy} label="Duplicate template" onClick={() => void duplicateTemplate()} disabled={!draft?.id || saving} />
              <IconButton icon={Trash2} label="Archive template" onClick={() => void archiveTemplate()} disabled={!draft?.id || saving} />
              <Button onClick={() => void saveTemplate()} disabled={!draft || saving || !dirty} className="inline-flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </Button>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 min-[1800px]:grid-cols-12 lg:px-8 lg:py-7">
            {errorMessage ? (
              <div className="min-[1800px]:col-span-12 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950 dark:text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <p>{errorMessage}</p>
              </div>
            ) : null}

            {loading && !draft ? (
              <div className="min-[1800px]:col-span-12 flex min-h-80 items-center justify-center rounded-lg border border-akiva-border bg-akiva-surface-raised text-sm text-akiva-text-muted shadow-sm">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading templates
              </div>
            ) : null}

            {draft ? (
              <>
                <aside className="space-y-4 min-[1800px]:col-span-3">
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-akiva-text">Templates</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">{templates.length} available</p>
                      </div>
                      {dirty ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">Unsaved</span> : null}
                    </div>
                    <div className="space-y-2.5">
                      {templates.map((template) => (
                        <button
                          type="button"
                          key={template.id ?? template.code}
                          onClick={() => selectTemplate(template)}
                          className={`w-full rounded-lg border px-3 py-2.5 text-left shadow-sm transition ${
                            selectedId === template.id
                              ? 'border-akiva-accent bg-akiva-accent-soft/50'
                              : 'border-akiva-border bg-akiva-surface-raised hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70'
                          }`}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-akiva-text">{template.name}</span>
                              <span className="mt-1 block truncate text-xs text-akiva-text-muted">{template.code}</span>
                            </span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(template.status)}`}>
                              {template.status}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <p className="text-sm font-semibold text-akiva-text">Tokens</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {lookups.tokens.map((token) => (
                        <button
                          type="button"
                          key={token}
                          onClick={() => {
                            if (!selectedBlock) return;
                            updateBlock(selectedBlock.type === 'text' ? { content: `${selectedBlock.content} ${token}`.trim() } : { token });
                          }}
                          className="rounded-full border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted transition hover:border-akiva-accent hover:text-akiva-text"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </section>
                </aside>

                <main className="space-y-4 min-[1800px]:col-span-5">
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Name
                        <input className={inputClass} value={draft.name} onChange={(event) => updateDraft((template) => ({ ...template, name: event.target.value }))} />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Code
                        <input className={inputClass} value={draft.code} onChange={(event) => updateDraft((template) => ({ ...template, code: event.target.value }))} />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Document type
                        <select className={inputClass} value={draft.documentType} onChange={(event) => updateDraft((template) => ({ ...template, documentType: event.target.value }))}>
                          {lookups.documentTypes.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Status
                        <select className={inputClass} value={draft.status} onChange={(event) => updateDraft((template) => ({ ...template, status: event.target.value as TemplateStatus }))}>
                          {lookups.statuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Paper
                        <select className={inputClass} value={draft.paperSize} onChange={(event) => updateDraft((template) => ({ ...template, paperSize: event.target.value }))}>
                          {lookups.paperSizes.map((size) => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                        Orientation
                        <select className={inputClass} value={draft.orientation} onChange={(event) => updateDraft((template) => ({ ...template, orientation: event.target.value as DocumentTemplate['orientation'] }))}>
                          {lookups.orientations.map((orientation) => (
                            <option key={orientation} value={orientation}>{orientation}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
                        <label key={side} className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          {side}
                          <input
                            type="number"
                            min={0}
                            max={80}
                            className={inputClass}
                            value={draft.margins[side]}
                            onChange={(event) => updateDraft((template) => ({ ...template, margins: { ...template.margins, [side]: Number(event.target.value) } }))}
                          />
                        </label>
                      ))}
                    </div>

                    <label className="mt-3 block space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                      Description
                      <textarea className={textareaClass} value={draft.description} onChange={(event) => updateDraft((template) => ({ ...template, description: event.target.value }))} />
                    </label>
                  </section>

                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex rounded-full border border-akiva-border bg-akiva-surface-raised p-1 shadow-sm">
                        {(['header', 'body', 'footer'] as TemplateSection[]).map((section) => (
                          <button
                            type="button"
                            key={section}
                            onClick={() => {
                              setActiveSection(section);
                              setSelectedBlockId(draft.layoutJson.sections[section][0]?.id ?? '');
                            }}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              activeSection === section ? 'bg-akiva-accent text-white' : 'text-akiva-text-muted hover:text-akiva-text'
                            }`}
                          >
                            {sectionLabels[section]}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {lookups.blockTypes.map((type) => {
                          const Icon = blockIcons[type.value] ?? Plus;
                          return (
                            <button
                              type="button"
                              key={type.value}
                              aria-label={`Add ${type.label}`}
                              title={`Add ${type.label}`}
                              onClick={() => addBlock(type.value)}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:border-akiva-accent hover:text-akiva-text"
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {draft.layoutJson.sections[activeSection].map((block) => {
                        const Icon = blockIcons[block.type] ?? FileText;
                        return (
                          <button
                            type="button"
                            key={block.id}
                            onClick={() => setSelectedBlockId(block.id)}
                            className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left shadow-sm transition ${
                              selectedBlockId === block.id
                                ? 'border-akiva-accent bg-akiva-accent-soft/50'
                                : 'border-akiva-border bg-akiva-surface-raised hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70'
                            }`}
                          >
                            <span className="flex min-w-0 gap-3">
                              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-akiva-surface-muted text-akiva-text">
                                <Icon className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-akiva-text">{block.label || blockLabel(block.type)}</span>
                                <span className="mt-1 block truncate text-xs text-akiva-text-muted">{block.token || block.content || block.type}</span>
                              </span>
                            </span>
                            {!block.visible ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">Hidden</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {selectedBlock ? (
                    <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-akiva-text">Block</p>
                          <p className="mt-1 text-xs text-akiva-text-muted">{blockLabel(selectedBlock.type)}</p>
                        </div>
                        <div className="flex gap-2">
                          <IconButton icon={ArrowUp} label="Move up" onClick={() => moveBlock(-1)} />
                          <IconButton icon={ArrowDown} label="Move down" onClick={() => moveBlock(1)} />
                          <IconButton icon={Trash2} label="Remove block" onClick={removeBlock} />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Label
                          <input className={inputClass} value={selectedBlock.label} onChange={(event) => updateBlock({ label: event.target.value })} />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Token
                          <input className={inputClass} value={selectedBlock.token} onChange={(event) => updateBlock({ token: event.target.value })} />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted sm:col-span-2">
                          Content
                          <textarea className={textareaClass} value={selectedBlock.content} onChange={(event) => updateBlock({ content: event.target.value })} />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Font size
                          <input type="number" min={8} max={48} className={inputClass} value={selectedBlock.fontSize} onChange={(event) => updateBlock({ fontSize: Number(event.target.value) })} />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">
                          Align
                          <select className={inputClass} value={selectedBlock.align} onChange={(event) => updateBlock({ align: event.target.value as DocumentTemplateBlock['align'] })}>
                            <option value="left">left</option>
                            <option value="center">center</option>
                            <option value="right">right</option>
                          </select>
                        </label>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <label className="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold leading-5 text-akiva-text">Visible</span>
                            <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">Show this block in the template.</span>
                          </span>
                          <input type="checkbox" checked={selectedBlock.visible} onChange={(event) => updateBlock({ visible: event.target.checked })} className="peer sr-only" />
                          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-white shadow-sm transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-akiva-accent ${selectedBlock.visible ? 'border-akiva-accent bg-akiva-accent' : 'border-akiva-border-strong bg-akiva-surface text-transparent'}`}>
                            <CheckCircle2 className="h-4 w-4 stroke-[3]" />
                          </span>
                        </label>
                        <label className="group flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2.5 shadow-sm transition hover:border-akiva-accent/70 hover:bg-akiva-surface-muted/70">
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold leading-5 text-akiva-text">Emphasis</span>
                            <span className="mt-1 block text-xs leading-5 text-akiva-text-muted">Use stronger weight for this block.</span>
                          </span>
                          <input type="checkbox" checked={selectedBlock.emphasis} onChange={(event) => updateBlock({ emphasis: event.target.checked })} className="peer sr-only" />
                          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-white shadow-sm transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-akiva-accent ${selectedBlock.emphasis ? 'border-akiva-accent bg-akiva-accent' : 'border-akiva-border-strong bg-akiva-surface text-transparent'}`}>
                            <CheckCircle2 className="h-4 w-4 stroke-[3]" />
                          </span>
                        </label>
                      </div>
                    </section>
                  ) : null}
                </main>

                <aside className="space-y-4 min-[1800px]:col-span-4">
                  <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-akiva-text">Preview</p>
                        <p className="mt-1 text-xs text-akiva-text-muted">
                          {draft.paperSize} {draft.orientation} · Version {draft.version}
                        </p>
                      </div>
                      <FileText className="mt-1 h-5 w-5 shrink-0 text-akiva-text-muted" />
                    </div>
                    <Preview template={draft} />
                  </section>

                  <section className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Last saved</p>
                    <p className="mt-2 text-sm font-semibold text-akiva-text">{formatDate(draft.updatedAt)}</p>
                    <p className="mt-1 text-xs text-akiva-text-muted">{draft.updatedBy || 'api'}</p>
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
