export type MarkupCostBasis = 'standard-cost' | 'preferred-supplier' | 'other-price-list';

export interface MarkupPriceLookupOption {
  code: string;
  name: string;
  rate?: number;
}

export interface MarkupPriceForm {
  priceList: string;
  currency: string;
  costBasis: MarkupCostBasis;
  basePriceList: string;
  categoryFrom: string;
  categoryTo: string;
  roundingFactor: number;
  markupPercent: number;
  startDate: string;
  endDate: string;
}

export interface MarkupPriceWorkbenchPayload {
  lookups: {
    priceLists: MarkupPriceLookupOption[];
    currencies: MarkupPriceLookupOption[];
    categories: MarkupPriceLookupOption[];
    costBasisOptions: MarkupPriceLookupOption[];
  };
  defaults: MarkupPriceForm;
  stats: {
    totalItems: number;
    priceRows: number;
    pricedItems: number;
    priceLists: number;
    currencies: number;
    categories: number;
  };
}

export interface MarkupPriceRow {
  stockId: string;
  description: string;
  categoryId: string;
  categoryName: string;
  units: string;
  decimalPlaces: number;
  basisCost: number | null;
  currentPrice: number | null;
  currentStartDate: string | null;
  currentEndDate: string | null;
  newPrice: number | null;
  currency: string;
  status: 'ready' | 'skipped';
  action: 'insert' | 'replace' | 'update' | 'skipped';
  reason: string;
}

export interface MarkupPriceSummary {
  candidateCount: number;
  readyCount: number;
  skippedCount: number;
  insertCount: number;
  replaceCount: number;
  updateCount: number;
  currentRowsClosed: number;
  insertedCount: number;
  updatedPriceCount: number;
}

export interface MarkupPriceRunPayload {
  form: MarkupPriceForm;
  rows: MarkupPriceRow[];
  summary: MarkupPriceSummary;
}
