export type ManufacturingSetupTab = 'mrp-calendar' | 'mrp-demand-types';

export interface MrpCalendarDay {
  calendarDate: string;
  weekday: string;
  dayNumber: number;
  manufacturingAvailable: boolean;
}

export interface MrpDemandType {
  code: string;
  name: string;
  demandCount: number;
  requirementCount: number;
}

export interface ManufacturingSetupPayload {
  calendar: MrpCalendarDay[];
  demandTypes: MrpDemandType[];
  stats: {
    calendarDays: number;
    manufacturingDays: number;
    nonManufacturingDays: number;
    demandTypes: number;
  };
}

export interface ManufacturingSetupForm {
  calendarDate?: string;
  manufacturingAvailable?: boolean;
  code?: string;
  name: string;
}
