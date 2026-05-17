export interface SalesCategoryLookupOption {
  code: string;
  name: string;
}

export interface SalesCategory {
  id: number;
  name: string;
  parentId: number | null;
  parentName: string;
  active: boolean;
  productCount: number;
  childCount: number;
  path: string;
}

export interface SalesCategoriesPayload {
  categories: SalesCategory[];
  lookups: {
    parents: SalesCategoryLookupOption[];
  };
  stats: {
    total: number;
    active: number;
    inactive: number;
    productLinks: number;
  };
  selectedId?: number;
}

export interface SalesCategoryForm {
  name: string;
  parentId: string;
  active: boolean;
}
