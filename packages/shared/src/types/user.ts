export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  status: 'active' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  displayName: string;
  email?: string;
  phone?: string;
  orgId: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  email?: string;
  phone?: string;
  status?: 'active' | 'disabled';
}
