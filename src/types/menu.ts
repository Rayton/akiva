// App menu types (menus table)

export interface MenuItem {
  id: number;
  caption: string;
  parent: number;
  href: string;
  children?: MenuItem[];
}

export interface MenuCategory {
  id: number;
  caption: string;
  parent: number;
  href: string;
  children?: MenuItem[];
}

export interface MenuResponse {
  success: boolean;
  data: MenuCategory[];
  flat?: MenuItem[];
}

export interface MenuCategoryResponse {
  success: boolean;
  data: MenuCategory[];
}

export interface MenuItemsResponse {
  success: boolean;
  data: MenuItem[];
}
