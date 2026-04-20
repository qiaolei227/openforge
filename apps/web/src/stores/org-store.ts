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
  /** Derived: the currently selected org, or null */
  currentOrg: () => Org | null;
  /** Derived: true when current org is a root (parentId === null) */
  isRootOrg: () => boolean;
  /** Change the active org — writes localStorage + window global + emits 'orgChanged' */
  setCurrentOrg: (orgId: string) => void;
  /** Load accessible orgs from server and hydrate currentOrgId from localStorage */
  refresh: (userId: string) => Promise<void>;
}

function storageKey(userId: string) {
  return `openforge:currentOrgId:${userId}`;
}

function writeGlobal(orgId: string | null) {
  if (typeof window !== 'undefined') {
    (window as unknown as { __openforgeCurrentOrgId?: string | null }).__openforgeCurrentOrgId = orgId;
  }
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
    writeGlobal(orgId);
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
      writeGlobal(nextId);
      if (typeof window !== 'undefined' && nextId) {
        localStorage.setItem(storageKey(userId), nextId);
      }
    } finally {
      set({ loading: false });
    }
  },
}));

/**
 * Mount this hook in a top-level component (e.g. AppShell) to persist the
 * current org to localStorage scoped by user id. Called automatically on
 * refresh(); this hook only handles user-initiated setCurrentOrg.
 */
export function subscribeOrgPersistence(userId: string): () => void {
  if (typeof window === 'undefined') return () => {};
  const unsub = useOrgStore.subscribe((state) => {
    if (state.currentOrgId) {
      localStorage.setItem(storageKey(userId), state.currentOrgId);
    }
  });
  return unsub;
}
