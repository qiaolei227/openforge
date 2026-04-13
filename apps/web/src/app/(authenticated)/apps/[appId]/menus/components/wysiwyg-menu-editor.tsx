'use client';

import { useState, useCallback, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useMenuStore } from '@/stores/menu-store';
import { useAppById } from '@/hooks/use-app-by-id';
import { WysiwygLeftPanel } from './wysiwyg-left-panel';
import { WysiwygRightPanel } from './wysiwyg-right-panel';
import { WysiwygItemEditor } from './wysiwyg-item-editor';
import type { AdminMenuNode } from '../menu-tab';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface WysiwygMenuEditorProps {
  appId: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function WysiwygMenuEditor({ appId }: WysiwygMenuEditorProps) {
  const { app, loading: appLoading } = useAppById(appId);
  const appCode = app?.code ?? null;

  const [tree, setTree] = useState<AdminMenuNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeL2Id, setActiveL2Id] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<AdminMenuNode | null>(null);
  const invalidateMenu = useMenuStore((s) => s.invalidate);

  /* ---- Fetch admin menu tree ---- */
  const fetchTree = useCallback(async () => {
    if (!appCode) return;
    try {
      const { data } = await apiClient.get<AdminMenuNode[]>(
        `/menus/admin/tree?appCode=${encodeURIComponent(appCode)}`,
      );
      setTree(data ?? []);
    } catch (e) {
      console.error('Failed to fetch menu tree', e);
    } finally {
      setLoading(false);
    }
  }, [appCode]);

  useEffect(() => {
    if (appCode) {
      fetchTree();
    }
  }, [appCode, fetchTree]);

  /* ---- Refresh helper (re-fetch + invalidate runtime cache) ---- */
  const handleRefresh = useCallback(() => {
    fetchTree();
    if (appCode) invalidateMenu(appCode);
  }, [fetchTree, invalidateMenu, appCode]);

  /* ---- Find L2 node from tree ---- */
  const findL2Node = useCallback(
    (nodes: AdminMenuNode[], l2Id: string): AdminMenuNode | null => {
      for (const l1 of nodes) {
        if (l1.type === 'group') {
          const l2 = l1.children?.find((c) => c.id === l2Id);
          if (l2) return l2;
        }
      }
      return null;
    },
    [],
  );

  const l2Node = activeL2Id ? findL2Node(tree, activeL2Id) : null;

  /* ---- Auto-select first L2 when tree loads (or activeL2Id becomes stale) ---- */
  useEffect(() => {
    if (!tree.length) return;
    // If activeL2Id is still valid, keep it
    if (activeL2Id && findL2Node(tree, activeL2Id)) return;
    // Otherwise pick the first L2 from the first L1 group
    for (const l1 of tree) {
      if (l1.type === 'group' && l1.children?.length) {
        setActiveL2Id(l1.children[0].id);
        return;
      }
    }
    setActiveL2Id(null);
  }, [tree, activeL2Id, findL2Node]);

  /* ---- Loading state ---- */
  if (appLoading || (loading && !tree.length)) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col border rounded-xl bg-card overflow-hidden -mb-6"
      style={{ height: 'calc(100vh - 290px)' }}
    >
      {/* Top: Left panel + Right panel side by side */}
      <div className="flex flex-1 min-h-0">
        <WysiwygLeftPanel
          appId={appId}
          tree={tree}
          activeL2Id={activeL2Id}
          onSelectL2={setActiveL2Id}
          onRefresh={handleRefresh}
        />
        <WysiwygRightPanel
          appId={appId}
          l2Node={l2Node}
          onSelectItem={setSelectedItem}
          onRefresh={handleRefresh}
        />
      </div>

      {/* Bottom: Item property editor (only when an item is selected) */}
      <WysiwygItemEditor
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSave={() => {
          handleRefresh();
          setSelectedItem(null);
        }}
      />
    </div>
  );
}
