import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  panelClassName?: string;
  disabled?: boolean;
  clearable?: boolean;
  min?: string;
  max?: string;
}

interface CalendarDay {
  iso: string;
  label: number;
  inCurrentMonth: boolean;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const baseTriggerClass =
  'h-11 w-full rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 text-left text-sm text-akiva-text shadow-sm transition hover:border-akiva-accent focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent disabled:cursor-not-allowed disabled:bg-akiva-surface-muted disabled:text-akiva-text-muted disabled:opacity-70';

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function formatDisplayDate(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDay = start.getDay();
  const firstGridDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1 - startDay);

  const days: CalendarDay[] = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(firstGridDate.getFullYear(), firstGridDate.getMonth(), firstGridDate.getDate() + index);
    days.push({
      iso: toIsoDate(current),
      label: current.getDate(),
      inCurrentMonth: sameMonth(current, monthDate),
    });
  }

  return days;
}

function compareIsoDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  className = '',
  inputClassName = '',
  panelClassName = '',
  disabled = false,
  clearable = false,
  min,
  max,
}: DatePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseIsoDate(value);
  const initialMonth = selectedDate ?? new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));

  useEffect(() => {
    if (!selectedDate) return;
    setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  }, [selectedDate?.getFullYear(), selectedDate?.getMonth()]);

  useEffect(() => {
    if (!isOpen) return;
    const listener = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [isOpen]);

  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(visibleMonth);
  }, [visibleMonth]);

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);

  const isOutsideAllowedRange = (iso: string): boolean => {
    if (min && compareIsoDates(iso, min) < 0) return true;
    if (max && compareIsoDates(iso, max) > 0) return true;
    return false;
  };

  const todayIso = toIsoDate(new Date());

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        className={[baseTriggerClass, inputClassName].filter(Boolean).join(' ')}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={value ? 'truncate' : 'truncate text-akiva-text-muted'}>{value ? formatDisplayDate(value) : placeholder}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-akiva-accent-text" />
        </span>
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Choose date"
          className={[
            'absolute z-40 mt-2 max-w-[calc(100vw-2rem)] rounded-lg border border-akiva-border bg-akiva-surface-raised p-3 text-akiva-text shadow-xl shadow-slate-900/10',
            panelClassName,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ width: 'min(304px, calc(100vw - 2rem))' }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-full text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text focus:outline-none focus:ring-2 focus:ring-akiva-accent"
              onClick={() =>
                setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-akiva-text">{monthLabel}</div>
            <button
              type="button"
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-full text-akiva-text-muted transition hover:bg-akiva-surface-muted hover:text-akiva-text focus:outline-none focus:ring-2 focus:ring-akiva-accent"
              onClick={() =>
                setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1 text-center text-[11px] font-medium text-akiva-text-muted">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = day.iso === value;
              const isToday = day.iso === todayIso;
              const isDisabled = isOutsideAllowedRange(day.iso);

              return (
                <button
                  key={day.iso}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    onChange(day.iso);
                    setIsOpen(false);
                  }}
                  className={`h-8 rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-akiva-accent ${
                    isSelected
                      ? 'bg-akiva-accent font-semibold text-white shadow-sm'
                      : day.inCurrentMonth
                        ? 'text-akiva-text hover:bg-akiva-accent-soft'
                        : 'text-akiva-text-muted hover:bg-akiva-surface-muted'
                  } ${isToday && !isSelected ? 'ring-1 ring-inset ring-akiva-accent/60' : ''} ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-akiva-border pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(todayIso);
                setIsOpen(false);
              }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-akiva-accent-text hover:bg-akiva-accent-soft"
            >
              Today
            </button>
            {clearable ? (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
