import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { getAccessToken, setTokens, clearTokens } from '@/lib/auth';
import type { LoginRequest, TokenResponse, UserProfile } from '@openforge/shared';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  login: (request: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => boolean;
  fetchProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  user: null,

  login: async (request: LoginRequest) => {
    const { data } = await apiClient.post<TokenResponse>('/auth/login', request);
    setTokens(data.accessToken, data.refreshToken);
    set({ isAuthenticated: true });
    // Fetch profile after login
    const { data: profile } = await apiClient.get<UserProfile>('/auth/profile');
    set({ user: profile });
  },

  logout: async () => {
    try {
      await apiClient.post('/auth/logout', { platform: 'web' });
    } finally {
      clearTokens();
      set({ isAuthenticated: false, user: null });
    }
  },

  checkAuth: () => {
    const token = getAccessToken();
    const authenticated = !!token;
    if (authenticated) {
      set({ isAuthenticated: true });
    }
    return authenticated;
  },

  fetchProfile: async () => {
    try {
      const { data } = await apiClient.get<UserProfile>('/auth/profile');
      set({ user: data });
    } catch {
      // Profile fetch failed, don't crash
    }
  },
}));
