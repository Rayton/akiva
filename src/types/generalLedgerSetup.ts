export type GeneralLedgerSetupTab =
  | 'bank-accounts'
  | 'currencies'
  | 'tax-authorities'
  | 'tax-groups'
  | 'tax-provinces'
  | 'tax-categories'
  | 'periods';

export interface SetupLookupOption {
  code: string;
  name: string;
}

export interface SetupBankAccount {
  accountCode: string;
  accountName: string;
  currencyCode: string;
  currencyName: string;
  invoiceMode: number;
  bankAccountCode: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankAddress: string;
  importFormat: string;
}

export interface SetupCurrency {
  code: string;
  name: string;
  country: string;
  hundredsName: string;
  decimalPlaces: number;
  rate: number;
  webcart: boolean;
}

export interface SetupTaxAuthority {
  taxId: number;
  description: string;
  salesTaxAccountCode: string;
  salesTaxAccountName: string;
  purchaseTaxAccountCode: string;
  purchaseTaxAccountName: string;
  bank: string;
  bankAccountType: string;
  bankAccount: string;
  bankSwift: string;
}

export interface SetupTaxGroup {
  taxGroupId: number;
  description: string;
}

export interface SetupTaxProvince {
  taxProvinceId: number;
  name: string;
}

export interface SetupTaxCategory {
  taxCategoryId: number;
  name: string;
}

export interface SetupPeriod {
  periodNo: number;
  lastDateInPeriod: string;
}

export interface GeneralLedgerSetupPayload {
  bankAccounts: SetupBankAccount[];
  currencies: SetupCurrency[];
  taxAuthorities: SetupTaxAuthority[];
  taxGroups: SetupTaxGroup[];
  taxProvinces: SetupTaxProvince[];
  taxCategories: SetupTaxCategory[];
  periods: SetupPeriod[];
  lookups: {
    accounts: SetupLookupOption[];
    currencies: SetupLookupOption[];
  };
  stats: {
    bankAccounts: number;
    currencies: number;
    taxAuthorities: number;
    taxGroups: number;
    taxProvinces: number;
    taxCategories: number;
    periods: number;
  };
}

export type GeneralLedgerSetupForm = Record<string, string | number | boolean>;
