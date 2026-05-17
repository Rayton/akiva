export interface DepartmentUser {
  userId: string;
  name: string;
  email: string;
  defaultLocation: string;
  blocked: boolean;
  missingUserRecord: boolean;
}

export interface DepartmentLocation {
  code: string;
  name: string;
}

export interface DepartmentAuthorization {
  userId: string;
  userName: string;
  userEmail: string;
  userBlocked: boolean;
  userMissingRecord: boolean;
  locationCode: string;
  locationName: string;
  canCreate: boolean;
  canAuthorise: boolean;
  canFulfill: boolean;
}

export interface DepartmentAuthorizationForm {
  userId: string;
  locationCode: string;
  canCreate: boolean;
  canAuthorise: boolean;
  canFulfill: boolean;
}

export interface DepartmentsPayload {
  users: DepartmentUser[];
  locations: DepartmentLocation[];
  authorizations: DepartmentAuthorization[];
  defaults: DepartmentAuthorizationForm;
  stats: {
    users: number;
    locations: number;
    authorizations: number;
    locationsWithUsers: number;
    createAccess: number;
    authoriseAccess: number;
    fulfillAccess: number;
  };
}
