'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Ban, CheckCircle, Trash2 } from 'lucide-react';

interface UserOrg {
  id: string;
  orgId: string;
  isDefault: boolean;
  org: { id: string; name: string; code: string };
}

interface UserRole {
  roleId: string;
  createdAt: string;
  role: { id: string; code: string; name: string };
}

type Identity = 'user' | 'designer' | 'admin';

interface User {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  status: 'active' | 'disabled';
  identity: Identity;
  createdAt: string;
  updatedAt: string;
  userOrgs: UserOrg[];
  userRoles: UserRole[];
}

interface Role {
  id: string;
  code: string;
  name: string;
}

interface RoleListResponse {
  items: Role[];
  total: number;
}

interface StatusCounts {
  all: number;
  active: number;
  disabled: number;
}

interface UserListResponse {
  data: User[];
  total: number;
  page: number;
  pageSize: number;
  counts: StatusCounts;
}

interface Org {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface OrgListResponse {
  data: Org[];
  total: number;
}

type DialogMode = 'create' | 'edit' | null;

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

export default function UsersPage() {
  const tUser = useTranslations('user');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');

  // --- list state ---
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<StatusCounts>({ all: 0, active: 0, disabled: 0 });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // --- org list for selectors ---
  const [allOrgs, setAllOrgs] = useState<Org[]>([]);

  // --- role list for selectors ---
  const [allRoles, setAllRoles] = useState<Role[]>([]);

  // --- dialog state ---
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formOrgId, setFormOrgId] = useState('');
  const [formRoleIds, setFormRoleIds] = useState<string[]>([]);
  const [formIdentity, setFormIdentity] = useState<Identity>('user');
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // --- confirm dialog state ---
  const [confirmAction, setConfirmAction] = useState<{
    type: 'delete' | 'toggle-status';
    user: User;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  // --- toast ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // --- fetch orgs ---
  const fetchOrgs = useCallback(async () => {
    try {
      const { data } = await apiClient.get<OrgListResponse>('/orgs?pageSize=1000');
      setAllOrgs(data.data);
    } catch {
      // silently fail, orgs are supplementary
    }
  }, []);

  // --- fetch roles ---
  const fetchRoles = useCallback(async () => {
    try {
      const { data } = await apiClient.get<RoleListResponse>('/roles?pageSize=200');
      setAllRoles(data.items ?? []);
    } catch {
      // silently fail, roles are supplementary
    }
  }, []);

  // --- debounce keyword ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  // --- fetch users ---
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedKeyword) params.set('keyword', debouncedKeyword);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const { data } = await apiClient.get<UserListResponse>(`/users?${params.toString()}`);
      setUsers(data.data);
      setTotal(data.total);
      setCounts(data.counts);
    } catch {
      showToast(tUser('fetchFailed'), 'error');
    } finally {
      setLoading(false);
    }
  }, [debouncedKeyword, statusFilter, page, pageSize, showToast, tUser]);

  useEffect(() => {
    fetchOrgs();
    fetchRoles();
  }, [fetchOrgs, fetchRoles]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // --- create / edit dialog ---
  const openCreate = () => {
    setDialogMode('create');
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormDisplayName('');
    setFormEmail('');
    setFormPhone('');
    setFormOrgId(allOrgs.length > 0 ? allOrgs[0].id : '');
    setFormRoleIds([]);
    setFormIdentity('user');
    setFormError('');
  };

  const openEdit = (user: User) => {
    setDialogMode('edit');
    setEditingUser(user);
    setFormUsername(user.username);
    setFormPassword('');
    setFormDisplayName(user.displayName);
    setFormEmail(user.email || '');
    setFormPhone(user.phone || '');
    setFormOrgId('');
    setFormRoleIds((user.userRoles ?? []).map((ur) => ur.roleId));
    setFormIdentity(user.identity ?? 'user');
    setFormError('');
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingUser(null);
    setFormRoleIds([]);
    setFormError('');
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);
    try {
      let userId: string;
      if (dialogMode === 'create') {
        const { data } = await apiClient.post<{ id: string }>('/users', {
          username: formUsername,
          password: formPassword,
          displayName: formDisplayName,
          email: formEmail || undefined,
          phone: formPhone || undefined,
          orgId: formOrgId,
          identity: formIdentity,
        });
        userId = data.id;
      } else if (dialogMode === 'edit' && editingUser) {
        await apiClient.put(`/users/${editingUser.id}`, {
          displayName: formDisplayName,
          email: formEmail || undefined,
          phone: formPhone || undefined,
          identity: formIdentity,
        });
        userId = editingUser.id;
      } else {
        return;
      }
      // Role binding is part of the same logical operation: if it fails, the
      // user record is created/updated but left with wrong roles. Treat a
      // failure here as the whole save failing so the dialog stays open and
      // the operator can see the inline error.
      // Only bind roles for regular users; admin/designer don't need roles
      if (formIdentity === 'user') {
        await apiClient.put(`/users/${userId}/roles`, { roleIds: formRoleIds });
      } else {
        // Clear any existing roles when identity is admin/designer
        await apiClient.put(`/users/${userId}/roles`, { roleIds: [] });
      }
      showToast(
        dialogMode === 'create' ? tUser('createSuccess') : tUser('updateSuccess'),
        'success',
      );
      closeDialog();
      fetchUsers();
    } catch (err: unknown) {
      setFormError(getApiErrorMessage(err, tErrors, tCommon('operationFailed')));
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- confirm action ---
  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmSubmitting(true);
    try {
      if (confirmAction.type === 'delete') {
        await apiClient.delete(`/users/${confirmAction.user.id}`);
        showToast(tUser('deleteSuccess'), 'success');
      } else if (confirmAction.type === 'toggle-status') {
        const newStatus = confirmAction.user.status === 'active' ? 'disabled' : 'active';
        await apiClient.put(`/users/${confirmAction.user.id}`, { status: newStatus });
        showToast(newStatus === 'active' ? tUser('enableSuccess') : tUser('disableSuccess'), 'success');
      }
      setConfirmAction(null);
      fetchUsers();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setConfirmAction(null);
    } finally {
      setConfirmSubmitting(false);
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
        <h1 className="text-2xl font-bold">{tUser('title')}</h1>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center justify-between border-b mb-4">
        <div className="flex items-center gap-6">
          {([
            { key: '', label: tCommon('statusAll'), count: counts.all },
            { key: 'active', label: tCommon('statusActive'), count: counts.active },
            { key: 'disabled', label: tCommon('statusDisabled'), count: counts.disabled },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`pb-2 text-sm transition-colors relative ${
                statusFilter === tab.key
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}({tab.count})
              {statusFilter === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
        <button onClick={openCreate} className={`${btnPrimary} mb-2`}>
          + {tUser('create')}
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <input
            className={inputClass}
            placeholder={tUser('searchPlaceholder')}
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
              <th className="p-3 text-left font-medium">{tUser('username')}</th>
              <th className="p-3 text-left font-medium">{tUser('displayName')}</th>
              <th className="p-3 text-left font-medium">{tUser('email')}</th>
              <th className="p-3 text-left font-medium">{tUser('org')}</th>
              <th className="p-3 text-left font-medium">{tUser('roles')}</th>
              <th className="p-3 text-left font-medium">{tCommon('status')}</th>
              <th className="p-3 text-left font-medium">{tCommon('createdAt')}</th>
              <th className="p-3 text-left font-medium">{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  {tCommon('loading')}
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground">
                  {tCommon('noData')}
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{user.username}</td>
                  <td className="p-3">{user.displayName}</td>
                  <td className="p-3 text-muted-foreground">{user.email || '-'}</td>
                  <td className="p-3">
                    {user.userOrgs.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.userOrgs.map((uo) => (
                          <span
                            key={uo.id}
                            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs"
                          >
                            {uo.org.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    {user.identity === 'admin' || user.identity === 'designer' ? (
                      <span className="text-xs text-muted-foreground italic">
                        {tUser('rolesNotNeeded')}
                      </span>
                    ) : (user.userRoles ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(user.userRoles ?? []).map((ur) => (
                          <span
                            key={ur.roleId}
                            className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium"
                          >
                            {ur.role.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.status === 'active'
                          ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20'
                          : 'bg-red-50 text-red-700 ring-1 ring-red-600/20'
                      }`}
                    >
                      {user.status === 'active' ? tCommon('statusActive') : tCommon('statusDisabled')}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(user)} className={btnGhost} title={tCommon('edit')}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setConfirmAction({ type: 'toggle-status', user })
                        }
                        className={btnGhost}
                        title={user.status === 'active' ? tCommon('disable') : tCommon('enable')}
                      >
                        {user.status === 'active' ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: 'delete', user })}
                        className={`${btnGhost} text-destructive hover:text-destructive`}
                        title={tCommon('delete')}
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
      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">
              {dialogMode === 'create' ? tUser('create') : tUser('edit')}
            </h2>
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{tUser('username')}</label>
                <input
                  className={`${inputClass} ${dialogMode === 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  placeholder={tUser('usernamePlaceholder')}
                  required
                  disabled={dialogMode === 'edit'}
                />
                {dialogMode === 'edit' && (
                  <p className="text-xs text-muted-foreground">{tUser('usernameReadonly')}</p>
                )}
              </div>

              {dialogMode === 'create' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tUser('password')}</label>
                  <input
                    type="password"
                    className={inputClass}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={tUser('passwordPlaceholder')}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">{tUser('displayName')}</label>
                <input
                  className={inputClass}
                  value={formDisplayName}
                  onChange={(e) => setFormDisplayName(e.target.value)}
                  placeholder={tUser('displayNamePlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tUser('email')}</label>
                <input
                  type="email"
                  className={inputClass}
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder={tCommon('optional')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tUser('phone')}</label>
                <input
                  className={inputClass}
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder={tCommon('optional')}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tUser('identity')}</label>
                <select
                  className={inputClass}
                  value={formIdentity}
                  onChange={(e) => {
                    const newIdentity = e.target.value as Identity;
                    setFormIdentity(newIdentity);
                    if (newIdentity !== 'user') {
                      setFormRoleIds([]);
                    }
                  }}
                >
                  <option value="user">{tUser('identityUser')}</option>
                  <option value="designer">{tUser('identityDesigner')}</option>
                  <option value="admin">{tUser('identityAdmin')}</option>
                </select>
              </div>

              {dialogMode === 'create' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tUser('org')}</label>
                  <select
                    className={inputClass}
                    value={formOrgId}
                    onChange={(e) => setFormOrgId(e.target.value)}
                    required
                  >
                    {allOrgs.length === 0 && (
                      <option value="" disabled>
                        {tUser('noOrgsAvailable')}
                      </option>
                    )}
                    {allOrgs.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formIdentity === 'user' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tUser('roles')}</label>
                  {allRoles.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{tUser('noRolesAvailable')}</p>
                  ) : (
                    <div className="border border-input rounded-md max-h-36 overflow-y-auto p-2 space-y-1.5 bg-background">
                      {allRoles.map((role) => {
                        const checked = formRoleIds.includes(role.id);
                        return (
                          <label key={role.id} className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormRoleIds((ids) => [...ids, role.id]);
                                } else {
                                  setFormRoleIds((ids) => ids.filter((id) => id !== role.id));
                                }
                              }}
                              className="h-4 w-4 accent-primary rounded"
                            />
                            <span className="text-sm">{role.name}</span>
                            <span className="text-xs text-muted-foreground font-mono">({role.code})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tUser('roles')}</label>
                  <p className="text-xs text-muted-foreground">
                    {formIdentity === 'admin'
                      ? tUser('rolesNotNeededAdmin')
                      : tUser('rolesNotNeededDesigner')}
                  </p>
                </div>
              )}

              {formError && (
                <p className="text-sm text-destructive">{formError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button type="button" onClick={closeDialog} className={btnOutline}>
                  {tCommon('cancel')}
                </button>
                <button type="submit" disabled={formSubmitting} className={btnPrimary}>
                  {formSubmitting ? tCommon('submitting') : dialogMode === 'create' ? tCommon('create') : tCommon('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {confirmAction.type === 'delete'
                ? tUser('confirmDelete', { name: confirmAction.user.displayName, username: confirmAction.user.username })
                : confirmAction.user.status === 'active'
                  ? tUser('confirmDisable', { name: confirmAction.user.displayName })
                  : tUser('confirmEnable', { name: confirmAction.user.displayName })}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className={btnOutline}
                disabled={confirmSubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={confirmSubmitting}
                className={confirmAction.type === 'delete' ? btnDestructive : btnPrimary}
              >
                {confirmSubmitting
                  ? tCommon('processing')
                  : confirmAction.type === 'delete'
                    ? tCommon('confirmDeleteBtn')
                    : tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
