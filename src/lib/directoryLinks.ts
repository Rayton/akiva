export interface DirectoryLink {
  id: 'customers' | 'items' | 'suppliers';
  label: string;
  path: string;
  pageId: string;
}

export const DIRECTORY_LINKS: DirectoryLink[] = [
  {
    id: 'customers',
    label: 'Customers',
    path: '/receivables/customers',
    pageId: 'receivables',
  },
  {
    id: 'items',
    label: 'Items',
    path: '/inventory/items',
    pageId: 'inventory-items',
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    path: '/payables/suppliers',
    pageId: 'supplier-maintenance',
  },
];
