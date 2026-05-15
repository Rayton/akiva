export type InventorySetupTab = 'stock-categories' | 'locations' | 'discount-categories' | 'units-of-measure';

export interface InventoryLookupOption {
  code: string;
  name: string;
}

export interface StockCategory {
  code: string;
  name: string;
  stockType: string;
  stockAct: string;
  adjustmentAct: string;
  issueAct: string;
  purchasePriceVarianceAct: string;
  materialUsageVarianceAct: string;
  wipAct: string;
  defaultTaxCategoryId: number;
}

export interface InventoryLocation {
  code: string;
  name: string;
  address1: string;
  address2: string;
  address3: string;
  address4: string;
  address5: string;
  address6: string;
  telephone: string;
  fax: string;
  email: string;
  contact: string;
  taxProvinceId: number;
  managed: boolean;
  internalRequest: boolean;
  usedForWorkOrders: boolean;
  glAccountCode: string;
  allowInvoicing: boolean;
}

export interface DiscountCategory {
  code: string;
  name: string;
  stockItemCount: number;
  discountMatrixCount: number;
}

export interface UnitOfMeasure {
  id: number;
  name: string;
}

export interface InventorySetupPayload {
  stockCategories: StockCategory[];
  locations: InventoryLocation[];
  discountCategories: DiscountCategory[];
  unitsOfMeasure: UnitOfMeasure[];
  lookups: {
    accounts: InventoryLookupOption[];
    taxCategories: InventoryLookupOption[];
    taxProvinces: InventoryLookupOption[];
  };
  stats: {
    stockCategories: number;
    locations: number;
    discountCategories: number;
    unitsOfMeasure: number;
    stockItems: number;
  };
}

export interface InventorySetupForm {
  code?: string;
  name: string;
  stockType?: string;
  stockAct?: string;
  adjustmentAct?: string;
  issueAct?: string;
  purchasePriceVarianceAct?: string;
  materialUsageVarianceAct?: string;
  wipAct?: string;
  defaultTaxCategoryId?: number;
  address1?: string;
  address2?: string;
  address3?: string;
  address4?: string;
  address5?: string;
  address6?: string;
  telephone?: string;
  fax?: string;
  email?: string;
  contact?: string;
  taxProvinceId?: number;
  managed?: boolean;
  internalRequest?: boolean;
  usedForWorkOrders?: boolean;
  glAccountCode?: string;
  allowInvoicing?: boolean;
}
