import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SearchableSelect } from './SearchableSelect';

export interface AdvancedTableColumn<T> {
  id: string;
  header: string;
  accessor: (row: T) => unknown;
  cell?: (row: T) => React.ReactNode;
  exportValue?: (row: T) => string | number;
  sortValue?: (row: T) => unknown;
  width?: number;
  minWidth?: number;
  filterable?: boolean;
  sortable?: boolean;
}

interface AdvancedTableProps<T> {
  tableId: string;
  columns: AdvancedTableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  initialPageSize?: number;
  pageSizeOptions?: number[];
}

type WidthMap = Record<string, number>;

type FilterMap = Record<string, string>;

type SortDirection = 'asc' | 'desc';

type SortState = {
  columnId: string;
  direction: SortDirection;
};

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function asSortableValue(value: unknown): string | number {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const numeric = Number(value.replace(/[$,%\s,]/g, ''));
    if (value.trim() !== '' && Number.isFinite(numeric)) return numeric;
    const date = Date.parse(value);
    if (!Number.isNaN(date) && /[-/:]|^\d{4}/.test(value)) return date;
    return value.toLowerCase();
  }
  return JSON.stringify(value).toLowerCase();
}

function compareValues(first: unknown, second: unknown): number {
  const a = asSortableValue(first);
  const b = asSortableValue(second);
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function AdvancedTable<T>({
  tableId,
  columns,
  rows,
  rowKey,
  emptyMessage = 'No rows found.',
  loading = false,
  loadingMessage = 'Loading...',
  initialPageSize = 25,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
}: AdvancedTableProps<T>) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [pageIndex, setPageIndex] = useState(0);
  const [filters, setFilters] = useState<FilterMap>({});
  const [sort, setSort] = useState<SortState | null>(null);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => columns.map((column) => column.id));
  const [columnWidths, setColumnWidths] = useState<WidthMap>({});

  const resizerRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const storageKey = `table-col-widths:${tableId}`;
    const stored = localStorage.getItem(storageKey);
    if (!stored) {
      const defaults: WidthMap = {};
      columns.forEach((column) => {
        if (column.width) defaults[column.id] = column.width;
      });
      setColumnWidths(defaults);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as WidthMap;
      setColumnWidths(parsed);
    } catch {
      const defaults: WidthMap = {};
      columns.forEach((column) => {
        if (column.width) defaults[column.id] = column.width;
      });
      setColumnWidths(defaults);
    }
  }, [columns, tableId]);

  useEffect(() => {
    const storageKey = `table-col-widths:${tableId}`;
    localStorage.setItem(storageKey, JSON.stringify(columnWidths));
  }, [columnWidths, tableId]);

  useEffect(() => {
    const knownIds = new Set(columns.map((column) => column.id));
    setVisibleColumnIds((previous) => {
      const next = previous.filter((id) => knownIds.has(id));
      if (next.length === 0) return columns.map((column) => column.id);
      return next;
    });
  }, [columns]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizerRef.current) return;
      const { colId, startX, startWidth } = resizerRef.current;
      const delta = event.clientX - startX;
      const column = columns.find((col) => col.id === colId);
      const minWidth = column?.minWidth ?? 120;
      setColumnWidths((previous) => ({
        ...previous,
        [colId]: Math.max(minWidth, startWidth + delta),
      }));
    };

    const onMouseUp = () => {
      resizerRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [columns]);

  const visibleColumns = useMemo(
    () => columns.filter((column) => visibleColumnIds.includes(column.id)),
    [columns, visibleColumnIds]
  );

  const filteredRows = useMemo(() => {
    if (rows.length === 0) return rows;

    return rows.filter((row) => {
      for (const column of columns) {
        const needle = (filters[column.id] ?? '').trim().toLowerCase();
        if (!needle) continue;
        const hay = asText(column.accessor(row)).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [columns, filters, rows]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = columns.find((candidate) => candidate.id === sort.columnId);
    if (!column || column.sortable === false) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      const first = column.sortValue ? column.sortValue(a) : column.accessor(a);
      const second = column.sortValue ? column.sortValue(b) : column.accessor(b);
      const result = compareValues(first, second);
      return sort.direction === 'asc' ? result : -result;
    });
  }, [columns, filteredRows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));

  useEffect(() => {
    setPageIndex((previous) => Math.min(previous, pageCount - 1));
  }, [pageCount]);

  const pagedRows = useMemo(() => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    return sortedRows.slice(start, end);
  }, [sortedRows, pageIndex, pageSize]);

  const rangeStart = sortedRows.length === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min(sortedRows.length, (pageIndex + 1) * pageSize);

  useEffect(() => {
    setPageIndex(0);
  }, [filters, sort]);

  const onExportExcel = () => {
    const exportRows = sortedRows.map((row) => {
      const output: Record<string, string | number> = {};
      visibleColumns.forEach((column) => {
        const value = column.exportValue ? column.exportValue(row) : column.accessor(row);
        output[column.header] = typeof value === 'number' ? value : asText(value);
      });
      return output;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    XLSX.writeFile(workbook, `${tableId}.xlsx`);
  };

  const onExportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
    const head = [visibleColumns.map((column) => column.header)];
    const body = sortedRows.map((row) =>
      visibleColumns.map((column) => {
        const value = column.exportValue ? column.exportValue(row) : column.accessor(row);
        return typeof value === 'number' ? String(value) : asText(value);
      })
    );

    autoTable(doc, {
      head,
      body,
      styles: { fontSize: 8 },
      margin: { top: 24, right: 18, bottom: 24, left: 18 },
    });

    doc.save(`${tableId}.pdf`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowColumnsPanel((previous) => !previous)}
            className="inline-flex items-center gap-1 rounded-md border border-akiva-border px-2.5 py-1.5 text-xs font-medium text-akiva-accent-text hover:bg-akiva-accent-soft"
          >
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            className="inline-flex items-center gap-1 rounded-md border border-akiva-border px-2.5 py-1.5 text-xs font-medium text-akiva-accent-text hover:bg-akiva-accent-soft"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="inline-flex items-center gap-1 rounded-md border border-akiva-border px-2.5 py-1.5 text-xs font-medium text-akiva-accent-text hover:bg-akiva-accent-soft"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-akiva-text-muted">
          <span>
            Showing {rangeStart} to {rangeEnd} of {sortedRows.length} items
          </span>
          <span className="text-akiva-border-strong">|</span>
          <span>{rows.length} total rows</span>
        </div>
      </div>

      {showColumnsPanel ? (
        <div className="rounded-lg border border-akiva-border bg-akiva-surface-muted p-3">
          <p className="mb-2 text-xs font-medium text-akiva-text">Column Visibility</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {columns.map((column) => {
              const checked = visibleColumnIds.includes(column.id);
              return (
                <label key={column.id} className="inline-flex items-center gap-2 text-xs text-akiva-text-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const isChecked = event.target.checked;
                      setVisibleColumnIds((previous) => {
                        if (isChecked) return [...new Set([...previous, column.id])];
                        const next = previous.filter((id) => id !== column.id);
                        return next.length === 0 ? previous : next;
                      });
                    }}
                    className="h-3.5 w-3.5 rounded border-akiva-border-strong text-akiva-accent-text focus:ring-akiva-accent"
                  />
                  {column.header}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-akiva-border">
        <table className="w-full min-w-[640px] table-fixed">
          <thead>
            <tr className="bg-akiva-table-header text-left text-xs uppercase tracking-wide text-akiva-text-muted">
              {visibleColumns.map((column) => {
                const width = columnWidths[column.id] ?? column.width ?? 180;
                const sortable = column.sortable !== false;
                const active = sort?.columnId === column.id;
                const SortIcon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={column.id}
                    style={{ width }}
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="relative px-3 py-2 align-top"
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSort((current) =>
                            current?.columnId === column.id
                              ? { columnId: column.id, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                              : { columnId: column.id, direction: 'asc' }
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-md text-left transition hover:text-akiva-text focus:outline-none focus:ring-2 focus:ring-akiva-accent"
                      >
                        <span>{column.header}</span>
                        <SortIcon className={`h-3.5 w-3.5 ${active ? 'text-akiva-accent' : 'text-akiva-text-muted'}`} />
                      </button>
                    ) : (
                      <span>{column.header}</span>
                    )}
                    <div
                      onMouseDown={(event) => {
                        event.preventDefault();
                        resizerRef.current = { colId: column.id, startX: event.clientX, startWidth: width };
                        document.body.style.cursor = 'col-resize';
                        document.body.style.userSelect = 'none';
                      }}
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-akiva-accent"
                    />
                  </th>
                );
              })}
            </tr>
            <tr className="border-t border-akiva-border bg-akiva-surface-raised">
              {visibleColumns.map((column) => (
                <th key={`${column.id}-filter`} className="px-3 py-2">
                  {column.filterable === false ? null : (
                    <input
                      value={filters[column.id] ?? ''}
                      onChange={(event) =>
                        setFilters((previous) => ({
                          ...previous,
                          [column.id]: event.target.value,
                        }))
                      }
                      placeholder={`Filter ${column.header}`}
                      className="w-full rounded-md border border-akiva-border bg-akiva-surface px-2 py-1 text-xs text-akiva-text placeholder:text-akiva-text-muted"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-3 py-8 text-center text-sm text-akiva-text-muted">
                  {loadingMessage}
                </td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="px-3 py-8 text-center text-sm text-akiva-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedRows.map((row, index) => (
                <tr
                  key={rowKey ? rowKey(row, index) : `${tableId}-${pageIndex}-${index}`}
                  className="border-t border-akiva-border hover:bg-akiva-table-row-hover"
                >
                  {visibleColumns.map((column) => {
                    const value = column.accessor(row);
                    return (
                      <td key={column.id} className="px-3 py-2 text-sm text-akiva-text">
                        {column.cell ? column.cell(row) : asText(value)}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-akiva-text-muted">
          <span>Rows per page</span>
          <SearchableSelect
            value={String(pageSize)}
            onChange={(value) => {
              setPageSize(Number(value));
              setPageIndex(0);
            }}
            options={pageSizeOptions.map((size) => ({
              value: String(size),
              label: String(size),
            }))}
            className="w-24"
            inputClassName="rounded-md py-1 pl-2 pr-7 text-xs"
            panelClassName="max-h-40"
            placeholder="Rows"
          />
        </div>

        <div className="flex items-center gap-2 text-akiva-text-muted">
          <button
            type="button"
            onClick={() => setPageIndex((previous) => Math.max(0, previous - 1))}
            disabled={pageIndex === 0}
            className="inline-flex items-center gap-1 rounded-md border border-akiva-border px-2 py-1 text-akiva-text hover:bg-akiva-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </button>
          <span>
            Page {Math.min(pageIndex + 1, pageCount)} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPageIndex((previous) => Math.min(pageCount - 1, previous + 1))}
            disabled={pageIndex >= pageCount - 1}
            className="inline-flex items-center gap-1 rounded-md border border-akiva-border px-2 py-1 text-akiva-text hover:bg-akiva-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
