import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { DEFAULT_SYSTEM_DATE_FORMAT, formatDateRangeWithSystemFormat, useSystemDateFormat } from '../../lib/dateFormat';

export type DateRangePreset = 'last-3-months' | 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'custom';

export interface DateRangeValue {
  from: string;
  to: string;
  preset: DateRangePreset;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  label?: string;
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  disabled?: boolean;
}

const PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'this-year', label: 'This year' },
  { value: 'custom', label: 'Date range' },
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function startOfQuarter(value: Date): Date {
  const quarterStartMonth = Math.floor(value.getMonth() / 3) * 3;
  return new Date(value.getFullYear(), quarterStartMonth, 1);
}

export function getPresetDateRange(preset: DateRangePreset, anchor = new Date()): DateRangeValue {
  const today = toIsoDate(anchor);

  if (preset === 'this-month') {
    return { preset, from: toIsoDate(startOfMonth(anchor)), to: today };
  }

  if (preset === 'last-month') {
    const previousMonth = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    return { preset, from: toIsoDate(startOfMonth(previousMonth)), to: toIsoDate(endOfMonth(previousMonth)) };
  }

  if (preset === 'this-quarter') {
    return { preset, from: toIsoDate(startOfQuarter(anchor)), to: today };
  }

  if (preset === 'this-year') {
    return { preset, from: `${anchor.getFullYear()}-01-01`, to: today };
  }

  const start = new Date(anchor.getFullYear(), anchor.getMonth() - 2, 1);
  return { preset: 'last-3-months', from: toIsoDate(start), to: today };
}

export function getDefaultDateRange(): DateRangeValue {
  return getPresetDateRange('last-3-months');
}

export function formatDateRangeDisplay(from: string, to: string, dateFormat = DEFAULT_SYSTEM_DATE_FORMAT): string {
  return formatDateRangeWithSystemFormat(from, to, dateFormat);
}

export function DateRangePicker({
  value,
  onChange,
  label = 'Timeframe',
  className = '',
  triggerClassName = '',
  panelClassName = '',
  disabled = false,
}: DateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const dateFormat = useSystemDateFormat();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const listener = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [open]);

  const display = useMemo(() => formatDateRangeDisplay(value.from, value.to, dateFormat), [dateFormat, value.from, value.to]);

  const selectPreset = (preset: DateRangePreset) => {
    if (preset === 'custom') {
      setDraft((current) => ({ ...current, preset: 'custom' }));
      return;
    }
    const next = getPresetDateRange(preset);
    setDraft(next);
    onChange(next);
    setOpen(false);
  };

  const applyCustom = () => {
    const from = draft.from <= draft.to ? draft.from : draft.to;
    const to = draft.from <= draft.to ? draft.to : draft.from;
    onChange({ preset: 'custom', from, to });
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={[
          'inline-flex min-h-10 w-full min-w-0 items-center gap-2 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1.5 text-left shadow-sm transition hover:border-akiva-accent focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent disabled:cursor-not-allowed disabled:opacity-60',
          triggerClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="flex min-w-0 shrink-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-akiva-text-muted" />
          <span className="truncate text-sm font-semibold text-akiva-text">{label}</span>
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-full bg-akiva-surface px-2.5 py-1 shadow-sm">
          <span className="truncate text-sm font-medium text-akiva-text">{display}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-akiva-text-muted" />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose timeframe"
          className={[
            'absolute z-40 mt-2 w-[min(560px,calc(100vw-2rem))] rounded-2xl border border-akiva-border bg-akiva-surface-raised p-3 text-akiva-text shadow-xl shadow-slate-900/10',
            panelClassName,
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="grid gap-3 md:grid-cols-[180px_1fr]">
            <div className="space-y-1">
              {PRESET_OPTIONS.map((option) => {
                const active = draft.preset === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectPreset(option.value)}
                    className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                      active ? 'bg-akiva-accent text-white' : 'text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                    }`}
                  >
                    {option.label}
                    {active ? <Check className="h-4 w-4" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-akiva-border bg-akiva-surface p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">From</span>
                  <DatePicker
                    value={draft.from}
                    onChange={(from) => setDraft((current) => ({ ...current, from, preset: 'custom' }))}
                    max={draft.to}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">To</span>
                  <DatePicker
                    value={draft.to}
                    onChange={(to) => setDraft((current) => ({ ...current, to, preset: 'custom' }))}
                    min={draft.from}
                  />
                </label>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={applyCustom}
                  className="inline-flex h-10 items-center rounded-lg bg-akiva-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-akiva-accent-strong"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
