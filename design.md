# Akiva ERP Design Guide

This guide documents the dashboard design language so every migrated page feels like the same product. Use it when creating or refactoring pages in `src/pages`.

## Design Goal

Akiva is an operational ERP, so pages should feel calm, dense, and easy to scan. The dashboard is the reference screen: warm neutral background, soft raised surfaces, compact controls, icon-first actions, tabular numbers, and clear module status.

Do not build marketing-style pages, oversized empty hero sections, or decorative layouts. Every screen should support repeated daily work.

## Source Of Truth

- Dashboard reference: `src/pages/Dashboard.tsx`
- Global theme tokens: `src/index.css`
- Tailwind token aliases: `tailwind.config.js`
- Shared primitives: `src/components/common`
- Layout shell: `src/components/layout`

Prefer token classes such as `bg-akiva-bg`, `bg-akiva-surface-raised`, `border-akiva-border`, `text-akiva-text`, and `text-akiva-text-muted` when building new shared components. Use explicit dashboard classes only when matching an existing dashboard pattern exactly.

## Page Shell

Every full page should use the same outer rhythm as the dashboard.

```tsx
<div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
  <div className="mx-auto max-w-[1520px]">
    <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
      {/* page header */}
      {/* page content */}
    </section>
  </div>
</div>
```

Use `max-w-[1520px]` for broad operational pages. Narrow forms may use a smaller max width inside the same shell, but the background and spacing should remain consistent.

## Header Pattern

Page headers sit inside the main rounded frame and use a bottom divider.

- Header padding: `px-4 py-4 sm:px-6 lg:px-8`
- Layout: stacked on mobile, horizontal on large screens
- Eyebrow chips: compact rounded pills with icon plus label
- Title: `text-3xl font-semibold tracking-normal sm:text-4xl lg:text-5xl`
- Supporting text: `text-sm text-akiva-text-muted`
- Header actions: icon buttons first; text buttons only for clear creation or submission commands

Recommended action button:

```tsx
<button
  type="button"
  aria-label="Filter results"
  title="Filter results"
  className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm transition hover:bg-akiva-surface-muted hover:text-akiva-text"
>
  <SlidersHorizontal className="h-4 w-4" />
</button>
```

Use Lucide icons for page actions unless a module already uses Phosphor icons through the sidebar.

## Layout Grid

Use dashboard-style grids:

- Main content: `grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7`
- Primary column: `space-y-4 lg:col-span-8`
- Sidebar column: `space-y-4 lg:col-span-4`
- KPI grids: `grid gap-3 sm:grid-cols-2 xl:grid-cols-4`
- Two-up content: `grid gap-4 lg:grid-cols-2`

Keep screens compact. Prefer stacked sections and useful side panels over large empty margins.

## Surfaces

Use surfaces consistently:

- Page background: `bg-akiva-bg`
- Main framed page surface: translucent white/dark warm surface, `rounded-[28px]`
- Repeated cards: `rounded-lg border border-akiva-border bg-akiva-surface-raised shadow-sm`
- Larger analytical panels: `rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm`
- Tables and controls: `rounded-lg`

Avoid cards inside cards. If a section needs grouping inside a card, use a subtle row, panel, or divider instead.

## Color

Use the Akiva tokens before raw Tailwind colors:

- Background: `akiva-bg`
- Surface: `akiva-surface`, `akiva-surface-muted`, `akiva-surface-raised`
- Border: `akiva-border`, `akiva-border-strong`
- Text: `akiva-text`, `akiva-text-muted`
- Brand/accent: `akiva-accent`, `akiva-accent-strong`, `akiva-accent-soft`, `akiva-accent-text`
- Tables: `akiva-table-header`, `akiva-table-row-hover`

Semantic colors are allowed for status:

- Success: emerald
- Warning: amber
- Danger/overdue: rose or red
- Neutral: slate through existing dark-mode overrides

Do not introduce blue as a primary action or focus color. The brand accent is rose/pink.

## Typography

- Font: IBM Plex Sans via Tailwind `font-sans`
- Numbers: tabular nums are globally enabled; keep money, counts, and percentages aligned
- Page title: semibold, not bold-heavy
- Card labels: `text-xs font-semibold uppercase tracking-wide text-akiva-text-muted`
- Card values: `text-2xl font-semibold`
- Section titles: `text-sm font-semibold`
- Body/detail text: `text-sm text-akiva-text-muted`

Do not use viewport-based font sizing. Keep letter spacing normal except uppercase labels.

## Buttons And Controls

Use `src/components/common/Button.tsx` for standard text actions. Keep primary actions rose through `akiva-accent`.

Use icon-only circular buttons for common tools:

- Filter: `SlidersHorizontal` or `Filter`
- Export/download: `Download`
- Search: `Search`
- Refresh: `RefreshCw`
- Add/create: `Plus`
- Edit/delete: `Pencil`, `Trash2`

Controls should be familiar:

- Search inputs include a leading `Search` icon
- Option sets use `SearchableSelect`
- Dates use `DatePicker`
- Booleans use toggles or checkboxes
- Tables use `AdvancedTable` when filtering, pagination, column visibility, or export is needed

## Cards And KPIs

Metric cards should include:

- Uppercase label
- Large value
- Muted detail
- Optional status/change pill with icon
- Icon in a circular token area

Use this structure:

