export interface PettyCashSettings {
  companyName: string;
  currencyCode: string;
  currencyName: string;
  currencyDecimalPlaces: number;
  dateFormat: string;
}

export interface PettyCashSummary {
  tabCount: number;
  totalLimit: number;
  currentBalance: number;
  assignedCash: number;
  transferredCash: number;
  claimedExpenses: number;
  pendingCash: number;
  pendingExpenses: number;
  authorisedMovements: number;
  unpostedMovements: number;
  overLimitTabs: number;
}

export interface PettyCashTab {
  id: string;
  tabCode: string;
  userCode: string;
  typeCode: string;
  typeDescription: string;
  currencyCode: string;
  currencyDecimalPlaces: number;
  tabLimit: number;
  currentBalance: number;
  availableToLimit: number;
  limitUtilisation: number;
  assignedCash: number;
  transferredCash: number;
  claimedExpenses: number;
  pendingCash: number;
  pendingExpenses: number;
  movementCount: number;
  unpostedCount: number;
  assignmentAccount: string;
  assignmentAccountName: string;
  pettyCashAccount: string;
  pettyCashAccountName: string;
  assigner: string;
  cashAuthoriser: string;
  expenseAuthoriser: string;
  defaultTag: number;
  defaultTagDescription: string;
  taxGroupId: number;
  taxGroupDescription: string;
  status: 'Ready' | 'Pending review' | 'Over limit' | 'Needs funding';
}

export interface PettyCashMovement {
  id: number;
  tabCode: string;
  tabUser: string;
  tabType: string;
  currencyCode: string;
  currencyDecimalPlaces: number;
  date: string | null;
  expenseCode: string;
  expenseDescription: string;
  kind: 'cash' | 'expense';
  movementLabel: string;
  direction: 'In' | 'Out';
  amount: number;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
  status: 'Authorised' | 'Pending';
  authorisedDate: string | null;
  posted: boolean;
  purpose: string;
  notes: string;
  tag: number;
  tagDescription: string;
  expenseGlAccount: string;
  hasReceipt: boolean;
  receiptType: string;
}

export interface PettyCashTabExposure {
  tabCode: string;
  userCode: string;
  currencyCode: string;
  currencyDecimalPlaces: number;
  tabLimit: number;
  currentBalance: number;
  claimedExpenses: number;
  pendingValue: number;
  status: PettyCashTab['status'];
}

export interface PettyCashExpenseExposure {
  expenseCode: string;
  expenseDescription: string;
  movementCount: number;
  grossAmount: number;
  taxAmount: number;
  pendingCount: number;
}

export interface PettyCashMonthlyFlow {
  period: string;
  cashIn: number;
  cashOut: number;
  expenses: number;
  netMovement: number;
}

export interface PettyCashFilterOption {
  id: string;
  label: string;
}

export interface PettyCashDashboard {
  settings: PettyCashSettings;
  asOf: string;
  summary: PettyCashSummary;
  tabs: PettyCashTab[];
  movements: PettyCashMovement[];
  tabExposure: PettyCashTabExposure[];
  expenseExposure: PettyCashExpenseExposure[];
  monthlyFlow: PettyCashMonthlyFlow[];
  filterOptions: {
    tabs: PettyCashFilterOption[];
    expenses: PettyCashFilterOption[];
  };
}
