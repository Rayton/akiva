export type SystemCheckStatus = 'pass' | 'warning' | 'fail';

export interface SystemCheckItem {
  label: string;
  status: SystemCheckStatus;
  value: string;
  detail: string;
}

export interface SystemCheckSection {
  id: string;
  title: string;
  description: string;
  icon: string;
  items: SystemCheckItem[];
}

export interface SystemCheckSummary {
  status: SystemCheckStatus;
  passed: number;
  warnings: number;
  failed: number;
  total: number;
  checkedAt: string;
  environment: string;
}

export interface SystemCheckPayload {
  summary: SystemCheckSummary;
  sections: SystemCheckSection[];
}
