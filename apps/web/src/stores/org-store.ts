'use client';

import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';

export interface Org {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
}

interface OrgState {
  accessibleOrgs: Org[];
  currentOrgId: string | null;
  loading: boolean;
  currentOrg: () => Org | null;
  isRootOrg: () => boolean;
  setCurrentOrg: (orgId: string) => void;
  refresh: (userId: string) => Promise<void>;
}

function storageKey(userId: string) {
  return `openforge:currentOrgId:${userId}`;
}

// Module-scoped mirror of the store's currentOrgId so non-React callers
// (axios interceptor, ad-hoc utils) can read the active org without going
// through the React runtime. Kept in sync by setCurrentOrg and refresh.
let currentOrgIdRef: string | null = null;

export function getCurrentOrgId(): string | null {
  return currentOrgIdRef;
}

function dispatchOrgChanged(orgId: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('orgChanged', { detail: { orgId } }));
  }
}

export const useOrgStore = create<OrgState>((set, get) => ({
  accessibleOrgs: [],
  currentOrgId: null,
  loading: false,

  currentOrg: () => {
    const { accessibleOrgs, currentOrgId } = get();
    return accessibleOrgs.find((o) => o.id === currentOrgId) ?? null;
  },

  isRootOrg: () => {
    const org = get().currentOrg();
    return !!org && org.parentId === null;
  },

  setCurrentOrg: (orgId: string) => {
    const { accessibleOrgs, currentOrgId } = get();
    if (!accessibleOrgs.some((o) => o.id === orgId)) return;
    if (orgId === currentOrgId) return;
    set({ currentOrgId: orgId });
    currentOrgIdRef = orgId;
    dispatchOrgChanged(orgId);
  },

  refresh: async (userId: string) => {
    set({ loading: true });
    try {
      const { data } = await apiClient.get<Org[]>('/orgs/accessible');
      const orgs = data;

      let nextId: string | null = null;
      if (typeof window !== 'undefined') {
        const persisted = localStorage.getItem(storageKey(userId));
        if (persisted && orgs.some((o) => o.id === persisted)) {
          nextId = persisted;
        }
      }
      if (!nextId && orgs.length > 0) {
        nextId = orgs[0].id;
      }

      set({ accessibleOrgs: orgs, currentOrgId: nextId });
      currentOrgIdRef = nextId;
      if (typeof window !== 'undefined' && nextId) {
        localStorage.setItem(storageKey(userId), nextId);
      }
    } finally {
      set({ loading: false });
    }
  },
}));

export function subscribeOrgPersistence(userId: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const unsub = useOrgStore.subscribe((state) => {
    if (state.currentOrgId) {
      localStorage.setItem(storageKey(userId), state.currentOrgId);
    }
  });
  return unsub;
}