```tsx
<article className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
  <div className="flex items-start justify-between gap-3">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-akiva-text-muted">Net sales</p>
      <p className="mt-2 text-2xl font-semibold text-akiva-text">$528,976</p>
    </div>
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-akiva-surface-muted text-akiva-text">
      <ReceiptText className="h-5 w-5" />
    </span>
  </div>
  <div className="mt-4 flex items-center justify-between gap-3 text-sm">
    <span className="text-akiva-text-muted">276 posted invoices</span>
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
      <ArrowUpRight className="h-3 w-3" />
      +7.9%
    </span>
  </div>
</article>
```

## Tables

Prefer `AdvancedTable` for live operational data. It already provides filtering, pagination, column visibility, resizing, Excel export, and PDF export.

Table conventions:

- Header: uppercase, `text-xs`, muted
- Row text: `text-sm`
- Borders: `border-akiva-border`
- Hover: `hover:bg-akiva-table-row-hover`
- Numeric cells: right aligned when values are comparable
- Important IDs/codes: monospace
- Empty/loading states: centered muted text

For simpler static tables, use `Table`, but align it to Akiva tokens rather than gray/blue classes.

## Charts

Use Recharts for dashboard-style data visualization.

Chart colors should come from CSS variables:

- Grid: `var(--akiva-chart-grid)`
- Muted series: `var(--akiva-chart-muted)` or `var(--akiva-chart-ink)`
- Brand series: `var(--akiva-chart-brand)`
- Tooltip background/border/text: `--akiva-chart-tooltip-*`

Keep charts compact and framed by a useful analytical panel. Avoid decorative charts without an operational decision attached.

## Forms And Drawers

- Forms belong in cards, modals, or drawers depending on workflow length
- Keep labels concise and close to fields
- Use `min-h-11` controls for touch targets
- Mobile inputs should remain at least 16px text to avoid browser zoom
- Primary submit action belongs at the end of the form or in a sticky drawer footer
- Validation and error text should use rose/red tones and plain language

## Responsive Rules

- Mobile first: all content must work in a single column
- Use `sm`, `md`, `lg`, and `xl` breakpoints already present in the dashboard
- Keep icon buttons at stable `h-10 w-10`
- Fixed-format UI, tables, and metric grids need stable dimensions so content does not shift
- Tables must use horizontal overflow when columns cannot reasonably fit
- Text must truncate where labels are variable, especially in table rows and module lists

## Dark Mode

Dark mode is class based through `html.dark`. Do not hard-code black/blue dark themes. Use Akiva tokens or existing slate classes that are remapped in `src/index.css`.

Always check new surfaces in both modes:

- Borders remain visible
- Muted text remains readable
- Accent pills do not glow too strongly
- Shadows do not dominate warm dark surfaces

## Accessibility

- Icon-only buttons need `aria-label` and `title`
- Inputs need labels or clear accessible names
- Use semantic headings in order
- Do not communicate status by color alone; include labels, icons, or numbers
- Preserve visible focus using the global focus ring
- Buttons must be real `<button>` elements unless navigating

## Migration Checklist

Use this checklist when updating a page:

- Page uses the Akiva shell and max width
- Header matches dashboard spacing and action placement
- Raw `gray-*` and `blue-*` classes are replaced with Akiva tokens where practical
- Cards use `rounded-lg` unless they are large analytical panels
- Tables use `AdvancedTable` for operational datasets
- Actions use Lucide icons and accessible labels
- Mobile layout is one column and has no overlapping text
- Dark mode uses tokens and remains readable
- Empty, loading, and error states are present for live data

## Minimal Page Skeleton

```tsx
import { Download, Plus, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '../components/common/Button';

export function ModulePage() {
  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                  Module
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-surface-raised px-3 py-1 text-xs font-semibold text-akiva-text-muted shadow-sm">
                  Current period
                </span>
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-normal text-akiva-text sm:text-4xl lg:text-5xl">
                Page title
              </h1>
              <p className="mt-2 text-sm text-akiva-text-muted">Short operational context for this page.</p>
            </div>

            <div className="flex items-center gap-2 self-start lg:self-center">
              <button type="button" aria-label="Refresh" title="Refresh" className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm hover:bg-akiva-surface-muted hover:text-akiva-text">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Filter" title="Filter" className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm hover:bg-akiva-surface-muted hover:text-akiva-text">
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Export" title="Export" className="flex h-10 w-10 items-center justify-center rounded-full border border-akiva-border bg-akiva-surface-raised text-akiva-text-muted shadow-sm hover:bg-akiva-surface-muted hover:text-akiva-text">
                <Download className="h-4 w-4" />
              </button>
              <Button className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-7">
            <div className="space-y-4 lg:col-span-8">
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm sm:p-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-akiva-text-muted" />
                  <input
                    type="search"
                    placeholder="Search records"
                    className="h-11 w-full rounded-full border border-akiva-border bg-akiva-surface pl-10 pr-4 text-sm text-akiva-text placeholder:text-akiva-text-muted focus:border-akiva-accent focus:ring-2 focus:ring-akiva-accent"
                  />
                </div>
              </section>
            </div>

            <aside className="space-y-4 lg:col-span-4">
              <section className="rounded-2xl border border-akiva-border bg-akiva-surface-raised/80 p-4 shadow-sm">
                <p className="text-sm font-semibold text-akiva-text">Side panel</p>
                <p className="mt-1 text-sm text-akiva-text-muted">Use this area for queues, summaries, filters, or status.</p>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
```
