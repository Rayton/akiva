import { hrefToSlug } from '../data/menuApi';
import type { MenuCategory, MenuItem } from '../types/menu';

type MenuNode = MenuCategory | MenuItem;
type MenuNodeWithAccess = MenuNode & {
  allowed?: boolean;
  children?: MenuNodeWithAccess[];
};

export const CUSTOMER_WORKSPACE_PATH = '/receivables/customers';

export interface CustomerWorkspaceAccess {
  hasCustomerMenu: boolean;
  canOpenOverview: boolean;
  overviewPageId: string;
  allowedActionIds: Set<string>;
  actionPageIds: Map<string, string>;
}

function fallbackSlug(caption: string): string {
  return caption.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function menuSlug(node: MenuNode): string {
  return hrefToSlug(node.href ?? '') || fallbackSlug(node.caption ?? '');
}

function menuPageId(node: MenuNode): string {
  return `menu-${node.id}-${menuSlug(node)}`;
}

export function getCustomerWorkspaceAccess(appMenu: MenuCategory[]): CustomerWorkspaceAccess {
  let hasCustomerMenu = false;
  let canOpenOverview = false;
  let overviewPageId = '';
  const allowedActionIds = new Set<string>();
  const actionPageIds = new Map<string, string>();
  const customerPathSegments = CUSTOMER_WORKSPACE_PATH.split('/').filter(Boolean);

  const visitNode = (node: MenuNodeWithAccess, parentSegments: string[]) => {
    const slug = menuSlug(node);
    const segments = slug ? [...parentSegments, slug] : parentSegments;
    const path = '/' + segments.join('/');
    const isDirectlyAllowed = typeof node.allowed === 'boolean' ? node.allowed : true;

    if (path === CUSTOMER_WORKSPACE_PATH) {
      hasCustomerMenu = true;
      canOpenOverview = canOpenOverview || isDirectlyAllowed;
      if (isDirectlyAllowed) {
        overviewPageId = menuPageId(node);
      }
    } else if (path.startsWith(`${CUSTOMER_WORKSPACE_PATH}/`)) {
      const relativeSegments = segments.slice(customerPathSegments.length);
      if (relativeSegments.length === 1 && isDirectlyAllowed) {
        const actionId = relativeSegments[0];
        allowedActionIds.add(actionId);
        actionPageIds.set(actionId, menuPageId(node));
      }
    }

    node.children?.forEach((child) => visitNode(child, segments));
  };

  appMenu.forEach((root) => visitNode(root, []));

  return {
    hasCustomerMenu,
    canOpenOverview,
    overviewPageId,
    allowedActionIds,
    actionPageIds,
  };
}

export function canOpenCustomerWorkspace(appMenu: MenuCategory[]): boolean {
  return getCustomerWorkspaceAccess(appMenu).hasCustomerMenu;
}
