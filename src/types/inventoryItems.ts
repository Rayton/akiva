export interface InventoryItemLookupOption {
  code: string;
  name: string;
}

export interface InventoryItem {
  stockId: string;
  categoryId: string;
  categoryName: string;
  description: string;
  longDescription: string;
  units: string;
  mbFlag: string;
  mbFlagLabel: string;
  actualCost: number;
  lastCost: number;
  materialCost: number;
  labourCost: number;
  overheadCost: number;
  discontinued: boolean;
  controlled: boolean;
  eoq: number;
  volume: number;
  grossWeight: number;
  kgs: number;
  barcode: string;
  discountCategory: string;
  discountCategoryName: string;
  taxCatId: number;
  taxCategoryName: string;
  serialised: boolean;
  perishable: boolean;
  decimalPlaces: number;
  netWeight: number;
  onHand: number;
  locationCount: number;
  priceCount: number;
  supplierCount: number;
}

export interface InventoryItemsPayload {
  items: InventoryItem[];
  lookups: {
    categories: InventoryItemLookupOption[];
    units: InventoryItemLookupOption[];
    taxCategories: InventoryItemLookupOption[];
    discountCategories: InventoryItemLookupOption[];
    itemTypes: InventoryItemLookupOption[];
  };
  stats: {
    totalItems: number;
    activeItems: number;
    discontinuedItems: number;
    controlledItems: number;
    serialisedItems: number;
    categories: number;
  };
  selectedId?: string;
}

export interface InventoryItemForm {
  stockId: string;
  description: string;
  longDescription: string;
  categoryId: string;
  units: string;
  mbFlag: string;
  taxCatId: number;
  discountCategory: string;
  controlled: boolean;
  serialised: boolean;
  perishable: boolean;
  discontinued: boolean;
  decimalPlaces: number;
  eoq: number;
  volume: number;
  grossWeight: number;
  kgs: number;
  netWeight: number;
  barcode: string;
}

export interface InventoryCategoryForm {
  code: string;
  name: string;
  stockType: string;
  defaultTaxCategoryId: number;
}

export interface InventoryItemTypeForm {
  code: string;
  name: string;
}
