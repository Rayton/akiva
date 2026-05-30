import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckSquare, ChevronLeft, ChevronRight, Columns3, FileSpreadsheet, FileText, Rows3, Save, Search } from 'lucide-react';
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
  align?: 'left' | 'center' | 'right';
  sticky?: 'right';
  alwaysVisible?: boolean;
}

interface AdvancedTableProps<T> {
  tableId: string;
  ariaLabel?: string;
  columns: AdvancedTableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  rowAriaLabel?: (row: T, index: number) => string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  density?: Density;
  maxTableHeight?: string;
  enableDensityToggle?: boolean;
  enableSavedViews?: boolean;
  selectableRows?: boolean;
  bulkActions?: Array<{
    id: string;
    label: string;
    onClick: (selectedRows: T[]) => void;
  }>;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  initialScroll?: 'left' | 'right';
  showSearch?: boolean;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  serverSearch?: boolean;
  showExports?: boolean;
  showColumnControls?: boolean;
}

type WidthMap = Record<string, number>;

type FilterMap = Record<string, string>;

type SortDirection = 'asc' | 'desc';

type SortState = {
  columnId: string;
  direction: SortDirection;
};

type Density = 'compact' | 'comfortable' | 'expanded';

const DENSITY_OPTIONS: Array<{ value: Density; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'expanded', label: 'Expanded' },
];

const DENSITY_CLASSES: Record<Density, {
  header: string;
  filter: string;
  body: string;
  selection: string;
  filterInput: string;
  bodyText: string;
  headerOffset: string;
}> = {
  compact: {
    header: 'px-2.5 py-1.5',
    filter: 'px-2.5 py-1.5',
    body: 'px-2.5 py-1.5',
    selection: 'px-2.5 py-1.5',
    filterInput: 'h-7',
    bodyText: 'text-[13px]',
    headerOffset: '32px',
  },
  comfortable: {
    header: 'px-3 py-2',
    filter: 'px-3 py-2',
    body: 'px-3 py-2',
    selection: 'px-3 py-2',
    filterInput: 'h-8',
    bodyText: 'text-sm',
    headerOffset: '37px',
  },
  expanded: {
    header: 'px-4 py-3',
    filter: 'px-4 py-2.5',
    body: 'px-4 py-3',
    selection: 'px-4 py-3',
    filterInput: 'h-9',
    bodyText: 'text-sm',
    headerOffset: '45px',
  },
};

