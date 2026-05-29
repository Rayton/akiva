export interface AssetManagerSettings {
  companyName: string;
  currencyCode: string;
  currencyName: string;
  currencyDecimalPlaces: number;
  dateFormat: string;
}

export interface AssetManagerSummary {
  totalAssets: number;
  activeAssets: number;
  disposedAssets: number;
  totalCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  disposalProceeds: number;
  averageDepreciationRate: number;
}

export interface AssetManagerAsset {
  id: string;
  assetId: number;
  description: string;
  longDescription: string;
  serialNo: string;
  barcode: string;
  categoryId: string;
  categoryDescription: string;
  locationId: string;
  locationDescription: string;
  cost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  depreciationRate: number;
  depreciationType: number;
  depreciationTypeLabel: string;
  datePurchased: string | null;
  disposalDate: string | null;
  disposalProceeds: number;
  status: 'Active' | 'Disposed';
}

export interface AssetManagerExposure {
  categoryId?: string;
  categoryDescription?: string;
  locationId?: string;
  locationDescription?: string;
  assetCount: number;
  activeCount: number;
  cost: number;
  accumulatedDepreciation?: number;
  netBookValue: number;
}

export interface AssetManagerTransaction {
  id: number;
  assetId: number;
  assetDescription: string;
  type: number;
  transactionType: string;
  date: string | null;
  inputDate: string | null;
  transactionNo: number;
  periodNo: number;
  amount: number;
}

export interface AssetManagerFilterOption {
  id: string;
  label: string;
}

export interface AssetManagerDashboard {
  settings: AssetManagerSettings;
  asOf: string;
  summary: AssetManagerSummary;
  assets: AssetManagerAsset[];
  categoryExposure: AssetManagerExposure[];
  locationExposure: AssetManagerExposure[];
  recentTransactions: AssetManagerTransaction[];
  filterOptions: {
    categories: AssetManagerFilterOption[];
    locations: AssetManagerFilterOption[];
  };
}
