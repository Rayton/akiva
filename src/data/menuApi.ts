import { MenuItem, MenuCategory, MenuResponse } from '../types/menu';
import { apiFetch } from '../lib/network/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8877';

/**
 * Fetch all menu items (hierarchical). Returns empty array on failure so UI can load.
 */
export async function fetchMenu(): Promise<MenuCategory[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/menu`);
    const data: MenuResponse = await response.json();

    if (data.success && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch menu:', error);
    return [];
  }
}

/**
 * Fetch top-level menu categories (parent = -1).
 */
export async function fetchMenuCategories(): Promise<MenuCategory[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/menu/categories`);
    const data = await response.json();

    if (data.success && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch menu categories:', error);
    return [];
  }
}

/**
 * Fetch menu items by parent ID.
 */
export async function fetchMenuByParent(parentId: number): Promise<MenuItem[]> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/menu/parent/${parentId}`);
    const data = await response.json();

    if (data.success && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch menu by parent:', error);
    return [];
  }
}

export function hrefToSlug(href: string): string {
  if (!href || href === '#') return '';
  const normalizedHref = href.replace(/&amp;/gi, '&').trim();
  const withoutQuery = normalizedHref.split('?')[0];
  const filename = withoutQuery.split('/').pop() ?? '';
  const base = filename.replace(/\.php$/i, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateMenuItemId(caption: string, parentId: number): string {
  const slug = caption.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return `${parentId}-${slug}`;
}
