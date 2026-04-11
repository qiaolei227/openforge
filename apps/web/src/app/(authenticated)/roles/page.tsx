'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Pencil } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { RoleFormDialog } from './components/role-form-dialog';

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  userCount: number;
  createdAt: string;
}

interface RoleListResponse {
  items: Role[];
  total: number;
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring';
const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';
const btnDestructive =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none';
const btnGhost =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 py-1 hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

export default function RolesPage() {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');

  // --- list state ---
  const [roles, setRoles] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [loading, setLoading] = useState(false);

  // --- dialog state ---
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  // --- delete confirm dialog ---
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleteConfirmCode, setDeleteConfirmCode] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- debounce keyword ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // --- fetch roles ---
  const fetchRoles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedKeyword) params.set('keyword', debouncedKeyword);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const { data } = await apiClient.get<RoleListResponse>(`/roles?${params.toString()}`);
      setRoles(data.items);
      setTotal(data.total);
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '加载角色列表失败'), 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedKeyword, page, pageSize, showToast, tErrors]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // --- open create dialog ---
  const openCreate = () => {
    setEditingRole(null);
    setFormDialogOpen(true);
  };

  // --- open edit dialog ---
  const openEdit = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormDialogOpen(true);
  };

  // --- delete ---
  const openDelete = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(role);
    setDeleteConfirmCode('');
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await apiClient.delete(`/roles/${deleteTarget.id}`);
      showToast('角色已删除', 'success');
      setDeleteTarget(null);
      fetchRoles();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, '删除失败'), 'error');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] rounded-md px-4 py-3 text-sm shadow-lg ${
            toast.type === 'success'
              ? 'bg-primary text-primary-foreground'
              : 'bg-destructive text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">角色管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理系统角色及其权限配置</p>
        </div>
        <button onClick={openCreate} className={btnPrimary}>
          <Plus className="w-4 h-4 mr-1" />
          新建角色
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <input
            className={inputClass}
            placeholder="搜索角色编码或名称…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left font-medium w-12">#</th>
              <th className="p-3 text-left font-medium">角色编码</th>
              <th className="p-3 text-left font-medium">角色名称</th>
              <th className="p-3 text-left font-medium">描述</th>
              <th className="p-3 text-left font-medium w-24">用户数</th>
              <th className="p-3 text-left font-medium w-32">{tCommon('createdAt')}</th>
              <th className="p-3 text-left font-medium w-28">{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && roles.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {tCommon('loading')}
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {tCommon('noData')}
                </td>
              </tr>
            ) : (
              roles.map((role, idx) => (
                <tr
                  key={role.id}
                  className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/roles/${role.id}`)}
                >
                  <td className="p-3 text-muted-foreground">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="p-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{role.code}</code>
                  </td>
                  <td className="p-3 font-medium">{role.name}</td>
                  <td className="p-3 text-muted-foreground">{role.description || '-'}</td>
                  <td className="p-3">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
                      {role.userCount} 人
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(role.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => openEdit(role, e)}
                        className={btnGhost}
                        title="编辑"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => openDelete(role, e)}
                        className={`${btnGhost} text-destructive hover:text-destructive`}
                        title="删除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
        <span>{tCommon('total', { count: total })}</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className={btnOutline}
          >
            {tCommon('prevPage')}
          </button>
          <span className="px-2">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className={btnOutline}
          >
            {tCommon('nextPage')}
          </button>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <RoleFormDialog
        open={formDialogOpen}
        onClose={() => setFormDialogOpen(false)}
        role={editingRole}
        onSaved={() => {
          setFormDialogOpen(false);
          fetchRoles();
        }}
      />

      {/* Delete Confirm Dialog (strong: requires typing role code) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2 text-destructive">删除角色</h2>
            <p className="text-sm text-muted-foreground mb-3">
              此操作不可撤销。请输入角色编码{' '}
              <code className="font-mono bg-muted px-1 rounded text-foreground">{deleteTarget.code}</code>{' '}
              以确认删除。
            </p>
            {deleteTarget.userCount > 0 && (
              <p className="text-sm text-destructive mb-3">
                该角色当前绑定了 {deleteTarget.userCount} 名用户，删除将被拒绝。请先解绑所有用户。
              </p>
            )}
            <input
              className={`${inputClass} mb-4`}
              placeholder={`请输入: ${deleteTarget.code}`}
              value={deleteConfirmCode}
              onChange={(e) => setDeleteConfirmCode(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className={btnOutline}
                disabled={deleteSubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmCode !== deleteTarget.code || deleteSubmitting}
                className={btnDestructive}
              >
                {deleteSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  '确认删除'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
