export interface LoginRequest {
  username: string;
  password: string;
  platform: 'web' | 'mobile';
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  userId: string;
  orgId: string;
  roles: string[];
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  isAdmin: boolean;
}

export interface UpdateProfileRequest {
  displayName?: string;
  email?: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}
