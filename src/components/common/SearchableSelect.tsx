import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  searchText?: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  panelClassName?: string;
}

const BASE_INPUT_CLASS =
  'w-full rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-brand-800 dark:bg-slate-950 dark:text-white dark:focus:border-brand-400 dark:focus:ring-brand-900/50';

const BASE_PANEL_CLASS =
  'absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-brand-100 bg-white p-1 shadow-xl dark:border-brand-900/50 dark:bg-slate-900';

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select option',
  emptyMessage = 'No matching options.',
  disabled = false,
  className = '',
  inputClassName = '',
  panelClassName = '',
}: SearchableSelectProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  useEffect(() => {
    if (!open) {
      setQuery(selectedOption?.label ?? '');
    }
  }, [open, selectedOption]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, []);

  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.searchText ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={open ? query : selectedOption?.label ?? ''}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (event.key === 'Enter' && filteredOptions.length > 0) {
            const first = filteredOptions[0];
            if (first.disabled) return;
            onChange(first.value);
            setOpen(false);
            setQuery(first.label);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={`${BASE_INPUT_CLASS} ${disabled ? 'cursor-not-allowed opacity-70' : ''} ${inputClassName}`}
      />
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((previous) => !previous);
          if (!open) setQuery('');
        }}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-2 text-brand-500 dark:text-brand-300"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className={`${BASE_PANEL_CLASS} ${panelClassName}`}>
          {filteredOptions.length === 0 ? (
            <p className="px-2 py-2 text-xs text-gray-500 dark:text-gray-400">{emptyMessage}</p>
          ) : (
            filteredOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                disabled={option.disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                  setQuery(option.label);
                }}
                className={`flex w-full items-start rounded-md px-2 py-2 text-left text-sm ${
                  option.value === value
                    ? 'bg-brand-100 text-brand-900 dark:bg-brand-900/50 dark:text-brand-100'
                    : 'text-gray-700 hover:bg-brand-50 dark:text-gray-200 dark:hover:bg-brand-900/30'
                } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
