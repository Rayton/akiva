import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
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

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 shadow-sm transition hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-brand-400"
      >
        <span className="flex items-center justify-between gap-2">
          <span className={value ? '' : 'text-gray-400 dark:text-slate-400'}>{value ? formatDisplayDate(value) : placeholder}</span>
          <CalendarDays className="h-4 w-4 text-brand-500" />
        </span>
      </button>

      {isOpen ? (
        <div className="absolute z-30 mt-2 w-[296px] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded-lg p-1 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() =>
                setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{monthLabel}</div>
            <button
              type="button"
              className="rounded-lg p-1 text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() =>
                setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1 text-center text-[11px] font-medium text-gray-500 dark:text-slate-400">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isSelected = day.iso === value;
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
                  className={`h-8 rounded-lg text-sm ${
                    isSelected
                      ? 'bg-brand-500 font-semibold text-white'
                      : day.inCurrentMonth
                        ? 'text-gray-800 hover:bg-brand-100 dark:text-slate-100 dark:hover:bg-slate-800'
                        : 'text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800'
                  } ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => onChange(toIsoDate(new Date()))}
              className="rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-slate-800"
            >
              Today
            </button>
            {clearable ? (
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
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
