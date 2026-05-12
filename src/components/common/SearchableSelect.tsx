import { Children, Fragment, ReactNode, isValidElement, useMemo, useState } from 'react';
import { Combobox, Transition } from '@headlessui/react';
import { Check, ChevronsUpDown } from 'lucide-react';

interface ChangeEventLike {
  target: {
    value: string;
    name?: string;
  };
}

type SearchableSelectChangeHandler = ((event: ChangeEventLike) => void) | ((value: string) => void);

interface SearchableSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  searchText?: string;
}

interface SearchableSelectProps {
  value?: string | number;
  onChange?: SearchableSelectChangeHandler;
  options?: SearchableSelectOption[];
  children?: ReactNode;
  className?: string;
  inputClassName?: string;
  panelClassName?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  placeholder?: string;
}

interface SelectOption {
  value: string;
  label: string;
  disabled: boolean;
  searchText: string;
}

function extractLayoutClasses(className: string): string {
  return className
    .split(/\s+/)
    .filter((token) =>
      /^(?:[a-z]+:)*(?:w-|min-w-|max-w-|col-span-|col-start-|col-end-|row-span-|row-start-|row-end-|order-|justify-self-|self-|place-self-|basis-|grow|shrink)/.test(
        token
      )
    )
    .join(' ');
}

function flattenText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((child) => flattenText(child)).join(' ');
  if (isValidElement(node)) return flattenText(node.props.children);
  return '';
}

function extractOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];

  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === 'option') {
        const rawValue = child.props.value ?? '';
        const label = flattenText(child.props.children).trim();
        options.push({
          value: String(rawValue),
          label,
          disabled: Boolean(child.props.disabled),
          searchText: `${label} ${String(rawValue)}`.trim(),
        });
        return;
      }
      walk(child.props.children);
    });
  };

  walk(children);
  return options;
}

export function SearchableSelect({
  value = '',
  onChange,
  options: propOptions,
  children,
  className = '',
  inputClassName = '',
  panelClassName = '',
  disabled = false,
  required = false,
  id,
  name,
  placeholder = 'Search...',
}: SearchableSelectProps) {
  const usesPropOptions = Array.isArray(propOptions);
  const layoutClassName = useMemo(() => extractLayoutClasses(className), [className]);
  const options = useMemo(() => {
    if (usesPropOptions) {
      return (propOptions ?? []).map((option) => {
        const normalizedValue = String(option.value ?? '');
        const label = String(option.label ?? '');
        return {
          value: normalizedValue,
          label,
          disabled: Boolean(option.disabled),
          searchText: option.searchText?.trim() || `${label} ${normalizedValue}`.trim(),
        };
      });
    }

    return extractOptions(children);
  }, [children, propOptions, usesPropOptions]);
  const normalizedValue = String(value ?? '');
  const selectedOption = options.find((option) => option.value === normalizedValue) ?? null;
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const filteredOptions = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (search === '') return options;
    return options.filter(
      (option) =>
        option.searchText.toLowerCase().includes(search) ||
        option.label.toLowerCase().includes(search) ||
        option.value.toLowerCase().includes(search)
    );
  }, [options, query]);

  return (
    <Combobox
      immediate
      value={selectedOption}
      onChange={(option: SelectOption | null) => {
        const nextValue = option?.value ?? '';
        setIsSearching(false);
        setQuery('');

        if (usesPropOptions) {
          (onChange as ((value: string) => void) | undefined)?.(nextValue);
          return;
        }

        (onChange as ((event: ChangeEventLike) => void) | undefined)?.({
          target: {
            value: nextValue,
            name,
          },
        });
      }}
      disabled={disabled}
    >
      <div className={['relative', layoutClassName].filter(Boolean).join(' ')}>
        <Combobox.Input
          id={id}
          name={name}
          required={required}
          className={[
            'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 pr-10 text-sm shadow-sm',
            'text-gray-900 placeholder:text-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200',
            'disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-white',
            className,
            inputClassName,
          ]
            .filter(Boolean)
            .join(' ')}
          displayValue={(option: SelectOption | null) => (isSearching ? '' : option?.label ?? '')}
          onFocus={() => {
            setIsSearching(true);
            setQuery('');
          }}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={() => {
            setQuery('');
            setIsSearching(false);
          }}
          placeholder={isSearching || !selectedOption ? placeholder : undefined}
          autoComplete="off"
        />
        <Combobox.Button className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none dark:text-gray-500 dark:hover:text-gray-300 border-0 bg-transparent">
          <ChevronsUpDown className="h-4 w-4" />
        </Combobox.Button>

        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Combobox.Options
            className={[
              'absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg',
              'dark:border-slate-600 dark:bg-slate-900',
              panelClassName,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-gray-500 dark:text-gray-400">No results found</div>
            ) : (
              filteredOptions.map((option) => (
                <Combobox.Option
                  key={`${option.value}-${option.label}`}
                  value={option}
                  disabled={option.disabled}
                  className={({ active, disabled: optionDisabled }) =>
                    `relative cursor-pointer select-none py-2 pl-3 pr-9 ${
                      active ? 'bg-brand-50 text-brand-900 dark:bg-slate-700 dark:text-white' : 'text-gray-900 dark:text-gray-100'
                    } ${optionDisabled ? 'cursor-not-allowed opacity-50' : ''}`
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>{option.label || option.value}</span>
                      {selected ? (
                        <span className="absolute inset-y-0 right-2 flex items-center text-brand-600 dark:text-brand-300">
                          <Check className="h-4 w-4" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </Transition>
      </div>
    </Combobox>
  );
}
