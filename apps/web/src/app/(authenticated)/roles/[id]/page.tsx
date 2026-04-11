'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { Breadcrumb } from '@/components/breadcrumb';
import { MenuPermissionsTab } from '../components/menu-permissions-tab';
import { FieldPermissionsTab } from '../components/field-permissions-tab';
import { RoleFormDialog } from '../components/role-form-dialog';

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

type TabType = 'menu' | 'field';

export default function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('menu');
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const loadRole = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get<Role>(`/roles/${id}`);
      setRole(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="p-8 text-center text-muted-foreground">角色不存在或已被删除</div>
    );
  }

  return (
    <div>
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: '角色管理', href: '/roles' },
          { label: role.name },
        ]}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{role.name}</h1>
            <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
              {role.code}
            </code>
          </div>
          {role.description && (
            <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {role.userCount} 名用户绑定此角色
          </p>
        </div>
        <button
          onClick={() => setEditDialogOpen(true)}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
        >
          <Pencil className="w-4 h-4 mr-1.5" />
          编辑
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b mb-6">
        <div className="flex items-center gap-6">
          {(
            [
              { key: 'menu' as TabType, label: '菜单权限' },
              { key: 'field' as TabType, label: '字段权限' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm transition-colors relative ${
                activeTab === tab.key
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'menu' && <MenuPermissionsTab roleId={role.id} />}
      {activeTab === 'field' && <FieldPermissionsTab roleId={role.id} />}

      {/* Edit Dialog */}
      <RoleFormDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        role={role}
        onSaved={() => {
          setEditDialogOpen(false);
          loadRole();
        }}
      />
    </div>
  );
}
