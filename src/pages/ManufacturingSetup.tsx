import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarX, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2, TreePine } from 'lucide-react';
import { AdvancedTable, type AdvancedTableColumn } from '../components/common/AdvancedTable';
import { Button } from '../components/common/Button';
import { Modal } from '../components/ui/Modal';
import { useConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  deleteManufacturingSetupRecord,
  fetchManufacturingSetup,
  saveManufacturingSetupRecord,
} from '../data/manufacturingSetupApi';
import type {
  ManufacturingSetupForm,
  ManufacturingSetupPayload,
  ManufacturingSetupTab,
  MrpCalendarDay,
  MrpDemandType,
} from '../types/manufacturingSetup';

interface ManufacturingSetupProps {
  initialTab?: ManufacturingSetupTab;
}

type SetupRow = MrpCalendarDay | MrpDemandType;

interface TabDefinition {
  id: ManufacturingSetupTab;
  label: string;
  singularLabel: string;
  title: string;
  description: string;
  addLabel: string;
}

const inputClassName =
  'min-h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface px-3 py-2 text-sm text-akiva-text outline-none transition focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent/30 disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted';

const TAB_DEFINITIONS: TabDefinition[] = [
  {
    id: 'mrp-calendar',
    label: 'MRP Calendar',
    singularLabel: 'MRP calendar day',
    title: 'MRP Available Production Days',
    description: 'Maintain which dates can be used by MRP for manufacturing lead-time scheduling.',
    addLabel: 'Add Calendar Day',
  },
  {
    id: 'mrp-demand-types',
    label: 'MRP Demand Types',
    singularLabel: 'MRP demand type',
    title: 'MRP Demand Types',
    description: 'Maintain demand type codes used by the MRP master schedule and requirements.',
    addLabel: 'Add Demand Type',
  },
];

function tabDefinition(tab: ManufacturingSetupTab): TabDefinition {
  return TAB_DEFINITIONS.find((definition) => definition.id === tab) ?? TAB_DEFINITIONS[0];
}

function isCalendarDay(row: SetupRow): row is MrpCalendarDay {
  return 'calendarDate' in row;
}

