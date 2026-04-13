export type Identity = 'user' | 'designer' | 'admin';

export interface RequestUser {
  userId: string;
  orgId: string;
  roles: string[];
  isAdmin: boolean;
  identity: Identity;
}
