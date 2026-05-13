export interface WwwUser {
  userId: string;
  realName: string;
  phone: string;
  email: string;
  customerId: string;
  branchCode: string;
  supplierId: string;
  salesman: string;
  lastVisitDate: string | null;
  securityRoleId: number;
  securityRoleName: string;
  canCreateTender: boolean;
  pageSize: string;
  defaultLocation: string;
  defaultLocationName: string;
  modulesAllowed: boolean[];
  showDashboard: boolean;
  showPageHelp: boolean;
  showFieldHelp: boolean;
  blocked: boolean;
  theme: string;
  language: string;
  pdfLanguage: number;
  department: number;
}

export interface WwwUserForm extends Omit<WwwUser, 'lastVisitDate' | 'securityRoleName' | 'defaultLocationName'> {
  password: string;
}

export interface WwwUserOption<T extends string | number = string> {
  value: T;
  label: string;
}

export interface WwwUserModuleOption {
  key: string;
  label: string;
}

export interface WwwUsersPayload {
  users: WwwUser[];
  defaults: WwwUserForm;
  lookups: {
    securityRoles: WwwUserOption<number>[];
    locations: WwwUserOption[];
    salespeople: WwwUserOption[];
    departments: WwwUserOption<number>[];
    pageSizes: WwwUserOption[];
    themes: WwwUserOption[];
    languages: WwwUserOption[];
    pdfLanguages: WwwUserOption<number>[];
    modules: WwwUserModuleOption[];
  };
  stats: {
    total: number;
    open: number;
    blocked: number;
    withRecentLogin: number;
  };
}