type SavedView = {
  name: string;
  visibleColumnIds: string[];
  filters: FilterMap;
  sort: SortState | null;
  density: Density;
  pageSize: number;
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
  ariaLabel,
  columns,
  rows,
  rowKey,
  rowAriaLabel,
  emptyMessage = 'No rows found.',
  loading = false,
  loadingMessage = 'Loading...',
  density = 'compact',
  maxTableHeight = 'min(70vh, 760px)',
  enableDensityToggle = true,
  enableSavedViews = true,
  selectableRows = false,
  bulkActions = [],
  initialPageSize = 25,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  initialScroll = 'left',
  showSearch = false,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search table',
  serverSearch = false,
  showExports = true,
  showColumnControls = true,
}: AdvancedTableProps<T>) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [pageIndex, setPageIndex] = useState(0);
  const [filters, setFilters] = useState<FilterMap>({});
  const [sort, setSort] = useState<SortState | null>(null);
  const [activeDensity, setActiveDensity] = useState<Density>(density);
  const [internalSearch, setInternalSearch] = useState('');
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => columns.map((column) => column.id));
  const [columnWidths, setColumnWidths] = useState<WidthMap>({});
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const resizerRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const previousTableIdRef = useRef(tableId);
  const activeSearch = searchValue ?? internalSearch;
  const savedViewsKey = `table-saved-views:${tableId}`;
  const alwaysVisibleColumnIds = useMemo(
    () => columns.filter((column) => column.alwaysVisible).map((column) => column.id),
    [columns]
  );

  const updateSearch = (value: string) => {
    onSearchChange?.(value);
    if (searchValue === undefined) setInternalSearch(value);
  };

  useEffect(() => {
    setActiveDensity(density);
  }, [density, tableId]);

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
    if (!enableSavedViews) return;
    const stored = localStorage.getItem(savedViewsKey);
    if (!stored) {
      setSavedViews([]);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as SavedView[];
      setSavedViews(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedViews([]);
    }
  }, [enableSavedViews, savedViewsKey]);

  useEffect(() => {
    if (!enableSavedViews) return;
    localStorage.setItem(savedViewsKey, JSON.stringify(savedViews));
  }, [enableSavedViews, savedViews, savedViewsKey]);

  useEffect(() => {
    if (previousTableIdRef.current !== tableId) {
      previousTableIdRef.current = tableId;
      setVisibleColumnIds(columns.map((column) => column.id));
      setFilters({});
      setSort(null);
      setPageIndex(0);
      return;
    }

    const knownIds = new Set(columns.map((column) => column.id));
    setVisibleColumnIds((previous) => {
      const next = previous.filter((id) => knownIds.has(id));
      const withRequired = [...new Set([...next, ...alwaysVisibleColumnIds])];
      if (withRequired.length === 0) return columns.map((column) => column.id);
      return withRequired;
    });
  }, [alwaysVisibleColumnIds, columns, tableId]);

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

  const tableMinWidth = useMemo(() => {
    const selectionWidth = selectableRows ? 52 : 0;
    return Math.max(640, selectionWidth + visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] ?? column.width ?? 180), 0));
  }, [columnWidths, selectableRows, visibleColumns]);

  useEffect(() => {
    if (initialScroll !== 'right') return;
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const frame = window.requestAnimationFrame(() => {
      scrollContainer.scrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialScroll, tableId, tableMinWidth]);

  const filteredRows = useMemo(() => {
    if (rows.length === 0) return rows;
    const globalNeedle = serverSearch ? '' : activeSearch.trim().toLowerCase();

    return rows.filter((row) => {
      if (globalNeedle) {
        const haystack = columns
          .filter((column) => column.filterable !== false)
          .map((column) => asText(column.accessor(row)))
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(globalNeedle)) return false;
      }

      for (const column of columns) {
        const needle = (filters[column.id] ?? '').trim().toLowerCase();
        if (!needle) continue;
        const hay = asText(column.accessor(row)).toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [activeSearch, columns, filters, rows, serverSearch]);

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
  const visibleColumnCount = visibleColumns.length + (selectableRows ? 1 : 0);
  const rowKeyFor = (row: T, index: number) => rowKey ? rowKey(row, index) : `${tableId}-${pageIndex}-${index}`;
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedRows = pagedRows.filter((row, index) => selectedKeySet.has(rowKeyFor(row, index)));
  const allPageRowsSelected = pagedRows.length > 0 && pagedRows.every((row, index) => selectedKeySet.has(rowKeyFor(row, index)));
  const somePageRowsSelected = pagedRows.some((row, index) => selectedKeySet.has(rowKeyFor(row, index)));
  const showTableViewControls = showColumnControls || enableDensityToggle || enableSavedViews || showExports;

  const alignClass = (align: AdvancedTableColumn<T>['align']) => {
    if (align === 'right') return 'text-right';
    if (align === 'center') return 'text-center';
    return 'text-left';
  };

  const isStickyRightColumn = (column: AdvancedTableColumn<T>) =>
    column.sticky === 'right' || column.id.toLowerCase() === 'action' || column.header.trim().toLowerCase() === 'action';

  const stickyHeaderClass = (column: AdvancedTableColumn<T>) =>
    isStickyRightColumn(column)
      ? 'sticky right-0 top-0 z-40 border-l border-akiva-border bg-akiva-table-header shadow-[-10px_0_18px_rgba(15,23,42,0.08)]'
      : '';

  const stickyFilterClass = (column: AdvancedTableColumn<T>) =>
    isStickyRightColumn(column)
      ? 'sticky right-0 z-30 border-l border-akiva-border bg-akiva-surface-raised shadow-[-10px_0_18px_rgba(15,23,42,0.08)]'
      : '';

  const stickyCellClass = (column: AdvancedTableColumn<T>) =>
    isStickyRightColumn(column)
      ? 'sticky right-0 z-10 border-l border-akiva-border bg-akiva-surface-raised shadow-[-10px_0_18px_rgba(15,23,42,0.08)] group-hover:bg-akiva-table-row-hover'
      : '';

  useEffect(() => {
    setPageIndex(0);
  }, [activeSearch, filters, sort]);

  const densityClasses = DENSITY_CLASSES[activeDensity];
  const headerCellClass = densityClasses.header;
  const filterCellClass = densityClasses.filter;
  const bodyCellClass = densityClasses.body;
  const filterTopStyle = { top: densityClasses.headerOffset };

  const saveCurrentView = () => {
    const view: SavedView = {
      name: `View ${savedViews.length + 1}`,
      visibleColumnIds,
      filters,
      sort,
      density: activeDensity,
      pageSize,
    };
    setSavedViews((previous) => [view, ...previous.filter((existing) => existing.name !== view.name)].slice(0, 6));
  };

  const applySavedView = (viewName: string) => {
    const view = savedViews.find((candidate) => candidate.name === viewName);
    if (!view) return;
    setVisibleColumnIds([
      ...new Set([
        ...view.visibleColumnIds.filter((id) => columns.some((column) => column.id === id)),
        ...alwaysVisibleColumnIds,
      ]),
    ]);
    setFilters(view.filters);
    setSort(view.sort);
    setActiveDensity(view.density);
    setPageSize(view.pageSize);
    setPageIndex(0);
  };

  const togglePageSelection = () => {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (allPageRowsSelected) {
        pagedRows.forEach((row, index) => next.delete(rowKeyFor(row, index)));
      } else {
        pagedRows.forEach((row, index) => next.add(rowKeyFor(row, index)));
      }
      return [...next];
    });
  };

  const toggleRowSelection = (key: string) => {
    setSelectedKeys((previous) => (
      previous.includes(key) ? previous.filter((candidate) => candidate !== key) : [...previous, key]
    ));
  };

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
      <div className="space-y-2">
        {showTableViewControls ? (
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {showColumnControls ? (
              <button
                type="button"
                onClick={() => setShowColumnsPanel((previous) => !previous)}
                aria-expanded={showColumnsPanel}
                aria-controls={`${tableId}-columns-panel`}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm hover:bg-akiva-surface-muted hover:text-akiva-text"
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </button>
            ) : null}
            {enableDensityToggle ? (
              <div
                role="group"
                aria-label="Table row density"
                className="inline-flex min-h-8 items-center gap-1 rounded-md border border-akiva-border bg-akiva-surface-raised p-0.5 text-xs font-semibold shadow-sm"
              >
                <Rows3 className="ml-1 h-3.5 w-3.5 text-akiva-text-muted" aria-hidden="true" />
                {DENSITY_OPTIONS.map((option) => {
                  const active = activeDensity === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setActiveDensity(option.value)}
                      aria-pressed={active}
                      className={`min-h-6 rounded px-2 text-xs font-semibold ${
                        active
                          ? 'bg-akiva-surface-muted text-akiva-text shadow-sm'
                          : 'text-akiva-text-muted hover:bg-akiva-surface-muted hover:text-akiva-text'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {enableSavedViews ? (
              <>
                <button
                  type="button"
                  onClick={saveCurrentView}
                  title="Save current table view"
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm hover:bg-akiva-surface-muted hover:text-akiva-text"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save view
                </button>
                {savedViews.length > 0 ? (
                  <SearchableSelect
                    value=""
                    onChange={applySavedView}
                    options={[{ value: '', label: 'Saved views' }, ...savedViews.map((view) => ({ value: view.name, label: view.name }))]}
                    className="w-36"
                    inputClassName="h-8 rounded-md py-1 pl-2 pr-7 text-xs font-semibold"
                    panelClassName="max-h-48"
                    placeholder="Saved views"
                  />
                ) : null}
              </>
            ) : null}
          </div>

          {showExports ? (
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 xl:justify-end">
              <button
                type="button"
                onClick={onExportExcel}
                aria-label={`Export ${ariaLabel ?? tableId} to Excel`}
                title="Export to Excel"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm hover:bg-akiva-surface-muted hover:text-akiva-text"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Excel
              </button>
              <button
                type="button"
                onClick={onExportPdf}
                aria-label={`Export ${ariaLabel ?? tableId} to PDF`}
                title="Export to PDF"
                className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm hover:bg-akiva-surface-muted hover:text-akiva-text"
              >
                <FileText className="h-3.5 w-3.5" />
                PDF
              </button>
            </div>
          ) : null}
        </div>
        ) : null}

        <div className="flex flex-col gap-2 rounded-lg border border-akiva-border bg-akiva-surface px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
          {showSearch ? (
            <div className="relative w-full sm:max-w-md sm:flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-akiva-text-muted" />
              <input
                value={activeSearch}
                onChange={(event) => updateSearch(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={`Search ${ariaLabel ?? tableId}`}
                className="h-8 w-full rounded-md border border-akiva-border bg-akiva-surface-raised pl-8 pr-3 text-xs font-medium text-akiva-text shadow-sm placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent"
              />
            </div>
          ) : null}

          <div className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-akiva-text-muted sm:justify-end">
            <span aria-live="polite">
              Showing {rangeStart} to {rangeEnd} of {sortedRows.length} items
            </span>
            <span className="text-akiva-border-strong">|</span>
            <span>{rows.length} total rows</span>
          </div>
        </div>
      </div>

      {selectableRows && selectedRows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-akiva-pending bg-akiva-pending-soft px-3 py-2 text-xs font-semibold text-akiva-text shadow-sm">
          <span className="inline-flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-akiva-accent-text" />
            {selectedRows.length} selected on current page
          </span>
          {bulkActions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {bulkActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => action.onClick(selectedRows)}
                  className="inline-flex min-h-8 items-center rounded-md border border-akiva-border bg-akiva-surface-raised px-2.5 text-xs font-semibold text-akiva-text shadow-sm hover:bg-akiva-surface-muted"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showColumnControls && showColumnsPanel ? (
        <div id={`${tableId}-columns-panel`} className="rounded-lg border border-akiva-border bg-akiva-surface-muted p-3">
          <p className="mb-2 text-xs font-semibold text-akiva-text">Column Visibility</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {columns.map((column) => {
              const locked = Boolean(column.alwaysVisible);
              const checked = locked || visibleColumnIds.includes(column.id);
              return (
                <label key={column.id} className="inline-flex items-center gap-2 text-xs text-akiva-text-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={locked}
                    onChange={(event) => {
                      if (locked) return;
                      const isChecked = event.target.checked;
                      setVisibleColumnIds((previous) => {
                        if (isChecked) return [...new Set([...previous, column.id])];
                        const next = previous.filter((id) => id !== column.id);
                        return next.length === 0 ? previous : next;
                      });
                    }}
                    className="h-4 w-4 rounded border-akiva-border-strong text-akiva-accent-text focus:ring-akiva-accent disabled:opacity-60"
                  />
                  {column.header}{locked ? ' (required)' : ''}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        className="overflow-auto rounded-lg border border-akiva-border bg-akiva-surface-raised shadow-sm"
        style={{ maxHeight: maxTableHeight }}
      >
        <table aria-label={ariaLabel ?? tableId} className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: tableMinWidth }}>
          <thead>
            <tr className="bg-akiva-table-header text-left text-xs uppercase tracking-wide text-akiva-text-muted">
              {selectableRows ? (
                <th className={`sticky left-0 top-0 z-40 w-[52px] border-b border-r border-akiva-border bg-akiva-table-header text-center ${densityClasses.selection}`}>
                  <input
                    type="checkbox"
                    checked={allPageRowsSelected}
                    aria-checked={somePageRowsSelected && !allPageRowsSelected ? 'mixed' : allPageRowsSelected}
                    aria-label="Select all rows on this page"
                    onChange={togglePageSelection}
                    className="h-4 w-4 rounded border-akiva-border-strong text-akiva-accent-text focus:ring-akiva-accent"
                  />
                </th>
              ) : null}
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
                    className={`sticky top-0 z-30 border-b border-akiva-border bg-akiva-table-header align-top font-semibold text-akiva-table-header-text ${headerCellClass} ${alignClass(column.align)} ${stickyHeaderClass(column)}`}
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
                        className={`inline-flex min-h-6 items-center gap-1.5 rounded-md transition hover:text-akiva-text focus:outline-none focus:ring-2 focus:ring-akiva-accent ${
                          column.align === 'right' ? 'justify-end text-right' : column.align === 'center' ? 'justify-center text-center' : 'text-left'
                        }`}
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
            <tr className="bg-akiva-surface-raised">
              {selectableRows ? (
                <th
                  className={`sticky left-0 z-30 w-[52px] border-b border-r border-akiva-border bg-akiva-surface-raised ${densityClasses.selection}`}
                  style={filterTopStyle}
                />
              ) : null}
              {visibleColumns.map((column) => (
                <th
                  key={`${column.id}-filter`}
                  className={`sticky z-20 border-b border-akiva-border bg-akiva-surface-raised ${filterCellClass} ${alignClass(column.align)} ${stickyFilterClass(column)}`}
                  style={filterTopStyle}
                >
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
                      aria-label={`Filter ${column.header}`}
                      className={`${densityClasses.filterInput} w-full rounded-md border border-akiva-border bg-akiva-surface px-2 text-xs font-medium text-akiva-text placeholder:text-akiva-text-muted focus:border-akiva-accent focus:outline-none focus:ring-2 focus:ring-akiva-accent`}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleColumnCount} className="px-3 py-8 text-center text-sm text-akiva-text-muted">
                  {loadingMessage}
                </td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="px-3 py-8 text-center text-sm text-akiva-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedRows.map((row, index) => (
                <tr
                  key={rowKeyFor(row, index)}
                  tabIndex={0}
                  aria-label={rowAriaLabel ? rowAriaLabel(row, index) : undefined}
                  className="group border-t border-akiva-border odd:bg-akiva-surface-raised even:bg-akiva-table-stripe hover:bg-akiva-table-row-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-akiva-accent"
                >
                  {selectableRows ? (
                    <td className={`sticky left-0 z-20 border-r border-akiva-border bg-inherit text-center group-hover:bg-akiva-table-row-hover ${densityClasses.selection}`}>
                      <input
                        type="checkbox"
                        checked={selectedKeySet.has(rowKeyFor(row, index))}
                        aria-label={`Select row ${rangeStart + index}`}
                        onChange={() => toggleRowSelection(rowKeyFor(row, index))}
                        className="h-4 w-4 rounded border-akiva-border-strong text-akiva-accent-text focus:ring-akiva-accent"
                      />
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => {
                    const value = column.accessor(row);
                    return (
                      <td key={column.id} className={`${bodyCellClass} ${densityClasses.bodyText} text-akiva-text ${alignClass(column.align)} ${stickyCellClass(column)}`}>
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
            aria-label="Go to previous page"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-akiva-text shadow-sm hover:bg-akiva-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
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
            aria-label="Go to next page"
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-akiva-border bg-akiva-surface-raised px-2.5 py-1 text-akiva-text shadow-sm hover:bg-akiva-surface-muted disabled:cursor-not-allowed disabled:opacity-70"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
