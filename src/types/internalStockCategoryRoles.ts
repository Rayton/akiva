export interface InternalStockCategoryRole {
  roleId: number;
  name: string;
  canViewPrices: boolean;
  missingRoleRecord: boolean;
}

export interface InternalStockCategory {
  categoryId: string;
  description: string;
  stockType: string;
  missingCategoryRecord: boolean;
}

export interface InternalStockCategoryRoleAssignment {
  roleId: number;
  roleName: string;
  roleMissingRecord: boolean;
  categoryId: string;
  categoryDescription: string;
  stockType: string;
  categoryMissingRecord: boolean;
}

export interface InternalStockCategoryRoleForm {
  roleId: number;
  categoryId: string;
}

export interface InternalStockCategoryRolesPayload {
  roles: InternalStockCategoryRole[];
  categories: InternalStockCategory[];
  assignments: InternalStockCategoryRoleAssignment[];
  defaults: InternalStockCategoryRoleForm;
  stats: {
    roles: number;
    categories: number;
    assignments: number;
    rolesWithCategories: number;
    categoriesAssigned: number;
  };
}
