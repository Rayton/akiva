export interface AccessToken {
  id: number;
  name: string;
}

export interface AccessRoleMember {
  userId: string;
  realName: string;
  email: string;
  phone: string;
  blocked: boolean;
}

export interface AccessRole {
  id: number;
  name: string;
  tokenIds: number[];
  tokenNames: string[];
  assignedUsers: AccessRoleMember[];
  userCount: number;
  tokenCount: number;
}

export interface AccessPermissionsStats {
  totalRoles: number;
  rolesInUse: number;
  rolesWithTokens: number;
  rolesWithoutTokens: number;
  totalTokens: number;
  assignedLinks: number;
}

export interface AccessPermissionsPayload {
  roles: AccessRole[];
  tokens: AccessToken[];
  stats: AccessPermissionsStats;
}

export interface AccessRoleForm {
  name: string;
  tokenIds: number[];
}