function rowId(row: SetupRow): string {
  return isCalendarDay(row) ? row.calendarDate : row.code;
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function formatDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function emptyForm(): ManufacturingSetupForm {
  return {
    calendarDate: new Date().toISOString().slice(0, 10),
    manufacturingAvailable: true,
    code: '',
    name: '',
  };
}

function formFromRow(row: SetupRow): ManufacturingSetupForm {
  if (isCalendarDay(row)) {
    return {
      ...emptyForm(),
      calendarDate: row.calendarDate,
      manufacturingAvailable: row.manufacturingAvailable,
    };
  }

  return {
    ...emptyForm(),
    code: row.code,
    name: row.name,
  };
}

function rowsForTab(payload: ManufacturingSetupPayload | null, tab: ManufacturingSetupTab): SetupRow[] {
  if (!payload) return [];
  return tab === 'mrp-calendar' ? payload.calendar : payload.demandTypes;
}

function rowDisplay(row: SetupRow): string {
  return isCalendarDay(row) ? `${formatDate(row.calendarDate)} - ${row.weekday}` : `${row.code} - ${row.name}`;
}

function deleteDescription(tab: ManufacturingSetupTab): string {
  if (tab === 'mrp-calendar') return 'This calendar date will be removed and MRP calendar day numbers will be recalculated.';
  return 'This demand type will be removed only if MRP demands and requirements do not use it.';
}

function AvailabilityBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        available
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
          : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
      }`}
    >
      {available ? 'Available for manufacturing' : 'Not available for manufacturing'}
    </span>
  );
}

export function ManufacturingSetup({ initialTab = 'mrp-calendar' }: ManufacturingSetupProps) {
  const [activeTab, setActiveTab] = useState<ManufacturingSetupTab>(initialTab);
  const [payload, setPayload] = useState<ManufacturingSetupPayload | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<SetupRow | null>(null);
  const [form, setForm] = useState<ManufacturingSetupForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { confirm, confirmationDialog } = useConfirmDialog();

  useEffect(() => {
    setActiveTab(initialTab);
    setSearchTerm('');
  }, [initialTab]);

  const definition = tabDefinition(activeTab);

  const loadSetup = async () => {
    setLoading(true);
    setError('');
    try {
      setPayload(await fetchManufacturingSetup());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Manufacturing setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSetup();
  }, []);

  const rows = useMemo(() => rowsForTab(payload, activeTab), [activeTab, payload]);
  const stats = payload?.stats ?? {
    calendarDays: 0,
    manufacturingDays: 0,
    nonManufacturingDays: 0,
    demandTypes: 0,
  };

  const filteredRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      const searchable = isCalendarDay(row)
        ? `${row.calendarDate} ${formatDate(row.calendarDate)} ${row.weekday} ${row.dayNumber} ${yesNo(row.manufacturingAvailable)}`
        : `${row.code} ${row.name} ${row.demandCount} ${row.requirementCount}`;
      return searchable.toLowerCase().includes(needle);
    });
  }, [rows, searchTerm]);

  const openCreateDialog = () => {
    setEditingRow(null);
    setForm(emptyForm());
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const openEditDialog = (row: SetupRow) => {
    setEditingRow(row);
    setForm(formFromRow(row));
    setMessage('');
    setError('');
    setDialogOpen(true);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const response = await saveManufacturingSetupRecord(activeTab, form, editingRow ? rowId(editingRow) : undefined);
      if (response.data) setPayload(response.data);
      setDialogOpen(false);
      setEditingRow(null);
      setForm(emptyForm());
      setMessage(response.message ?? `${definition.singularLabel} saved.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `${definition.singularLabel} could not be saved.`);
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row: SetupRow) => {
    const id = rowId(row);
    const confirmed = await confirm({
      title: `Delete ${definition.singularLabel}`,
      description: deleteDescription(activeTab),
      detail: rowDisplay(row),
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    setDeletingId(id);
    setError('');
    setMessage('');
    try {
      const response = await deleteManufacturingSetupRecord(activeTab, id);
      if (response.data) setPayload(response.data);
      setMessage(response.message ?? `${definition.singularLabel} deleted.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : `${definition.singularLabel} could not be deleted.`);
    } finally {
      setDeletingId('');
    }
  };

  const columns = useMemo<AdvancedTableColumn<SetupRow>[]>(() => {
    const actions: AdvancedTableColumn<SetupRow> = {
      id: 'actions',
      header: 'Actions',
      accessor: () => '',
      cell: (row) => {
        const id = rowId(row);
        return (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => openEditDialog(row)}>
              <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Edit</span>
            </Button>
            <Button size="sm" variant="danger" disabled={deletingId === id} onClick={() => void deleteRow(row)}>
              <span className="inline-flex items-center gap-2">
                {deletingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </span>
            </Button>
          </div>
        );
      },
      width: 210,
      sortable: false,
      filterable: false,
    };

    if (activeTab === 'mrp-calendar') {
      return [
        { id: 'calendarDate', header: 'Date', accessor: (row) => (isCalendarDay(row) ? row.calendarDate : ''), cell: (row) => isCalendarDay(row) ? formatDate(row.calendarDate) : null, width: 150 },
        { id: 'weekday', header: 'Weekday', accessor: (row) => (isCalendarDay(row) ? row.weekday : ''), width: 150 },
        { id: 'dayNumber', header: 'MRP day number', accessor: (row) => (isCalendarDay(row) ? row.dayNumber : 0), align: 'right', width: 150 },
        {
          id: 'manufacturingAvailable',
          header: 'Manufacturing availability',
          accessor: (row) => (isCalendarDay(row) ? yesNo(row.manufacturingAvailable) : ''),
          cell: (row) => isCalendarDay(row) ? <AvailabilityBadge available={row.manufacturingAvailable} /> : null,
          width: 260,
        },
        actions,
      ];
    }

    return [
      { id: 'code', header: 'Code', accessor: (row) => (!isCalendarDay(row) ? row.code : ''), width: 120 },
      { id: 'name', header: 'Description', accessor: (row) => (!isCalendarDay(row) ? row.name : ''), width: 280 },
      { id: 'demandCount', header: 'Demand rows', accessor: (row) => (!isCalendarDay(row) ? row.demandCount : 0), align: 'right', width: 130 },
      { id: 'requirementCount', header: 'Requirement rows', accessor: (row) => (!isCalendarDay(row) ? row.requirementCount : 0), align: 'right', width: 160 },
      actions,
    ];
  }, [activeTab, deletingId]);

  const renderFormFields = () => {
    if (activeTab === 'mrp-calendar') {
      return (
        <>
          <label className="block text-sm font-medium text-akiva-text">
            Calendar date
            <input
              className={`${inputClassName} mt-1`}
              type="date"
              value={form.calendarDate ?? ''}
              onChange={(event) => setForm((current) => ({ ...current, calendarDate: event.target.value }))}
              required
              disabled={Boolean(editingRow)}
            />
          </label>
          <label className="flex min-h-11 items-center gap-3 rounded-lg border border-akiva-border bg-akiva-surface px-3 text-sm font-medium text-akiva-text sm:mt-6">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-akiva-border text-akiva-accent focus:ring-akiva-accent"
              checked={Boolean(form.manufacturingAvailable)}
              onChange={(event) => setForm((current) => ({ ...current, manufacturingAvailable: event.target.checked }))}
            />
            Available for manufacturing
          </label>
        </>
      );
    }

    return (
      <>
        <label className="block text-sm font-medium text-akiva-text">
          Code
          <input className={`${inputClassName} mt-1`} value={form.code ?? ''} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} maxLength={6} required disabled={Boolean(editingRow)} />
        </label>
        <label className="block text-sm font-medium text-akiva-text">
          Description
          <input className={`${inputClassName} mt-1`} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} maxLength={30} required />
        </label>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-[#f2eeee] p-3 text-akiva-text dark:bg-slate-950 sm:p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4">
        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-4 shadow-sm dark:border-slate-800">
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-akiva-accent">Configuration</p>
              <h1 className="mt-1 text-2xl font-bold text-akiva-text sm:text-3xl">Manufacturing setup</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">{definition.description}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row min-[900px]:shrink-0">
              <Button variant="secondary" onClick={() => void loadSetup()} disabled={loading}>
                <span className="inline-flex items-center justify-center gap-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</span>
              </Button>
              <Button onClick={openCreateDialog}>
                <span className="inline-flex items-center justify-center gap-2"><Plus className="h-4 w-4" />{definition.addLabel}</span>
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9.5rem),1fr))] gap-3">
            {[
              ['Calendar Days', stats.calendarDays, CalendarCheck],
              ['Manufacturing Days', stats.manufacturingDays, CalendarCheck],
              ['Unavailable Days', stats.nonManufacturingDays, CalendarX],
              ['Demand Types', stats.demandTypes, TreePine],
            ].map(([label, value, Icon]) => {
              const StatIcon = Icon as typeof CalendarCheck;
              return (
                <div key={String(label)} className="rounded-lg border border-akiva-border bg-akiva-surface px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">{String(label)}</p>
                    <StatIcon className="h-4 w-4 text-akiva-accent" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-akiva-text">{Number(value).toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-white/70 bg-akiva-surface-raised p-3 shadow-sm dark:border-slate-800 sm:p-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {TAB_DEFINITIONS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? 'bg-akiva-accent text-white shadow-sm'
                    : 'border border-akiva-border bg-akiva-surface text-akiva-text hover:bg-akiva-surface-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-akiva-text">{definition.title}</h2>
              <p className="mt-1 text-sm text-akiva-text-muted">{rows.length.toLocaleString()} records</p>
            </div>
            <label className="relative block w-full min-[900px]:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
              <input className={`${inputClassName} pl-9`} placeholder={`Search ${definition.label.toLowerCase()}...`} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </label>
          </div>

          {message ? <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
          {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          <div className="mt-4 overflow-hidden rounded-lg border border-akiva-border bg-akiva-surface">
            <AdvancedTable
              tableId={`manufacturing-setup-${activeTab}`}
              columns={columns}
              rows={filteredRows}
              rowKey={(row) => rowId(row)}
              loading={loading}
              loadingMessage="Loading manufacturing setup..."
              emptyMessage={`No ${definition.label.toLowerCase()} found.`}
              initialPageSize={25}
            />
          </div>
        </section>
      </div>

      <Modal
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={`${editingRow ? 'Edit' : 'Add'} ${definition.singularLabel}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="manufacturing-setup-form" disabled={saving}>
              <span className="inline-flex items-center justify-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </span>
            </Button>
          </>
        }
      >
        <form id="manufacturing-setup-form" onSubmit={submitForm} className="grid gap-4 sm:grid-cols-2">
          {renderFormFields()}
        </form>
      </Modal>

      {confirmationDialog}
    </div>
  );
}
