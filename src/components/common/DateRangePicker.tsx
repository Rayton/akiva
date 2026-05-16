import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { DEFAULT_SYSTEM_DATE_FORMAT, formatDateRangeWithSystemFormat, useSystemDateFormat } from '../../lib/dateFormat';

export type DateRangePreset =
  | 'last-3-months'
  | 'this-month'
  | 'last-month'
  | 'this-quarter'
  | 'last-quarter'
  | 'this-year'
  | 'last-year'
  | 'custom';

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
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-3-months', label: 'Last 3 months' },
  { value: 'this-quarter', label: 'This quarter' },
  { value: 'last-quarter', label: 'Last quarter' },
  { value: 'this-year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
  { value: 'custom', label: 'Date range' },
];

const DATE_RANGE_POPOVER_Z_INDEX = 2147483646;

interface PopoverPosition {
  left: number;
  top: number;
  width: number;
}

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

function endOfQuarter(value: Date): Date {
  const quarterStartMonth = Math.floor(value.getMonth() / 3) * 3;
  return new Date(value.getFullYear(), quarterStartMonth + 3, 0);
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

  if (preset === 'last-quarter') {
    const previousQuarter = new Date(anchor.getFullYear(), Math.floor(anchor.getMonth() / 3) * 3 - 3, 1);
    return { preset, from: toIsoDate(startOfQuarter(previousQuarter)), to: toIsoDate(endOfQuarter(previousQuarter)) };
  }

  if (preset === 'this-year') {
    return { preset, from: `${anchor.getFullYear()}-01-01`, to: today };
  }

  if (preset === 'last-year') {
    const previousYear = anchor.getFullYear() - 1;
    return { preset, from: `${previousYear}-01-01`, to: `${previousYear}-12-31` };
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRangeValue>(value);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({ left: 16, top: 16, width: 560 });
  const dateFormat = useSystemDateFormat();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const listener = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-akiva-date-popover="true"]')) return;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const anchor = rootRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(560, Math.max(288, viewportWidth - 32));
      const alignRight = panelClassName.split(/\s+/).includes('right-0');
      const preferredLeft = alignRight ? rect.right - width : rect.left;
      const left = Math.min(Math.max(16, preferredLeft), Math.max(16, viewportWidth - width - 16));
      const estimatedHeight = 520;
      const belowTop = rect.bottom + 8;
      const aboveTop = rect.top - estimatedHeight - 8;
      const top = belowTop + estimatedHeight <= viewportHeight - 16 ? belowTop : Math.max(16, aboveTop);

      setPopoverPosition({ left, top, width });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, panelClassName]);

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
          'inline-flex min-h-10 w-full min-w-0 items-center gap-3 rounded-full border border-akiva-border bg-akiva-surface-raised px-3 py-1.5 text-left shadow-sm transition hover:border-akiva-accent focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent disabled:cursor-not-allowed disabled:opacity-60',
          triggerClassName,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="flex min-w-0 shrink items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0 text-akiva-text-muted" />
          <span className="hidden truncate text-sm font-semibold text-akiva-text sm:inline">{label}</span>
        </span>
        <span className="flex min-w-0 shrink items-center gap-2">
          <span className="truncate text-sm font-medium text-akiva-text sm:whitespace-nowrap">{display}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-akiva-text-muted" />
        </span>
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose timeframe"
          className={[
            'fixed rounded-2xl border border-akiva-border bg-akiva-surface-raised p-3 text-akiva-text shadow-xl shadow-slate-900/10',
            panelClassName,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            left: popoverPosition.left,
            top: popoverPosition.top,
            right: 'auto',
            width: popoverPosition.width,
            zIndex: DATE_RANGE_POPOVER_Z_INDEX,
          }}
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
      , document.body) : null}
    </div>
  );
}
