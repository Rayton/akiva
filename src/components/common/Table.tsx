import React, { ReactNode, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface Column {
  key: string;
  header: string;
  render?: (value: any, row: any) => ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: any) => unknown;
}

interface TableProps {
  columns: Column[];
  data: any[];
  className?: string;
  initialSortKey?: string;
  initialSortDirection?: SortDirection;
}

type SortDirection = 'asc' | 'desc';

function asSortableValue(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const numeric = Number(value.replace(/[$,%\s,]/g, ''));
    if (value.trim() !== '' && Number.isFinite(numeric)) return numeric;
    const date = Date.parse(value);
    if (!Number.isNaN(date) && /[-/:]|^\d{4}/.test(value)) return date;
    return value.toLowerCase();
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return JSON.stringify(value).toLowerCase();
}

function compareValues(a: unknown, b: unknown): number {
  const first = asSortableValue(a);
  const second = asSortableValue(b);
  if (typeof first === 'number' && typeof second === 'number') return first - second;
  return String(first).localeCompare(String(second), undefined, { numeric: true, sensitivity: 'base' });
}

export function Table({ columns, data, className = '', initialSortKey, initialSortDirection = 'asc' }: TableProps) {
  const [sortKey, setSortKey] = useState(initialSortKey ?? '');
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSortDirection);

  const sortedData = useMemo(() => {
    const column = columns.find((candidate) => candidate.key === sortKey);
    if (!column || column.sortable === false) return data;

    return [...data].sort((a, b) => {
      const first = column.sortValue ? column.sortValue(a) : a[column.key];
      const second = column.sortValue ? column.sortValue(b) : b[column.key];
      const result = compareValues(first, second);
      return sortDirection === 'asc' ? result : -result;
    });
  }, [columns, data, sortDirection, sortKey]);

  const toggleSort = (column: Column) => {
    if (column.sortable === false || column.key === 'actions') return;
    if (sortKey === column.key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(column.key);
    setSortDirection('asc');
  };

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-akiva-border bg-akiva-surface-muted">
            {columns.map((column) => {
              const sortable = column.sortable !== false && column.key !== 'actions';
              const active = sortKey === column.key;
              const SortIcon = active ? (sortDirection === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={`px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-akiva-text-muted ${
                    column.className || ''
                  }`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-akiva-text focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                    >
                      <span>{column.header}</span>
                      <SortIcon className={`h-3.5 w-3.5 ${active ? 'text-akiva-accent' : 'text-akiva-text-muted'}`} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-akiva-border bg-akiva-surface-raised">
          {sortedData.map((row, index) => (
            <tr key={index} className="transition-colors duration-200 hover:bg-akiva-surface-muted">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`whitespace-nowrap px-6 py-4 text-sm text-akiva-text ${
                    column.className || ''
                  }`}
                >
                  {column.render
                    ? column.render(row[column.key], row)
                    : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
