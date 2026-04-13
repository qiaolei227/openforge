'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface Role {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  role: Role | null;
  /** Called after a successful save. In create mode the parent may also navigate. */
  onSaved: () => void;
}

const inputClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function RoleFormDialog({ open, onClose, role, onSaved }: Props) {
  const router = useRouter();
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errorCodes');
  const tRoles = useTranslations('roles');

  const isEdit = !!role;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [codeEditedManually, setCodeEditedManually] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset form when dialog opens / role changes
  useEffect(() => {
    if (!open) return;
    if (role) {
      setName(role.name);
      setCode(role.code);
      setDescription(role.description ?? '');
      setCodeEditedManually(true); // edit mode: code is read-only, no auto-slug
    } else {
      setName('');
      setCode('');
      setDescription('');
      setCodeEditedManually(false);
    }
    setError('');
  }, [open, role]);

  // Auto-slug code from name when not manually edited
  useEffect(() => {
    if (!isEdit && !codeEditedManually) {
      setCode(slugify(name));
    }
  }, [name, isEdit, codeEditedManually]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCode(e.target.value);
    setCodeEditedManually(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isEdit && role) {
        await apiClient.put(`/roles/${role.id}`, {
          name,
          description: description || undefined,
        });
        onSaved();
      } else {
        const { data } = await apiClient.post<{ id: string }>('/roles', {
          code,
          name,
          description: description || undefined,
        });
        onSaved();
        // Navigate to role detail page after creation
        router.push(`/roles/${data.id}`);
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tErrors, tCommon('operationFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
        <h2 className="text-lg font-semibold mb-4">
          {isEdit ? tRoles('edit') : tRoles('new')}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {tRoles('name')} <span className="text-destructive">*</span>
            </label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tRoles('namePlaceholder')}
              required
              autoFocus
            />
          </div>

          {/* Code */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {tRoles('code')} <span className="text-destructive">*</span>
            </label>
            {isEdit ? (
              <>
                <input
                  className={inputClass}
                  value={code}
                  disabled
                  readOnly
                />
                <p className="text-xs text-muted-foreground">{tRoles('codeReadonly')}</p>
              </>
            ) : (
              <>
                <input
                  className={inputClass}
                  value={code}
                  onChange={handleCodeChange}
                  placeholder={tRoles('codePlaceholder')}
                  required
                  pattern="[a-z][a-z0-9_]*"
                  title={tRoles('codePattern')}
                />
                <p className="text-xs text-muted-foreground">
                  {tRoles('codeAutoGenHint')}
                </p>
              </>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{tRoles('description')}</label>
            <textarea
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tRoles('descriptionPlaceholder')}
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className={btnOutline} disabled={submitting}>
              {tCommon('cancel')}
            </button>
            <button type="submit" disabled={submitting} className={btnPrimary}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  {tCommon('submitting')}
                </>
              ) : isEdit ? (
                tCommon('save')
              ) : (
                tCommon('create')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
