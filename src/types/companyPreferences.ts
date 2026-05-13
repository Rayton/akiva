export interface CompanyPreferencesForm {
  coyName: string;
  companyNumber: string;
  gstNo: string;
  regOffice1: string;
  regOffice2: string;
  regOffice3: string;
  regOffice4: string;
  regOffice5: string;
  regOffice6: string;
  telephone: string;
  fax: string;
  email: string;
  location1: string;
  location2: string;
  office1: string;
  office2: string;
  fax2: string;
  telephone2: string;
  website: string;
  currencyDefault: string;
  debtorsAct: string;
  creditorsAct: string;
  payrollAct: string;
  grnAct: string;
  retainedEarnings: string;
  freightAct: string;
  exchangeDiffAct: string;
  purchasesExchangeDiffAct: string;
  pytDiscountAct: string;
  glLinkDebtors: boolean;
  glLinkCreditors: boolean;
  glLinkStock: boolean;
}

export interface CompanyCurrencyOption {
  code: string;
  name: string;
}

export interface CompanyAccountOption {
  code: string;
  name: string;
  label: string;
}

export interface CompanyPreferencesPayload {
  preferences: CompanyPreferencesForm;
  currencies: CompanyCurrencyOption[];
  balanceSheetAccounts: CompanyAccountOption[];
  profitLossAccounts: CompanyAccountOption[];
}
