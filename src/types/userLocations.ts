export type UserLocationMode = 'user' | 'location';

export interface UserLocationUser {
  userId: string;
  name: string;
  email: string;
  defaultLocation: string;
  blocked: boolean;
  missingUserRecord: boolean;
}

export interface UserLocationLocation {
  code: string;
  name: string;
}

export interface UserLocationAssignment {
  userId: string;
  userName: string;
  userEmail: string;
  userBlocked: boolean;
  userMissingRecord: boolean;
  locationCode: string;
  locationName: string;
  canView: boolean;
  canUpdate: boolean;
}

export interface UserLocationForm {
  userId: string;
  locationCode: string;
  canView: boolean;
  canUpdate: boolean;
}

export interface UserLocationsPayload {
  users: UserLocationUser[];
  locations: UserLocationLocation[];
  assignments: UserLocationAssignment[];
  defaults: UserLocationForm;
  stats: {
    users: number;
    locations: number;
    assignments: number;
    usersWithLocations: number;
    locationsWithUsers: number;
    updateAccess: number;
    viewOnly: number;
  };
}
