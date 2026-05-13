export interface MenuAccessMenuItem {
  id: number;
  caption: string;
  parent: number;
  href: string;
  path: string;
  children: MenuAccessMenuItem[];
}

export interface MenuAccessUser {
  userId: string;
  realName: string;
  email: string;
  blocked: boolean;
  allowedMenuIds: number[];
  allowedCount: number;
}

export interface MenuAccessStats {
  totalUsers: number;
  usersWithAccess: number;
  usersWithoutAccess: number;
  blockedUsers: number;
  menuItems: number;
  assignedLinks: number;
}

export interface MenuAccessPayload {
  users: MenuAccessUser[];
  menu: MenuAccessMenuItem[];
  stats: MenuAccessStats;
}

export interface MenuAccessSaveForm {
  allowedMenuIds: number[];
}
