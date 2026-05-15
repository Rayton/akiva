import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileSignature,
  Landmark,
  Layers3,
  Mail,
  MapPinned,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { hrefToSlug } from '../data/menuApi';
import type { MenuCategory, MenuItem } from '../types/menu';

type MenuNode = MenuCategory | MenuItem;

interface ConfigurationDashboardProps {
  module?: MenuCategory | null;
  onSelectPage: (pageId: string) => void;
}

interface ConfigurationSection {
  id: number;
  title: string;
  icon: LucideIcon;
  description: string;
  items: MenuNode[];
  leafCount: number;
}

const SECTION_DESCRIPTIONS: Array<{ match: string[]; description: string; icon: LucideIcon }> = [
  {
    match: ['generalsettings', 'companypreferences', 'systemparameters'],
    description: 'Company identity, operating preferences, system checks, labels, templates, maps, and mail settings.',
    icon: Building2,
  },
  {
    match: ['users', 'wwwusers', 'accesspermissions', 'menurights'],
    description: 'User accounts, role permissions, and menu access controls for the team.',
    icon: Users,
  },
  {
    match: ['generalledgersetup', 'bankaccounts', 'currencies', 'tax'],
    description: 'Bank accounts, currencies, tax authorities, tax groups, tax provinces, categories, and accounting periods.',
    icon: Landmark,
  },
  {
    match: ['salesreceivablessetup', 'salestypes', 'customertypes', 'creditstatus', 'holdreasons', 'paymentterms', 'paymentmethods', 'salespeople', 'areas', 'salesareas', 'salesglpostings', 'salesglposting', 'cogsglpostings', 'cogsglposting', 'discountmatrix'],
    description: 'Price lists, customer setup, credit statuses, payment terms, payment methods, sales people, areas, and sales GL interfaces.',
    icon: Tags,
  },
];

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function fallbackSlug(caption: string): string {
  return caption.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

function menuPageId(node: MenuNode): string {
  const slug = hrefToSlug(node.href ?? '') || fallbackSlug(node.caption);
  return `menu-${node.id}-${slug}`;
}

function flattenLeaves(node: MenuNode): MenuNode[] {
  if (!node.children || node.children.length === 0) return [node];
  return node.children.flatMap((child) => flattenLeaves(child));
}

function iconForCaption(caption: string): LucideIcon {
  const key = normalizedKey(caption);
  if (key.includes('company') || key.includes('generalsettings')) return Building2;
  if (key.includes('user') || key.includes('access') || key.includes('permission')) return Users;
  if (key.includes('sales') || key.includes('customer') || key.includes('payment')) return Tags;
  if (key.includes('ledger') || key.includes('bank') || key.includes('currenc') || key.includes('tax')) return Landmark;
  if (key.includes('audit') || key.includes('check')) return Activity;
  if (key.includes('geocode') || key.includes('map')) return MapPinned;
  if (key.includes('form') || key.includes('layout') || key.includes('template')) return FileSignature;
  if (key.includes('label')) return Tags;
  if (key.includes('smtp') || key.includes('mail')) return Mail;
  if (key.includes('security') || key.includes('role')) return ShieldCheck;
  return Wrench;
}

function descriptionForCaption(caption: string): { description: string; icon: LucideIcon } {
  const key = normalizedKey(caption);
  const match = SECTION_DESCRIPTIONS.find((section) => section.match.some((candidate) => key.includes(candidate)));
  return match ?? { description: 'Operational configuration records and maintenance tools.', icon: iconForCaption(caption) };
}

function configurationSections(module?: MenuCategory | null): ConfigurationSection[] {
  return (module?.children ?? []).map((node) => {
    const details = descriptionForCaption(node.caption);
    const leaves = flattenLeaves(node);

    return {
      id: node.id,
      title: node.caption,
      icon: details.icon,
      description: details.description,
      items: leaves,
      leafCount: leaves.length,
    };
  });
}

function quickStats(sections: ConfigurationSection[]) {
  const leaves = sections.flatMap((section) => section.items);
  return [
    { label: 'Setup Areas', value: String(sections.length), icon: Layers3 },
    { label: 'Maintenance Pages', value: String(leaves.length), icon: Wrench },
    { label: 'Access Tools', value: String(leaves.filter((item) => /user|access|permission|rights/i.test(item.caption)).length), icon: ShieldCheck },
    { label: 'System Checks', value: String(leaves.filter((item) => /check|audit|smtp|geocode/i.test(item.caption)).length), icon: CheckCircle2 },
  ];
}

export function ConfigurationDashboard({ module, onSelectPage }: ConfigurationDashboardProps) {
  const sections = configurationSections(module);
  const stats = quickStats(sections);
  const allItems = sections.flatMap((section) => section.items);
  const featuredItems = allItems.slice(0, 8);

  return (
    <div className="min-h-full bg-akiva-bg px-3 py-3 text-akiva-text sm:px-4 sm:py-4 lg:px-5 lg:py-5">
      <div className="mx-auto max-w-[1520px]">
        <section className="overflow-hidden rounded-[28px] border border-white/80 bg-white/72 shadow-xl shadow-slate-300/40 backdrop-blur dark:border-slate-800 dark:bg-slate-900/72 dark:shadow-black/30">
          <div className="flex flex-col gap-4 border-b border-akiva-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-akiva-text px-3 py-1 text-xs font-semibold text-akiva-surface-raised">
                <Settings2 className="h-3.5 w-3.5" />
                Configuration
              </span>
              <h1 className="mt-4 text-2xl font-semibold tracking-normal text-slate-300 dark:text-slate-600 sm:text-3xl lg:text-4xl">
                Configuration Dashboard
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-akiva-text-muted">
                A single control surface for company setup, user permissions, general ledger setup, and system maintenance.
              </p>
            </div>

            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 lg:max-w-[420px]">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <article key={stat.label} className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-akiva-text-muted">{stat.label}</p>
                      <Icon className="h-4 w-4 text-akiva-accent" />
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-akiva-text">{stat.value}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-7 min-[1800px]:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <article key={section.id} className="rounded-lg border border-white/70 bg-white/82 p-4 shadow-sm shadow-slate-200/60 dark:border-slate-700/80 dark:bg-slate-900/70 dark:shadow-black/20">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold leading-snug text-akiva-text">{section.title}</p>
                        <p className="mt-1 text-xs leading-5 text-akiva-text-muted">{section.description}</p>
                      </div>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-akiva-surface-muted text-akiva-accent">
                        <Icon className="h-5 w-5" />
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {section.items.slice(0, 5).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectPage(menuPageId(item))}
                          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-akiva-border bg-akiva-surface-raised px-3 py-2 text-left text-sm text-akiva-text transition hover:border-akiva-accent hover:bg-akiva-accent-soft"
                        >
                          <span className="min-w-0 leading-snug">{item.caption}</span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-akiva-text-muted" />
                        </button>
                      ))}
                    </div>

                    {section.leafCount > 5 ? (
                      <p className="mt-3 text-xs text-akiva-text-muted">{section.leafCount - 5} more pages in this area</p>
                    ) : null}
                  </article>
                );
              })}
            </div>

            <aside className="rounded-lg border border-akiva-border bg-akiva-surface-raised p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-akiva-text">Quick Access</h2>
                  <p className="mt-1 text-xs text-akiva-text-muted">Frequently used configuration pages</p>
                </div>
                <Settings2 className="h-5 w-5 text-akiva-accent" />
              </div>

              <div className="mt-4 space-y-2">
                {featuredItems.map((item) => {
                  const Icon = iconForCaption(item.caption);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectPage(menuPageId(item))}
                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-akiva-surface-muted"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-akiva-accent-soft text-akiva-accent-text">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-akiva-text">{item.caption}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-akiva-text-muted" />
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
