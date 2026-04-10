'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { getApiErrorMessage } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useAiStore } from '@/stores/ai-store';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  ArrowLeft,
  Trash2,
  Columns3,
  X,
  Loader2,
  Sparkles,
  Paintbrush,
  GripVertical,
  Search,
  Eye,
  TableProperties,
  Star,
} from 'lucide-react';
import { FIELD_TYPES, type LayoutConfig, type Field as SharedField, type SysEntity } from '@openforge/shared';
import { generateDefaultFormLayout, generateDefaultListLayout } from '@openforge/render-engine';
import { Breadcrumb } from '@/components/breadcrumb';
import { fieldTypeBadgeClass } from './designer/field-type-styles';
import { CreateViewDialog } from './designer/create-view-dialog';
import { PreviewMode } from './designer/preview-mode';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AppItem {
  id: string;
  name: string;
  code: string;
  icon: string | null;
  description: string | null;
  version: string | null;
}

interface ModelItem {
  id: string;
  appId: string;
  name: string;
  code: string;
  tableName: string;
  description: string | null;
  dataScope: 'private' | 'shared' | 'distributed';
  isTree: boolean;
  app?: { id?: string; code?: string; name?: string };
}

interface Field {
  id: string;
  modelId: string;
  name: string;
  columnName: string;
  fieldType: string;
  isRequired: boolean;
  isUnique: boolean;
  defaultValue: any;
  options: Record<string, any> | null;
  sortOrder: number;
  isSystem: boolean;
  deletedAt: string | null;
  entityId?: string | null;
}


interface FieldSuggestion {
  name: string;
  columnName: string;
  fieldType: string;
  isRequired: boolean;
  isUnique: boolean;
  semantic?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** System fields are platform conventions — not stored in sys_field, generated client-side for display */
const SYSTEM_FIELDS_DISPLAY: Field[] = [
  { id: '_sys_org_id', modelId: '', name: '所属组织', columnName: 'org_id', fieldType: 'ORGANIZATION', isRequired: false, isUnique: false, defaultValue: null, options: null, sortOrder: -800, isSystem: true, deletedAt: null },
  { id: '_sys_is_archived', modelId: '', name: '是否归档', columnName: 'is_archived', fieldType: 'BOOLEAN', isRequired: false, isUnique: false, defaultValue: null, options: null, sortOrder: -700, isSystem: true, deletedAt: null },
  { id: '_sys_created_by', modelId: '', name: '创建人', columnName: 'created_by', fieldType: 'USER', isRequired: false, isUnique: false, defaultValue: null, options: null, sortOrder: -500, isSystem: true, deletedAt: null },
  { id: '_sys_updated_by', modelId: '', name: '更新人', columnName: 'updated_by', fieldType: 'USER', isRequired: false, isUnique: false, defaultValue: null, options: null, sortOrder: -400, isSystem: true, deletedAt: null },
  { id: '_sys_created_at', modelId: '', name: '创建时间', columnName: 'created_at', fieldType: 'DATETIME', isRequired: false, isUnique: false, defaultValue: null, options: null, sortOrder: -300, isSystem: true, deletedAt: null },
  { id: '_sys_updated_at', modelId: '', name: '更新时间', columnName: 'updated_at', fieldType: 'DATETIME', isRequired: false, isUnique: false, defaultValue: null, options: null, sortOrder: -200, isSystem: true, deletedAt: null },
];

const DATE_FORMAT_OPTIONS = ['YYYYMMDD', 'YYYY-MM-DD', 'YYYYMM', 'YYYY'] as const;

interface FormData {
  name: string;
  columnName: string;
  fieldType: string;
  isRequired: boolean;
  isUnique: boolean;
  defaultValue: any;
  options: {
    maxLength?: number;
    scale?: number;
    dictCode?: string;
    prefix?: string;
    dateFormat?: string;
    digits?: number;
    startFrom?: number;
    targetModelId?: string;
    targetDisplayField?: string;
  };
  semantic: string;
  aiHint: string;
}

const defaultFormData: FormData = {
  name: '',
  columnName: '',
  fieldType: 'STRING',
  isRequired: false,
  isUnique: false,
  defaultValue: '',
  options: {},
  semantic: '',
  aiHint: '',
};

const btnPrimary =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none';
const btnOutline =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';
const btnDestructive =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-3 py-2 bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none';
const btnGhost =
  'inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 py-1 hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none';

/* ------------------------------------------------------------------ */
/*  Sortable Field Row                                                 */
/* ------------------------------------------------------------------ */

function SortableFieldRow({
  field,
  renderFieldTypeBadge,
  tFields,
  tCommon,
  onEdit,
  onDelete,
}: {
  field: Field;
  renderFieldTypeBadge: (ft: string) => React.ReactNode;
  tFields: (key: string) => string;
  tCommon: (key: string) => string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} onClick={onEdit} className="border-b hover:bg-muted/30 transition-colors cursor-pointer">
      <td className="p-3 w-10 text-muted-foreground" onClick={(e) => e.stopPropagation()} {...attributes} {...listeners}>
        <GripVertical className="w-4 h-4 cursor-grab" />
      </td>
      <td className="p-3 font-medium">{field.name}</td>
      <td className="p-3">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono" style={{ fontSize: '12px' }}>
          {field.columnName}
        </code>
      </td>
      <td className="p-3">{renderFieldTypeBadge(field.fieldType)}</td>
      <td className="p-3 text-muted-foreground">
        {field.isRequired ? (
          <span className="text-foreground font-medium">{tFields('yes')}</span>
        ) : (
          <span>{tFields('no')}</span>
        )}
      </td>
      <td className="p-3 text-muted-foreground">
        {field.isUnique ? (
          <span className="text-foreground font-medium">{tFields('yes')}</span>
        ) : (
          <span>{tFields('no')}</span>
        )}
      </td>
      <td className="p-3" onClick={(e) => e.stopPropagation()}>
        <button onClick={onDelete} className={`${btnGhost} text-destructive hover:text-destructive`}>
          {tCommon('delete')}
        </button>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Sortable Sub Table Row                                             */
/* ------------------------------------------------------------------ */

function SortableSubTableRow({
  entity,
  fieldCountText,
  entityTypeText,
  deleteText,
  onEdit,
  onDelete,
}: {
  entity: SysEntity;
  fieldCountText: string;
  entityTypeText: string;
  deleteText: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entity.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={onEdit}
      className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <td
        className="p-3 text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 cursor-grab" />
      </td>
      <td className="p-3 font-medium">
        <span className="truncate">{entity.name}</span>
      </td>
      <td className="p-3">
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
          {entity.code}
        </code>
      </td>
      <td className="p-3">
        <Badge variant="outline" className="border-0 text-xs bg-muted">
          {entityTypeText}
        </Badge>
      </td>
      <td className="p-3 text-muted-foreground">{fieldCountText}</td>
      <td className="p-3" onClick={(e) => e.stopPropagation()}>
        <button onClick={onDelete} className={`${btnGhost} text-destructive hover:text-destructive`}>
          {deleteText}
        </button>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ModelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const appId = params.appId as string;
  const modelId = params.modelId as string;

  const t = useTranslations();
  const tFields = useTranslations('fields');
  const tModels = useTranslations('models');
  const tApps = useTranslations('apps');
  const tCommon = useTranslations('common');
  const tAi = useTranslations('ai');
  const tErrors = useTranslations('errorCodes');
  const tEntities = useTranslations('entities');
  const tDicts = useTranslations('dicts');

  /* ---------- Core data ---------- */
  const [app, setApp] = useState<AppItem | null>(null);
  const [model, setModel] = useState<ModelItem | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [systemFields, setSystemFields] = useState<Field[]>([]);
  const [views, setViews] = useState<import('@openforge/shared').SysView[]>([]);
  const [entities, setEntities] = useState<SysEntity[]>([]);

  /* ---------- UI state ---------- */
  const searchParams = useSearchParams();
  type TabType = 'fields' | 'subtables' | 'views' | 'distribution-policy';
  const validTabs: TabType[] = ['fields', 'subtables', 'views', 'distribution-policy'];
  const initialTab = validTabs.includes(searchParams.get('tab') as TabType)
    ? (searchParams.get('tab') as TabType)
    : 'fields';
  const [activeTab, setActiveTabState] = useState<TabType>(initialTab);
  const setActiveTab = useCallback((tab: TabType) => {
    setActiveTabState(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url.toString());
  }, []);
  const [systemFieldsOpen, setSystemFieldsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fieldKeyword, setFieldKeyword] = useState('');
  const [subTableKeyword, setSubTableKeyword] = useState('');
  const [viewKeyword, setViewKeyword] = useState('');
  const [viewTypeFilter, setViewTypeFilter] = useState<'all' | 'form' | 'list'>('all');
  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [deleteViewTarget, setDeleteViewTarget] = useState<import('@openforge/shared').SysView | null>(null);
  const [previewType, setPreviewType] = useState<'form' | 'list' | null>(null);

  /* ---------- Distribution Policy state ---------- */
  interface DistPolicyItem { fieldId: string; fieldName: string; columnName: string; fieldType: string; editable: boolean }
  const [distPolicies, setDistPolicies] = useState<DistPolicyItem[]>([]);
  const [distPolicyLoading, setDistPolicyLoading] = useState(false);
  const [distPolicySaving, setDistPolicySaving] = useState(false);

  /* ---------- Entity UI state ---------- */
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set());
  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<SysEntity | null>(null);
  const [entityFormData, setEntityFormData] = useState({ name: '', code: '', entityType: 'one_to_one' as 'one_to_one' | 'one_to_many' });
  const [entityFormSubmitting, setEntityFormSubmitting] = useState(false);
  const [entityCodeTouched, setEntityCodeTouched] = useState(false);
  const [deleteEntityTarget, setDeleteEntityTarget] = useState<SysEntity | null>(null);
  const [deleteEntitySubmitting, setDeleteEntitySubmitting] = useState(false);
  const [currentEntityId, setCurrentEntityId] = useState<string | null>(null);

  /* ---------- For field editing ---------- */
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* ---------- Confirm dialog ---------- */
  const [confirmAction, setConfirmAction] = useState<{
    field: Field;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  /* ---------- Backfill dialog (set required with existing null data) ---------- */
  const [backfillDialog, setBackfillDialog] = useState<{
    nullCount: number;
    pendingPayload: any;
  } | null>(null);
  const [backfillValue, setBackfillValue] = useState('');
  const [backfillSubmitting, setBackfillSubmitting] = useState(false);

  /* ---------- Toast ---------- */
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  /* ---------- AI suggestions ---------- */
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [adoptingField, setAdoptingField] = useState<string | null>(null);
  const [adoptingAll, setAdoptingAll] = useState(false);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- AI context ---------- */
  const setAiContext = useAiStore((s) => s.setContext);
  useEffect(() => {
    setAiContext({
      page: 'model-detail',
      appId,
      appName: app?.name,
      modelId,
      modelName: model?.name,
      fieldCount: fields.length,
    });
  }, [setAiContext, appId, app?.name, modelId, model?.name, fields.length]);

  /* ---------- Drawer form state ---------- */
  const [formData, setFormData] = useState<FormData>({ ...defaultFormData });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [columnNameTouched, setColumnNameTouched] = useState(false);

  /* ---------- REFERENCE cascading data ---------- */
  const [availableModels, setAvailableModels] = useState<ModelItem[]>([]);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [targetModelFields, setTargetModelFields] = useState<Field[]>([]);
  const [loadingTargetFields, setLoadingTargetFields] = useState(false);

  /* ---------- Dict selector data ---------- */
  const [availableDicts, setAvailableDicts] = useState<any[]>([]);
  const [selectedDictItems, setSelectedDictItems] = useState<any[]>([]);

  /* ------------------------------------------------------------------ */
  /*  Data fetching                                                      */
  /* ------------------------------------------------------------------ */

  const fetchApp = useCallback(async () => {
    try {
      const { data } = await apiClient.get<AppItem>(`/apps/${appId}`);
      setApp(data);
    } catch {
      showToast(tModels('fetchAppFailed'), 'error');
    }
  }, [appId, showToast, tModels]);

  const fetchModel = useCallback(async () => {
    try {
      const { data } = await apiClient.get<ModelItem>(`/models/${modelId}`);
      setModel(data);
    } catch {
      showToast(tModels('fetchFailed'), 'error');
    }
  }, [modelId, showToast, tModels]);

  const fetchFields = useCallback(async () => {
    try {
      const { data } = await apiClient.get<Field[]>(
        `/models/${modelId}/fields`,
      );
      const allFields = data as Field[];
      setFields(
        allFields
          .filter((f) => !f.isSystem)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      );
      // System fields are platform conventions — use client-side constant
      setSystemFields(SYSTEM_FIELDS_DISPLAY);
    } catch {
      showToast(tFields('fetchFailed'), 'error');
    }
  }, [modelId, showToast, tFields]);

  const fetchViews = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/models/${modelId}/views`);
      setViews(data);
    } catch { /* silent */ }
  }, [modelId]);

  const fetchEntities = useCallback(async () => {
    try {
      const { data } = await apiClient.get<SysEntity[]>(`/models/${modelId}/entities`);
      setEntities(data);
    } catch { /* silent */ }
  }, [modelId]);

  const handleCreateView = useCallback(
    async (data: { name: string; type: 'form' | 'list'; layout: import('@openforge/shared').LayoutConfig }) => {
      const res = await apiClient.post(`/models/${modelId}/views`, data);
      setViews((prev) => [...prev, res.data]);
      showToast(t('designer.createViewSuccess'), 'success');
      // Auto-navigate to designer for the new view
      router.push(`/apps/${appId}/models/${modelId}/designer?viewId=${res.data.id}`);
    },
    [modelId, appId, router, showToast, t],
  );

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchApp(), fetchModel(), fetchFields(), fetchViews(), fetchEntities()]);
      setLoading(false);
    };
    loadAll();
  }, [fetchApp, fetchModel, fetchFields, fetchViews, fetchEntities]);

  const refreshFields = useCallback(async () => {
    await Promise.all([fetchFields(), fetchEntities()]);
  }, [fetchFields, fetchEntities]);

  /* ---------- Distribution Policy ---------- */
  const fetchDistPolicies = useCallback(async () => {
    if (!model || model.dataScope !== 'distributed') return;
    setDistPolicyLoading(true);
    try {
      const { data } = await apiClient.get<DistPolicyItem[]>(`/models/${modelId}/distribution-policies`);
      setDistPolicies(data);
    } catch { /* ignore */ }
    finally { setDistPolicyLoading(false); }
  }, [modelId, model]);

  useEffect(() => {
    if (model?.dataScope === 'distributed' && activeTab === 'distribution-policy') {
      fetchDistPolicies();
    }
  }, [model, activeTab, fetchDistPolicies]);

  const handleDistPolicyToggle = (fieldId: string) => {
    setDistPolicies((prev) => prev.map((p) => p.fieldId === fieldId ? { ...p, editable: !p.editable } : p));
  };

  const handleDistPolicySave = async () => {
    setDistPolicySaving(true);
    try {
      const { data } = await apiClient.put<DistPolicyItem[]>(
        `/models/${modelId}/distribution-policies`,
        distPolicies.map((p) => ({ fieldId: p.fieldId, editable: p.editable })),
      );
      setDistPolicies(data);
      showToast(t('common.saveSuccess'), 'success');
    } catch {
      showToast(t('common.operationFailed'), 'error');
    } finally {
      setDistPolicySaving(false);
    }
  };

  /* ---------- AI suggestions fetching ---------- */
  const fetchSuggestions = useCallback(async () => {
    try {
      const { data } = await apiClient.post<{
        fields?: FieldSuggestion[];
        error?: boolean;
        message?: string;
      }>('/ai/suggest-fields', { modelId });
      if (data.error || !data.fields) return;
      setSuggestions(data.fields);
    } catch {
      // AI unavailable — silently skip
    }
  }, [modelId]);

  useEffect(() => {
    if (fields.length === 0 && !suggestionsDismissed) {
      const dismissed = sessionStorage.getItem(`ai_suggest_dismissed_${modelId}`);
      if (dismissed) {
        setSuggestionsDismissed(true);
        return;
      }
      fetchSuggestions();
    }
  }, [fields.length, suggestionsDismissed, modelId, fetchSuggestions]);

  const fetchAvailableModels = useCallback(async () => {
    try {
      const { data } = await apiClient.get<{ data: ModelItem[] }>(
        `/models?pageSize=200`,
      );
      setAvailableModels((data.data || []).filter((m) => m.id !== modelId));
    } catch {
      /* silent */
    }
  }, [modelId]);

  const fetchDicts = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/apps/${appId}/dicts`);
      setAvailableDicts(data);
    } catch {
      /* silent */
    }
  }, [appId]);

  const fetchTargetModelFields = useCallback(async (targetId: string) => {
    setLoadingTargetFields(true);
    try {
      const { data } = await apiClient.get<Field[]>(`/models/${targetId}/fields`);
      setTargetModelFields(
        (data as Field[]).filter((f) => !f.isSystem && f.deletedAt === null),
      );
    } catch {
      setTargetModelFields([]);
    } finally {
      setLoadingTargetFields(false);
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  /* ---------- AI suggestion actions ---------- */
  const handleAdoptField = async (suggestion: FieldSuggestion) => {
    setAdoptingField(suggestion.name);
    try {
      const payload: any = {
        name: suggestion.name,
        columnName: suggestion.columnName,
        fieldType: suggestion.fieldType,
        isRequired: suggestion.isRequired,
        isUnique: suggestion.isUnique,
        defaultValue: null,
        options: suggestion.semantic ? { semantic: suggestion.semantic } : {},
      };
      await apiClient.post(`/models/${modelId}/fields`, payload);
      setSuggestions((prev) => prev.filter((s) => s.name !== suggestion.name));
      showToast(tFields('createSuccess'), 'success');
      await refreshFields();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tFields('saveFailed')), 'error');
    } finally {
      setAdoptingField(null);
    }
  };

  const handleAdoptAll = async () => {
    setAdoptingAll(true);
    try {
      for (const suggestion of suggestions) {
        const payload: any = {
          name: suggestion.name,
          columnName: suggestion.columnName,
          fieldType: suggestion.fieldType,
          isRequired: suggestion.isRequired,
          isUnique: suggestion.isUnique,
          defaultValue: null,
          options: suggestion.semantic ? { semantic: suggestion.semantic } : {},
        };
        await apiClient.post(`/models/${modelId}/fields`, payload);
      }
      setSuggestions([]);
      setSuggestionsDismissed(true);
      showToast(tFields('createSuccess'), 'success');
      await refreshFields();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tFields('saveFailed')), 'error');
      await refreshFields();
    } finally {
      setAdoptingAll(false);
    }
  };

  const handleDismissSuggestions = () => {
    setSuggestionsDismissed(true);
    sessionStorage.setItem(`ai_suggest_dismissed_${modelId}`, 'true');
  };

  /* ---------- Entity CRUD ---------- */
  const handleOpenEntityDialog = (entity?: SysEntity) => {
    if (entity) {
      setEditingEntity(entity);
      setEntityFormData({ name: entity.name, code: entity.code, entityType: entity.entityType });
      setEntityCodeTouched(true);
    } else {
      setEditingEntity(null);
      setEntityFormData({ name: '', code: '', entityType: 'one_to_one' });
      setEntityCodeTouched(false);
    }
    setEntityDialogOpen(true);
  };

  const handleSubmitEntity = async () => {
    if (!entityFormData.name.trim() || (!editingEntity && !entityFormData.code.trim())) return;
    setEntityFormSubmitting(true);
    try {
      if (editingEntity) {
        await apiClient.put(`/entities/${editingEntity.id}`, { name: entityFormData.name.trim() });
        showToast(tEntities('updateSuccess'), 'success');
      } else {
        await apiClient.post(`/models/${modelId}/entities`, {
          name: entityFormData.name.trim(),
          code: entityFormData.code.trim(),
          entityType: entityFormData.entityType,
        });
        showToast(tEntities('createSuccess'), 'success');
      }
      setEntityDialogOpen(false);
      setEditingEntity(null);
      await fetchEntities();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
    } finally {
      setEntityFormSubmitting(false);
    }
  };

  const handleDeleteEntity = async () => {
    if (!deleteEntityTarget) return;
    setDeleteEntitySubmitting(true);
    try {
      await apiClient.delete(`/entities/${deleteEntityTarget.id}?force=true`);
      showToast(tEntities('deleteSuccess'), 'success');
      setDeleteEntityTarget(null);
      setExpandedEntities((prev) => { const next = new Set(prev); next.delete(deleteEntityTarget.id); return next; });
      await Promise.all([fetchEntities(), fetchFields()]);
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setDeleteEntityTarget(null);
    } finally {
      setDeleteEntitySubmitting(false);
    }
  };

  const toggleEntityExpanded = (entityId: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const handleAddField = () => {
    setEditingField(null);
    const data = { ...defaultFormData };
    setFormData(data);
    drawerInitialData.current = JSON.stringify(data);
    setColumnNameTouched(false);
    setTargetModelFields([]);
    setSelectedDictItems([]);
    setCurrentEntityId(null);

    setDrawerOpen(true);
    fetchAvailableModels();
    fetchDicts();
  };

  const handleAddFieldToEntity = (entityId: string) => {
    setEditingField(null);
    const data = { ...defaultFormData };
    setFormData(data);
    drawerInitialData.current = JSON.stringify(data);
    setColumnNameTouched(false);
    setTargetModelFields([]);
    setSelectedDictItems([]);
    setCurrentEntityId(entityId);

    setDrawerOpen(true);
    fetchAvailableModels();
    fetchDicts();
  };

  const handleEditField = (field: Field) => {
    setEditingField(field);
    setColumnNameTouched(true);
    const opts = field.options || {};
    const data = {
      name: field.name,
      columnName: field.columnName,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      isUnique: field.isUnique,
      defaultValue: field.defaultValue ?? '',
      options: { ...opts },
      semantic: (opts as any).semantic || '',
      aiHint: (opts as any).aiHint || '',
    };
    setFormData(data);
    drawerInitialData.current = JSON.stringify(data);
    setDrawerOpen(true);

    fetchAvailableModels();
    fetchDicts();
    if (field.fieldType === 'REFERENCE' && opts.targetModelId) {
      fetchTargetModelFields(opts.targetModelId);
    } else {
      setTargetModelFields([]);
    }
    // Fetch dict items for ENUM/MULTI_ENUM fields with dictCode
    if ((field.fieldType === 'ENUM' || field.fieldType === 'MULTI_ENUM') && opts.dictCode) {
      // We need dicts to be loaded first, so fetch items directly by finding the dict
      apiClient.get(`/apps/${appId}/dicts`).then(({ data: dicts }) => {
        setAvailableDicts(dicts);
        const dict = (dicts as any[]).find((d: any) => d.code === opts.dictCode);
        if (dict) {
          apiClient.get(`/dicts/${dict.id}`).then(({ data: dictDetail }) => {
            setSelectedDictItems(dictDetail.items || []);
          }).catch(() => setSelectedDictItems([]));
        }
      }).catch(() => { /* silent */ });
    } else {
      setSelectedDictItems([]);
    }
  };

  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const drawerInitialData = useRef<string>('');

  const isDrawerDirty = useCallback(() => {
    return JSON.stringify(formData) !== drawerInitialData.current;
  }, [formData]);

  const handleDrawerClose = () => {
    if (isDrawerDirty()) {
      setUnsavedDialogOpen(true);
      return;
    }
    forceDrawerClose();
  };

  const forceDrawerClose = () => {
    setDrawerOpen(false);
    setEditingField(null);
    setCurrentEntityId(null);
    setUnsavedDialogOpen(false);
  };

  const updateFormField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const updateOptions = (key: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      options: { ...prev.options, [key]: value },
    }));
  };

  const handleFieldTypeChange = (newType: string) => {
    const newOptions: FormData['options'] = {};
    if (newType === 'STRING') {
      newOptions.maxLength = 255;
    } else if (newType === 'DECIMAL') {
      newOptions.scale = 2;
    } else if (newType === 'ENUM' || newType === 'MULTI_ENUM') {
      newOptions.dictCode = '';
    } else if (newType === 'AUTO_NUMBER') {
      newOptions.prefix = '';
      newOptions.dateFormat = 'YYYYMMDD';
      newOptions.digits = 4;
      newOptions.startFrom = 1;
    } else if (newType === 'REFERENCE') {
      newOptions.targetModelId = '';
      newOptions.targetDisplayField = '';
    }
    setFormData((prev) => ({
      ...prev,
      fieldType: newType,
      defaultValue: newType === 'BOOLEAN' ? false : '',
      options: newOptions,
    }));
    setTargetModelFields([]);
  };

  const handleTargetModelChange = (targetId: string) => {
    updateOptions('targetModelId', targetId);
    updateOptions('targetDisplayField', '');
    setTargetModelFields([]);
    if (targetId) {
      fetchTargetModelFields(targetId);
    }
  };

  /* -- Dict selection handler -- */
  const handleDictCodeChange = async (dictCode: string | null) => {
    const code = dictCode || '';
    updateOptions('dictCode', code);
    // Reset default value when dict changes
    setFormData((prev) => ({ ...prev, defaultValue: '' }));
    if (!code) {
      setSelectedDictItems([]);
      return;
    }
    const dict = availableDicts.find((d: any) => d.code === code);
    if (dict) {
      try {
        const { data } = await apiClient.get(`/dicts/${dict.id}`);
        setSelectedDictItems(data.items || []);
      } catch {
        setSelectedDictItems([]);
      }
    }
  };

  /* -- Column name auto-generation -- */
  const handleNameChange = (name: string) => {
    updateFormField('name', name);
    // No auto-generation; user fills column name manually
  };

  /* -- Form validation -- */
  const isColumnNameValid = (col: string) => /^[a-z][a-z0-9_]{0,99}$/.test(col);

  const canSubmitForm = () => {
    if (!formData.name.trim()) return false;
    if (!formData.columnName.trim() || !isColumnNameValid(formData.columnName)) return false;
    if (formData.fieldType === 'ENUM' || formData.fieldType === 'MULTI_ENUM') {
      if (!formData.options.dictCode) return false;
    }
    if (formData.fieldType === 'REFERENCE') {
      if (!formData.options.targetModelId) return false;
    }
    return true;
  };

  /* -- Submit -- */
  const buildUpdatePayload = () => ({
    name: formData.name.trim(),
    isRequired: formData.isRequired,
    isUnique: formData.isUnique,
    defaultValue: formData.defaultValue === '' ? null : formData.defaultValue,
    options: {
      ...formData.options,
      ...(formData.semantic ? { semantic: formData.semantic } : {}),
      ...(formData.aiHint ? { aiHint: formData.aiHint } : {}),
    },
  });

  const handleSubmitField = async () => {
    if (!canSubmitForm()) return;

    // Editing existing field: check if setting isRequired from false to true
    if (editingField && formData.isRequired && !editingField.isRequired) {
      setFormSubmitting(true);
      try {
        const { data } = await apiClient.get(`/fields/${editingField.id}/null-count`);
        if (data.nullCount > 0) {
          // Has NULL data — show backfill dialog
          setBackfillDialog({ nullCount: data.nullCount, pendingPayload: buildUpdatePayload() });
          setBackfillValue('');
          setFormSubmitting(false);
          return;
        }
      } catch {
        // If check fails, proceed and let server handle it
      }
      setFormSubmitting(false);
    }

    await doSubmitField();
  };

  const doSubmitField = async (backfill?: any) => {
    if (!canSubmitForm()) return;
    setFormSubmitting(true);
    try {
      if (editingField) {
        const updatePayload: any = backfill
          ? { ...backfill.payload, backfillValue: backfill.value }
          : buildUpdatePayload();
        await apiClient.put(`/fields/${editingField.id}`, updatePayload);
        showToast(tFields('updateSuccess'), 'success');
      } else {
        const payload: any = {
          ...buildUpdatePayload(),
          columnName: formData.columnName.trim(),
          fieldType: formData.fieldType,
        };
        if (currentEntityId) {
          payload.entityId = currentEntityId;
        }
        await apiClient.post(`/models/${modelId}/fields`, payload);
        showToast(tFields('createSuccess'), 'success');
      }
      forceDrawerClose();
      await refreshFields();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tFields('saveFailed')), 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleBackfillSubmit = async () => {
    if (!backfillDialog || !backfillValue.trim()) return;
    setBackfillSubmitting(true);
    try {
      await doSubmitField({ payload: backfillDialog.pendingPayload, value: backfillValue.trim() });
      setBackfillDialog(null);
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tFields('saveFailed')), 'error');
    } finally {
      setBackfillSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmSubmitting(true);
    try {
      const { field } = confirmAction;
      await apiClient.delete(`/fields/${field.id}`);
      showToast(tFields('deleteSuccess'), 'success');
      setConfirmAction(null);
      await refreshFields();
    } catch (err: unknown) {
      showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
      setConfirmAction(null);
    } finally {
      setConfirmSubmitting(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  // columnName and fieldType are locked for existing fields (all models have physical tables)
  const isFieldLocked = editingField !== null;

  const getFieldTypeLabel = (fieldType: string) => {
    const key = `type${fieldType}` as any;
    return tFields(key);
  };

  const renderFieldTypeBadge = (fieldType: string) => {
    const cls = fieldTypeBadgeClass[fieldType] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    return (
      <Badge variant="outline" className={`${cls} border-0 text-xs`}>
        {getFieldTypeLabel(fieldType)}
      </Badge>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Field drag-and-drop sorting                                        */
  /* ------------------------------------------------------------------ */

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const rootFields = useMemo(() => fields.filter((f) => !f.entityId), [fields]);

  const filteredFields = useMemo(() => {
    const base = rootFields;
    if (!fieldKeyword.trim()) return base;
    const kw = fieldKeyword.trim().toLowerCase();
    return base.filter(
      (f) => f.name.toLowerCase().includes(kw) || f.columnName.toLowerCase().includes(kw),
    );
  }, [rootFields, fieldKeyword]);

  const fieldIds = useMemo(() => filteredFields.map((f) => f.id), [filteredFields]);

  const fieldsByEntityId = useMemo(() => {
    const map = new Map<string, Field[]>();
    for (const f of fields) {
      if (f.entityId) {
        const arr = map.get(f.entityId) ?? [];
        arr.push(f);
        map.set(f.entityId, arr);
      }
    }
    return map;
  }, [fields]);

  const getEntityFields = useCallback((entityId: string) => {
    const ef = fieldsByEntityId.get(entityId) ?? [];
    if (!fieldKeyword.trim()) return ef;
    const kw = fieldKeyword.trim().toLowerCase();
    return ef.filter(
      (f) => f.name.toLowerCase().includes(kw) || f.columnName.toLowerCase().includes(kw),
    );
  }, [fieldsByEntityId, fieldKeyword]);

  const filteredEntities = useMemo(() => {
    if (!fieldKeyword.trim()) return entities;
    const kw = fieldKeyword.trim().toLowerCase();
    return entities.filter((e) => {
      if (e.name.toLowerCase().includes(kw) || e.code.toLowerCase().includes(kw)) return true;
      const ef = fieldsByEntityId.get(e.id) ?? [];
      return ef.some(
        (f) => f.name.toLowerCase().includes(kw) || f.columnName.toLowerCase().includes(kw),
      );
    });
  }, [entities, fieldKeyword, fieldsByEntityId]);

  const filteredSubTables = useMemo(() => {
    if (!subTableKeyword.trim()) return entities;
    const kw = subTableKeyword.trim().toLowerCase();
    return entities.filter(
      (e) => e.name.toLowerCase().includes(kw) || e.code.toLowerCase().includes(kw),
    );
  }, [entities, subTableKeyword]);

  const filteredViews = useMemo(() => {
    let result = views;
    if (viewTypeFilter !== 'all') {
      result = result.filter((v) => v.type === viewTypeFilter);
    }
    if (viewKeyword.trim()) {
      const kw = viewKeyword.trim().toLowerCase();
      result = result.filter((v) => v.name.toLowerCase().includes(kw));
    }
    return result;
  }, [views, viewKeyword, viewTypeFilter]);

  const handleFieldDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Optimistic reorder
      const reordered = [...fields];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setFields(reordered);

      // Persist to backend
      try {
        await apiClient.put(`/models/${modelId}/fields/sort`,
          reordered.map((f, i) => ({ id: f.id, sortOrder: i })),
        );
      } catch {
        // Revert on failure
        fetchFields();
      }
    },
    [fields, modelId, fetchFields],
  );

  const handleEntityDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = entities.findIndex((e) => e.id === active.id);
      const newIndex = entities.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // Optimistic reorder
      const reordered = [...entities];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      setEntities(reordered);

      // Persist to backend
      try {
        await apiClient.put(`/models/${modelId}/entities/sort`,
          reordered.map((e, i) => ({ id: e.id, sortOrder: i })),
        );
      } catch {
        // Revert on failure
        fetchEntities();
      }
    },
    [entities, modelId, fetchEntities],
  );

  /* ------------------------------------------------------------------ */
  /*  Loading skeleton                                                   */
  /* ------------------------------------------------------------------ */

  const renderHeaderSkeleton = () => (
    <div className="border rounded-lg p-5 mb-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-6 bg-muted rounded w-40" />
            <div className="h-5 bg-muted rounded w-14" />
          </div>
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-4 bg-muted rounded w-64" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 bg-muted rounded w-24" />
          <div className="h-9 bg-muted rounded w-24" />
        </div>
      </div>
    </div>
  );

  const renderTableSkeleton = () => (
    <tbody>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-b">
          <td className="p-3 w-10">
            <div className="h-4 bg-muted rounded w-4 animate-pulse" />
          </td>
          <td className="p-3">
            <div className="h-4 bg-muted rounded w-24 animate-pulse" />
          </td>
          <td className="p-3">
            <div className="h-4 bg-muted rounded w-20 animate-pulse" />
          </td>
          <td className="p-3">
            <div className="h-5 bg-muted rounded w-14 animate-pulse" />
          </td>
          <td className="p-3">
            <div className="h-4 bg-muted rounded w-8 animate-pulse" />
          </td>
          <td className="p-3">
            <div className="h-4 bg-muted rounded w-8 animate-pulse" />
          </td>
          <td className="p-3">
            <div className="h-4 bg-muted rounded w-20 animate-pulse" />
          </td>
        </tr>
      ))}
    </tbody>
  );

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

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

      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: tApps('title'), href: '/apps' },
          { label: app?.name || '...', href: `/apps/${appId}` },
          { label: model?.name || '...' },
        ]}
      />

      {/* Model Header */}
      {loading ? (
        renderHeaderSkeleton()
      ) : model ? (
        <div className="border rounded-lg p-5 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-1.5">
                <h2 className="text-xl font-semibold">{model.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-1">
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                  {model.code}
                </code>
              </p>
              {model.description && (
                <p className="text-sm text-muted-foreground">{model.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button onClick={() => router.push(`/apps/${appId}`)} className={btnOutline}>
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                {tCommon('back')}
              </button>
              <button onClick={() => setPreviewType('form')} className={btnOutline}>
                <Eye className="w-4 h-4 mr-1.5" />
                {t('designer.preview')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center border-b">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab('fields')}
              className={`pb-2 text-sm transition-colors relative ${
                activeTab === 'fields'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tFields('title')} ({fields.length})
              {activeTab === 'fields' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('subtables')}
              className={`pb-2 text-sm transition-colors relative ${
                activeTab === 'subtables'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tModels('tabs.subtables')} ({entities.length})
              {activeTab === 'subtables' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('views')}
              className={`pb-2 text-sm transition-colors relative ${
                activeTab === 'views'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('designer.viewList')} ({views.length})
              {activeTab === 'views' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            {model?.dataScope === 'distributed' && (
              <button
                onClick={() => setActiveTab('distribution-policy')}
                className={`pb-2 text-sm transition-colors relative ${
                  activeTab === 'distribution-policy'
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('models.distributionPolicy')}
                {activeTab === 'distribution-policy' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Field toolbar: search + add button */}
      {activeTab === 'fields' && (
        <div className="flex items-center justify-between mb-4">
          {(fields.length > 0 || entities.length > 0) ? (
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={fieldKeyword}
                onChange={(e) => setFieldKeyword(e.target.value)}
                placeholder={tCommon('searchPlaceholder')}
                className="pl-8 pr-8"
              />
              {fieldKeyword && (
                <button
                  onClick={() => setFieldKeyword('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {entities.length === 0 ? (
              <button
                onClick={handleAddField}
                className={btnPrimary}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {tFields('addField')}
              </button>
            ) : (
              <div className="inline-flex items-stretch">
                <button
                  onClick={handleAddField}
                  className={`${btnPrimary} rounded-r-none border-r border-primary-foreground/20`}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  {tFields('addField')}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={`${btnPrimary} rounded-l-none px-2`}
                    aria-label={tFields('addFieldTo')}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{tFields('addFieldTo')}</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleAddField}>
                        {tFields('mainTable')}
                        {model?.name ? (
                          <span className="ml-1 text-xs text-muted-foreground">({model.name})</span>
                        ) : null}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {entities.map((entity) => (
                        <DropdownMenuItem
                          key={entity.id}
                          onClick={() => handleAddFieldToEntity(entity.id)}
                        >
                          {entity.name}
                          <span className="ml-1 text-xs text-muted-foreground">
                            {entity.entityType === 'one_to_one' ? '1:1' : '1:N'}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Suggestion Banner */}
      {activeTab === 'fields' &&
        suggestions.length > 0 &&
        !suggestionsDismissed &&
        !loading && (
        <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-950/30 dark:via-yellow-950/20 dark:to-orange-950/20 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {tAi('suggestBannerTitle')}
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 mb-3">
                {tAi('suggestBannerDesc', { name: model?.name || '' })}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {suggestions.map((s) => {
                  const cls =
                    fieldTypeBadgeClass[s.fieldType] ||
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
                  const isAdopting = adoptingField === s.name || adoptingAll;
                  return (
                    <div
                      key={s.name}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 dark:border-amber-800/50 bg-white/70 dark:bg-white/5 px-2 py-1"
                    >
                      <Badge
                        variant="outline"
                        className={`${cls} border-0 text-xs`}
                      >
                        {getFieldTypeLabel(s.fieldType)}
                      </Badge>
                      <span className="text-sm font-medium text-foreground">
                        {s.name}
                      </span>
                      <button
                        onClick={() => handleAdoptField(s)}
                        disabled={isAdopting}
                        className="inline-flex items-center justify-center rounded h-5 w-5 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        title={s.name}
                      >
                        {adoptingField === s.name ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleAdoptAll}
                  disabled={adoptingAll || adoptingField !== null}
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-3 bg-amber-600 text-white shadow-sm hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {adoptingAll && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  {tAi('acceptAll')}
                </button>
                <button
                  onClick={handleDismissSuggestions}
                  disabled={adoptingAll || adoptingField !== null}
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium h-7 px-3 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {tAi('dismiss')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fields Tab */}
      {activeTab === 'fields' && (
        <>
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
          <div className="border rounded-lg overflow-y-auto max-h-[calc(100vh-26rem)]">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-10" />
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '18%' }} />
                <col className="w-16" />
                <col className="w-16" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted">
                  <th className="p-3" />
                  <th className="p-3 text-left font-medium">{tFields('name')}</th>
                  <th className="p-3 text-left font-medium">{tFields('columnName')}</th>
                  <th className="p-3 text-left font-medium">{tFields('fieldType')}</th>
                  <th className="p-3 text-left font-medium">{tFields('required')}</th>
                  <th className="p-3 text-left font-medium">{tFields('unique')}</th>
                  <th className="p-3 text-left font-medium">{tCommon('actions')}</th>
                </tr>
              </thead>
              {loading ? (
                renderTableSkeleton()
              ) : (
                <>
                <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {filteredFields.length === 0 && filteredEntities.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-3 py-4">
                            <Columns3 className="w-12 h-12 opacity-40" />
                            <p>{rootFields.length === 0 && entities.length === 0 ? tFields('noFields') : tCommon('noData')}</p>
                            {rootFields.length === 0 && entities.length === 0 && (
                              <>
                                <p className="text-xs">{tFields('noFieldsSubtitle')}</p>
                                <button onClick={handleAddField} className={btnPrimary}>
                                  <Plus className="w-4 h-4 mr-1" />
                                  {tFields('addField')}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredFields.map((field) => (
                        <SortableFieldRow
                          key={field.id}
                          field={field}
                          renderFieldTypeBadge={renderFieldTypeBadge}
                          tFields={tFields}
                          tCommon={tCommon}
                          onEdit={() => handleEditField(field)}
                          onDelete={() => setConfirmAction({ field })}
                        />
                      ))
                    )}
                  </tbody>
                </SortableContext>
                {/* Entity rows */}
                {filteredEntities.map((entity) => {
                  const isExpanded = expandedEntities.has(entity.id);
                  const entityFields = getEntityFields(entity.id);
                  return (
                    <tbody key={entity.id}>
                      <tr className="border-b bg-muted/20">
                        <td colSpan={7} className="p-0">
                          <button
                            onClick={() => toggleEntityExpanded(entity.id)}
                            className="flex items-center gap-2 w-full px-3 py-2.5 text-left"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-medium text-sm">{entity.name}</span>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                              {entity.code}
                            </code>
                            <Badge variant="outline" className="border-0 text-xs bg-muted">
                              {entity.entityType === 'one_to_one' ? tEntities('entityTypeOneToOne') : tEntities('entityTypeOneToMany')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {tEntities('fieldCount', { count: entity._count?.fields ?? entityFields.length })}
                            </span>
                          </button>
                        </td>
                      </tr>
                      {isExpanded && entityFields.length > 0 && entityFields.map((field) => (
                        <tr
                          key={field.id}
                          onClick={() => handleEditField(field)}
                          className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                        >
                          <td className="p-3 w-10">
                            <div className="ml-2 border-l-2 border-muted-foreground/20 h-full" />
                          </td>
                          <td className="p-3 font-medium pl-8">{field.name}</td>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono" style={{ fontSize: '12px' }}>
                              {field.columnName}
                            </code>
                          </td>
                          <td className="p-3">{renderFieldTypeBadge(field.fieldType)}</td>
                          <td className="p-3 text-muted-foreground">
                            {field.isRequired ? (
                              <span className="text-foreground font-medium">{tFields('yes')}</span>
                            ) : (
                              <span>{tFields('no')}</span>
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {field.isUnique ? (
                              <span className="text-foreground font-medium">{tFields('yes')}</span>
                            ) : (
                              <span>{tFields('no')}</span>
                            )}
                          </td>
                          <td className="p-3" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setConfirmAction({ field })}
                              className={`${btnGhost} text-destructive hover:text-destructive`}
                            >
                              {tCommon('delete')}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {isExpanded && entityFields.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-8 py-4 text-center text-sm text-muted-foreground border-b">
                            <button
                              onClick={() => handleAddFieldToEntity(entity.id)}
                              className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              {tEntities('addField')}
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  );
                })}
                </>
              )}
              {/* System Fields — inside same table */}
              {!loading && systemFields.length > 0 && (
                <>
                  <tbody>
                    <tr className="border-t bg-muted/30">
                      <td colSpan={7} className="p-0">
                        <button
                          onClick={() => setSystemFieldsOpen(!systemFieldsOpen)}
                          className="w-full flex items-center gap-2 p-3 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                        >
                          {systemFieldsOpen ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                          <span className="font-medium">{tFields('systemFields')}</span>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                  {systemFieldsOpen && (
                    <tbody>
                      {systemFields.map((field) => (
                        <tr
                          key={field.id}
                          className="border-t hover:bg-muted/20 transition-colors text-muted-foreground"
                        >
                          <td className="p-3 w-10" />
                          <td className="p-3 font-medium">{field.name}</td>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono" style={{ fontSize: '12px' }}>
                              {field.columnName}
                            </code>
                          </td>
                          <td className="p-3">{renderFieldTypeBadge(field.fieldType)}</td>
                          <td className="p-3">
                            {field.isRequired ? (
                              <span className="font-medium">{tFields('yes')}</span>
                            ) : (
                              <span>{tFields('no')}</span>
                            )}
                          </td>
                          <td className="p-3">
                            {field.isUnique ? (
                              <span className="font-medium">{tFields('yes')}</span>
                            ) : (
                              <span>{tFields('no')}</span>
                            )}
                          </td>
                          <td className="p-3" />
                        </tr>
                      ))}
                    </tbody>
                  )}
                </>
              )}
            </table>
          </div>
          </DndContext>
        </>
      )}

      {/* Sub Tables Tab */}
      {activeTab === 'subtables' && (
        <>
          <div className="flex items-center justify-between mb-4">
            {entities.length > 0 ? (
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={subTableKeyword}
                  onChange={(e) => setSubTableKeyword(e.target.value)}
                  placeholder={tCommon('searchPlaceholder')}
                  className="pl-8 pr-8"
                />
                {subTableKeyword && (
                  <button
                    onClick={() => setSubTableKeyword('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div />
            )}
            <button
              onClick={() => handleOpenEntityDialog()}
              className={btnPrimary}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {tEntities('create')}
            </button>
          </div>

          <div className="border rounded-lg overflow-y-auto max-h-[calc(100vh-26rem)]">
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleEntityDragEnd}
            >
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-10" />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '15%' }} />
                  <col />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr className="border-b bg-muted">
                    <th />
                    <th className="p-3 text-left font-medium">{tEntities('name')}</th>
                    <th className="p-3 text-left font-medium">{tEntities('code')}</th>
                    <th className="p-3 text-left font-medium">{tEntities('entityType')}</th>
                    <th className="p-3 text-left font-medium">{tModels('fieldCountLabel')}</th>
                    <th className="p-3 text-left font-medium">{tCommon('actions')}</th>
                  </tr>
                </thead>
                {loading ? (
                  <tbody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b">
                        <td colSpan={6} className="p-3">
                          <div className="h-4 bg-muted rounded w-full animate-pulse" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ) : filteredSubTables.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-3 py-4">
                          <TableProperties className="w-12 h-12 opacity-40" />
                          <p>{entities.length === 0 ? tEntities('noSubTables') : tCommon('noData')}</p>
                          {entities.length === 0 && (
                            <>
                              <p className="text-xs">{tEntities('noSubTablesSubtitle')}</p>
                              <button onClick={() => handleOpenEntityDialog()} className={btnPrimary}>
                                <Plus className="w-4 h-4 mr-1" />
                                {tEntities('create')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <SortableContext
                    items={filteredSubTables.map((e) => e.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <tbody>
                      {filteredSubTables.map((entity) => {
                        const count = entity._count?.fields ?? fieldsByEntityId.get(entity.id)?.length ?? 0;
                        return (
                          <SortableSubTableRow
                            key={entity.id}
                            entity={entity}
                            fieldCountText={tEntities('fieldCount', { count })}
                            entityTypeText={
                              entity.entityType === 'one_to_one'
                                ? tEntities('entityTypeOneToOne')
                                : tEntities('entityTypeOneToMany')
                            }
                            deleteText={tCommon('delete')}
                            onEdit={() => handleOpenEntityDialog(entity)}
                            onDelete={() => setDeleteEntityTarget(entity)}
                          />
                        );
                      })}
                    </tbody>
                  </SortableContext>
                )}
              </table>
            </DndContext>
          </div>
        </>
      )}

      {/* Views Tab */}
      {activeTab === 'views' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {views.length > 0 && (
                <>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={viewKeyword}
                      onChange={(e) => setViewKeyword(e.target.value)}
                      placeholder={tCommon('searchPlaceholder')}
                      className="pl-8 pr-8"
                    />
                    {viewKeyword && (
                      <button
                        onClick={() => setViewKeyword('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-sm">
                    {(['all', 'form', 'list'] as const).map((ft) => (
                      <button
                        key={ft}
                        onClick={() => setViewTypeFilter(ft)}
                        className={`px-3 py-1 rounded-sm transition-colors ${
                          viewTypeFilter === ft
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {ft === 'all' ? tCommon('statusAll') : ft === 'form' ? t('designer.formView') : t('designer.listView')}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => setCreateViewOpen(true)}
              className={btnPrimary}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {t('designer.newView')}
            </button>
          </div>
          <div className="border rounded-lg overflow-y-auto max-h-[calc(100vh-26rem)]">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: '30%' }} />
                <col className="w-24" />
                <col style={{ width: '25%' }} />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted">
                  <th className="p-3 text-left font-medium">{tFields('name')}</th>
                  <th className="p-3 text-left font-medium">{t('designer.viewType')}</th>
                  <th className="p-3 text-left font-medium">{tCommon('updatedAt')}</th>
                  <th className="p-3 text-left font-medium">{tCommon('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredViews.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-3 py-4">
                        <Paintbrush className="w-12 h-12 opacity-40" />
                        <p>{views.length === 0 ? t('designer.emptyTitle') : tCommon('noData')}</p>
                        {views.length === 0 && (
                          <>
                            <p className="text-xs">{t('designer.emptyHint')}</p>
                            <button
                              onClick={() => setCreateViewOpen(true)}
                              className={btnPrimary}
                            >
                              <Plus className="w-4 h-4 mr-1.5" />
                              {t('designer.newView')}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredViews.map((view) => (
                    <tr
                      key={view.id}
                      onClick={() => router.push(`/apps/${appId}/models/${modelId}/designer?viewId=${view.id}`)}
                      className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="p-3 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          {view.name}
                          {view.isDefault && (
                            <Badge variant="outline" className="border-0 text-xs bg-primary/10 text-primary gap-0.5">
                              <Star className="w-3 h-3 fill-current" />
                              {t('designer.defaultView')}
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="border-0 text-xs bg-muted">
                          {view.type === 'form' ? t('designer.formView') : t('designer.listView')}
                        </Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {view.updatedAt ? new Date(view.updatedAt).toLocaleString('zh-CN') : '-'}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-1">
                          {!view.isDefault && (
                            <button
                              onClick={async () => {
                                try {
                                  await apiClient.put(`/views/${view.id}/set-default`);
                                  setViews((prev) =>
                                    prev.map((v) =>
                                      v.type === view.type
                                        ? { ...v, isDefault: v.id === view.id }
                                        : v,
                                    ),
                                  );
                                  showToast(t('designer.setDefaultSuccess'), 'success');
                                } catch (err: unknown) {
                                  showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
                                }
                              }}
                              className={btnGhost}
                            >
                              {t('designer.setDefault')}
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteViewTarget(view)}
                            className={`${btnGhost} text-destructive hover:text-destructive`}
                          >
                            {tCommon('delete')}
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Create view dialog */}
      <CreateViewDialog
        open={createViewOpen}
        onClose={() => setCreateViewOpen(false)}
        onSubmit={handleCreateView}
        views={views}
      />

      {/* Delete view confirm */}
      {deleteViewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{t('designer.deleteView')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t('designer.confirmDeleteView', { name: deleteViewTarget.name })}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteViewTarget(null)} className={btnOutline}>
                {tCommon('cancel')}
              </button>
              <button
                onClick={async () => {
                  try {
                    await apiClient.delete(`/views/${deleteViewTarget.id}`);
                    // Re-fetch views to reflect server-side default promotion
                    await fetchViews();
                    showToast(t('designer.deleteViewSuccess'), 'success');
                  } catch (err: unknown) {
                    showToast(getApiErrorMessage(err, tErrors, tCommon('operationFailed')), 'error');
                  }
                  setDeleteViewTarget(null);
                }}
                className={btnDestructive}
              >
                {tCommon('confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entity create/edit dialog */}
      {entityDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">
              {editingEntity ? tEntities('editTitle') : tEntities('createTitle')}
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="entity-name">{tEntities('name')}</Label>
                <Input
                  id="entity-name"
                  value={entityFormData.name}
                  onChange={(e) => setEntityFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={tEntities('namePlaceholder')}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="entity-code">{tEntities('code')}</Label>
                <Input
                  id="entity-code"
                  value={entityFormData.code}
                  onChange={(e) => {
                    setEntityFormData((prev) => ({ ...prev, code: e.target.value }));
                    setEntityCodeTouched(true);
                  }}
                  placeholder={tEntities('codePlaceholder')}
                  disabled={!!editingEntity}
                  className="font-mono text-xs"
                />
                {editingEntity && (
                  <p className="text-xs text-muted-foreground">{tEntities('codeReadonly')}</p>
                )}
                {entityCodeTouched && entityFormData.code && !isColumnNameValid(entityFormData.code) && (
                  <p className="text-xs text-destructive">{tEntities('codeInvalid')}</p>
                )}
              </div>
              {!editingEntity && (
                <div className="space-y-1.5">
                  <Label>{tEntities('entityType')}</Label>
                  <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-sm">
                    {(['one_to_one', 'one_to_many'] as const).map((et) => (
                      <button
                        key={et}
                        onClick={() => setEntityFormData((prev) => ({ ...prev, entityType: et }))}
                        className={`px-3 py-1.5 rounded-sm transition-colors ${
                          entityFormData.entityType === et
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {et === 'one_to_one' ? tEntities('entityTypeOneToOne') : tEntities('entityTypeOneToMany')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => { setEntityDialogOpen(false); setEditingEntity(null); }}
                className={btnOutline}
                disabled={entityFormSubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleSubmitEntity}
                disabled={
                  entityFormSubmitting ||
                  !entityFormData.name.trim() ||
                  (!editingEntity && (!entityFormData.code.trim() || !isColumnNameValid(entityFormData.code)))
                }
                className={btnPrimary}
              >
                {entityFormSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    {tCommon('processing')}
                  </>
                ) : (
                  tCommon('save')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entity delete confirm */}
      {deleteEntityTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-2">
              {tEntities('confirmDelete', { name: deleteEntityTarget.name })}
            </p>
            {(deleteEntityTarget._count?.fields ?? 0) > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
                {tEntities('hasData')}
              </p>
            )}
            <div className="flex gap-2 justify-end mt-4">
              <button
                onClick={() => setDeleteEntityTarget(null)}
                className={btnOutline}
                disabled={deleteEntitySubmitting}
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleDeleteEntity}
                disabled={deleteEntitySubmitting}
                className={btnDestructive}
              >
                {deleteEntitySubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    {tCommon('processing')}
                  </>
                ) : (
                  tCommon('confirmDeleteBtn')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Distribution Policy tab content */}
      {activeTab === 'distribution-policy' && model?.dataScope === 'distributed' && (
        <div className="mt-4">
          {distPolicyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : distPolicies.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {t('models.distributionPolicyEmpty')}
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">{t('models.distributionPolicyDesc')}</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left py-2.5 px-4 font-medium">{t('fields.fieldName')}</th>
                      <th className="text-left py-2.5 px-4 font-medium">{t('fields.columnName')}</th>
                      <th className="text-left py-2.5 px-4 font-medium">{t('fields.fieldType')}</th>
                      <th className="text-center py-2.5 px-4 font-medium">{t('models.distributionEditable')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distPolicies.map((p) => (
                      <tr key={p.fieldId} className="border-t hover:bg-muted/30">
                        <td className="py-2.5 px-4">{p.fieldName}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{p.columnName}</td>
                        <td className="py-2.5 px-4">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{p.fieldType}</span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => handleDistPolicyToggle(p.fieldId)}
                            className={`inline-flex items-center justify-center w-10 h-5 rounded-full transition-colors ${
                              p.editable ? 'bg-primary' : 'bg-muted-foreground/30'
                            }`}
                          >
                            <span className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${
                              p.editable ? 'translate-x-2.5' : '-translate-x-2.5'
                            }`} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleDistPolicySave}
                  disabled={distPolicySaving}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium h-9 px-4 py-2 bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                >
                  {distPolicySaving ? t('common.processing') : t('common.save')}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Field editor drawer */}
      <Sheet open={drawerOpen} onOpenChange={(open) => { if (!open) handleDrawerClose(); }}>
        <SheetContent side="right" className="w-[380px] sm:w-[380px] sm:max-w-[380px] !overflow-hidden flex flex-col" showCloseButton={false}>
          <SheetHeader className="flex flex-row items-center justify-between pr-0 shrink-0 border-b">
            <SheetTitle>{editingField ? tFields('editField') : tFields('addField')}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-6 px-4 pb-4 flex-1 overflow-y-auto">
            {/* ===== A. Basic Properties ===== */}
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {tFields('basicInfo')}
              </h4>
              <div className="space-y-3">
                {/* Field Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="field-name">{tFields('name')}</Label>
                  <Input
                    id="field-name"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder={tFields('namePlaceholder')}
                  />
                </div>

                {/* Column Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="field-column">{tFields('columnName')}</Label>
                  <Input
                    id="field-column"
                    value={formData.columnName}
                    onChange={(e) => {
                      updateFormField('columnName', e.target.value);
                      setColumnNameTouched(true);
                    }}
                    placeholder={tFields('columnNamePlaceholder')}
                    disabled={isFieldLocked}
                    className="font-mono text-xs"
                  />
                  {isFieldLocked && (
                    <p className="text-xs text-muted-foreground">{tFields('columnNameReadonly')}</p>
                  )}
                  {columnNameTouched && formData.columnName && !isColumnNameValid(formData.columnName) && (
                    <p className="text-xs text-destructive">{tFields('columnNameInvalid')}</p>
                  )}
                </div>

                {/* Field Type */}
                <div className="space-y-1.5">
                  <Label>{tFields('fieldType')}</Label>
                  {isFieldLocked ? (
                    <>
                      <div className="flex items-center h-8 px-2.5 rounded-lg border border-input bg-input/50 opacity-60">
                        {renderFieldTypeBadge(formData.fieldType)}
                      </div>
                      <p className="text-xs text-muted-foreground">{tFields('fieldTypeReadonly')}</p>
                    </>
                  ) : (
                    <Select
                      value={formData.fieldType}
                      onValueChange={(val) => handleFieldTypeChange(val as string)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={tFields('selectFieldType')}>
                          {formData.fieldType ? renderFieldTypeBadge(formData.fieldType) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          { label: tFields('groupBasic'), types: ['STRING', 'TEXT', 'RICHTEXT', 'INTEGER', 'DECIMAL', 'BOOLEAN'] },
                          { label: tFields('groupDateTime'), types: ['DATE', 'DATETIME', 'TIME'] },
                          { label: tFields('groupChoice'), types: ['ENUM', 'MULTI_ENUM', 'AUTO_NUMBER'] },
                          { label: tFields('groupRelation'), types: ['REFERENCE', 'MULTI_REFERENCE'] },
                          { label: tFields('groupSystem'), types: ['USER', 'ORGANIZATION'] },
                          { label: tFields('groupFile'), types: ['FILE', 'IMAGE'] },
                        ].map((group, gi) => (
                          <SelectGroup key={group.label}>
                            {gi > 0 && <SelectSeparator />}
                            <SelectLabel>{group.label}</SelectLabel>
                            {group.types.map((ft) => (
                              <SelectItem key={ft} value={ft}>
                                <span className="flex items-center gap-2">
                                  <Badge variant="outline" className={`${fieldTypeBadgeClass[ft] || ''} border-0 text-xs`}>
                                    {getFieldTypeLabel(ft)}
                                  </Badge>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </section>

            {/* ===== B. Constraints ===== */}
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {tFields('constraints')}
              </h4>
              <div className="space-y-3">
                {/* Required */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={formData.isRequired}
                    onCheckedChange={(checked) => updateFormField('isRequired', checked)}
                  />
                  <Label className="cursor-pointer">{tFields('required')}</Label>
                </div>

                {/* Unique */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={formData.isUnique}
                    onCheckedChange={(checked) => updateFormField('isUnique', checked)}
                  />
                  <Label className="cursor-pointer">{tFields('unique')}</Label>
                </div>

                {/* Default Value */}
                {formData.fieldType !== 'REFERENCE' && formData.fieldType !== 'AUTO_NUMBER' && (
                  <div className="space-y-1.5">
                    <Label>{tFields('defaultValue')}</Label>
                    {formData.fieldType === 'BOOLEAN' ? (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={formData.defaultValue === true}
                          onCheckedChange={(checked) => updateFormField('defaultValue', checked)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {formData.defaultValue === true ? tFields('yes') : tFields('no')}
                        </span>
                      </div>
                    ) : formData.fieldType === 'INTEGER' ? (
                      <Input
                        type="number"
                        value={formData.defaultValue}
                        onChange={(e) => updateFormField('defaultValue', e.target.value ? parseInt(e.target.value, 10) : '')}
                      />
                    ) : formData.fieldType === 'DECIMAL' ? (
                      <Input
                        type="number"
                        step="any"
                        value={formData.defaultValue}
                        onChange={(e) => updateFormField('defaultValue', e.target.value ? parseFloat(e.target.value) : '')}
                      />
                    ) : (formData.fieldType === 'ENUM' || formData.fieldType === 'MULTI_ENUM') ? (
                      <Select
                        value={formData.defaultValue || null}
                        onValueChange={(val) => updateFormField('defaultValue', val === '__none__' ? '' : val)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={`${tFields('defaultValue')}...`}>
                            {formData.defaultValue
                              ? selectedDictItems.find((item: any) => item.value === formData.defaultValue)?.label || formData.defaultValue
                              : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-muted-foreground">
                            {tFields('noDefault')}
                          </SelectItem>
                          {selectedDictItems.filter((item: any) => item.value).map((item: any) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label || item.value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={formData.defaultValue ?? ''}
                        onChange={(e) => updateFormField('defaultValue', e.target.value)}
                      />
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ===== C. Type-specific Config ===== */}
            {(formData.fieldType === 'STRING' ||
              formData.fieldType === 'DECIMAL' ||
              formData.fieldType === 'ENUM' ||
              formData.fieldType === 'MULTI_ENUM' ||
              formData.fieldType === 'AUTO_NUMBER' ||
              formData.fieldType === 'REFERENCE') && (
              <section>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {tFields('typeConfig')}
                </h4>
                <div className="space-y-3">
                  {/* STRING: maxLength */}
                  {formData.fieldType === 'STRING' && (
                    <div className="space-y-1.5">
                      <Label>{tFields('maxLength')}</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        value={formData.options.maxLength ?? 255}
                        onChange={(e) => updateOptions('maxLength', e.target.value ? parseInt(e.target.value, 10) : 255)}
                      />
                    </div>
                  )}

                  {/* DECIMAL: scale (小数位数) */}
                  {formData.fieldType === 'DECIMAL' && (
                    <div className="space-y-1.5">
                      <Label>{tFields('decimalPlaces')}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={8}
                        value={formData.options.scale ?? 2}
                        onChange={(e) => updateOptions('scale', e.target.value ? parseInt(e.target.value, 10) : 2)}
                      />
                    </div>
                  )}

                  {/* ENUM / MULTI_ENUM: dict selector */}
                  {(formData.fieldType === 'ENUM' || formData.fieldType === 'MULTI_ENUM') && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>{tDicts('selectDict')}</Label>
                        <Select
                          value={formData.options.dictCode ?? null}
                          onValueChange={handleDictCodeChange}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={tDicts('selectDict')}>
                              {formData.options.dictCode
                                ? availableDicts.find((d: any) => d.code === formData.options.dictCode)?.name ?? formData.options.dictCode
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {availableDicts.length === 0 ? (
                              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                                {tDicts('noData')}
                              </div>
                            ) : (
                              availableDicts.map((d: any) => (
                                <SelectItem key={d.id} value={d.code}>
                                  {d.name}
                                  <span className="text-xs text-muted-foreground ml-2">{d.code}</span>
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Preview dict items when selected */}
                      {formData.options.dictCode && selectedDictItems.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">{tDicts('items')}</Label>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedDictItems.map((item: any) => (
                              <span
                                key={item.id}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted"
                                style={item.color ? { backgroundColor: `${item.color}20`, color: item.color } : undefined}
                              >
                                {item.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {formData.options.dictCode && selectedDictItems.length === 0 && (
                        <div className="text-xs text-muted-foreground">
                          {tDicts('itemCount', { count: availableDicts.find((d: any) => d.code === formData.options.dictCode)?._count?.items || 0 })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AUTO_NUMBER: prefix, dateFormat, digits, startFrom */}
                  {formData.fieldType === 'AUTO_NUMBER' && (
                    <>
                      <div className="space-y-1.5">
                        <Label>{tFields('prefix')}</Label>
                        <Input
                          value={formData.options.prefix ?? ''}
                          onChange={(e) => updateOptions('prefix', e.target.value)}
                          placeholder="e.g. ORD"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{tFields('dateFormat')}</Label>
                        <Select
                          value={formData.options.dateFormat || 'YYYYMMDD'}
                          onValueChange={(val) => updateOptions('dateFormat', val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DATE_FORMAT_OPTIONS.map((fmt) => (
                              <SelectItem key={fmt} value={fmt}>
                                {fmt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>{tFields('digits')}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={formData.options.digits ?? 4}
                          onChange={(e) => updateOptions('digits', e.target.value ? parseInt(e.target.value, 10) : 4)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{tFields('startFrom')}</Label>
                        <Input
                          type="number"
                          min={0}
                          value={formData.options.startFrom ?? 1}
                          onChange={(e) => updateOptions('startFrom', e.target.value ? parseInt(e.target.value, 10) : 1)}
                        />
                      </div>
                    </>
                  )}

                  {/* REFERENCE: targetModel + targetDisplayField */}
                  {formData.fieldType === 'REFERENCE' && (
                    <>
                      <div className="space-y-1.5">
                        <Label>{tFields('targetModel')}</Label>
                        <Popover open={modelDropdownOpen} onOpenChange={setModelDropdownOpen}>
                          <PopoverTrigger
                            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <span className={formData.options.targetModelId ? '' : 'text-muted-foreground'}>
                              {(() => {
                                const m = availableModels.find((m) => m.id === formData.options.targetModelId);
                                if (!m) return formData.options.targetModelId || tFields('selectModel');
                                return m.appId !== appId ? `${m.app?.name} / ${m.name}` : m.name;
                              })()}
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </PopoverTrigger>
                          <PopoverContent className="w-[--anchor-width] p-0" align="start">
                            <Command filter={(value, search) => {
                              const m = availableModels.find((model) => model.id === value);
                              if (!m) return 0;
                              const haystack = `${m.name} ${m.code} ${m.app?.name || ''}`.toLowerCase();
                              return haystack.includes(search.toLowerCase()) ? 1 : 0;
                            }}>
                              <CommandInput placeholder={tCommon('searchPlaceholder')} />
                              <CommandList>
                                <CommandEmpty>{tFields('noModelsAvailable')}</CommandEmpty>
                                {Object.entries(
                                  availableModels.reduce<Record<string, ModelItem[]>>((groups, m) => {
                                    const appName = m.app?.name || '—';
                                    (groups[appName] ??= []).push(m);
                                    return groups;
                                  }, {}),
                                ).map(([appName, models]) => (
                                  <CommandGroup key={appName} heading={appName}>
                                    {models.map((m) => (
                                      <CommandItem
                                        key={m.id}
                                        value={m.id}
                                        data-checked={formData.options.targetModelId === m.id}
                                        onSelect={() => { handleTargetModelChange(m.id); setModelDropdownOpen(false); }}
                                      >
                                        {m.name}
                                        <code className="text-xs text-muted-foreground font-mono">{m.code}</code>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                ))}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      {formData.options.targetModelId && (
                        <div className="space-y-1.5">
                          <Label>{tFields('targetDisplayField')}</Label>
                          {loadingTargetFields ? (
                            <div className="flex items-center gap-2 h-8 px-2.5 text-xs text-muted-foreground">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              {tCommon('loading')}
                            </div>
                          ) : (
                            <Select
                              value={formData.options.targetDisplayField || null}
                              onValueChange={(val) => updateOptions('targetDisplayField', val)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder={tFields('selectField')}>
                                  {targetModelFields.find((f) => f.columnName === formData.options.targetDisplayField)?.name ?? formData.options.targetDisplayField}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {targetModelFields.length === 0 ? (
                                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                                    {tFields('noFieldsAvailable')}
                                  </div>
                                ) : (
                                  targetModelFields.map((f) => (
                                    <SelectItem key={f.id} value={f.columnName}>
                                      <span className="flex items-center gap-1.5">
                                        {f.name}
                                        <code className="text-xs text-muted-foreground font-mono">{f.columnName}</code>
                                      </span>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}

            {/* ===== D. AI Semantic ===== */}
            <section>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {tFields('aiSemantic')}
              </h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{tFields('semantic')}</Label>
                  <Textarea
                    value={formData.semantic}
                    onChange={(e) => updateFormField('semantic', e.target.value)}
                    placeholder={tFields('semanticPlaceholder')}
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{tFields('aiHint')}</Label>
                  <Textarea
                    value={formData.aiHint}
                    onChange={(e) => updateFormField('aiHint', e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* ===== E. Footer Actions ===== */}
          <SheetFooter className="flex-row justify-end gap-2 border-t pt-4 shrink-0">
            <button
              type="button"
              onClick={handleDrawerClose}
              className={btnOutline}
              disabled={formSubmitting}
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitField}
              className={btnPrimary}
              disabled={formSubmitting || !canSubmitForm()}
            >
              {formSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  {tFields('saving')}
                </>
              ) : (
                tCommon('save')
              )}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Unsaved Changes Dialog */}
      {unsavedDialogOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tFields('unsavedTitle')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {tFields('unsavedMessage')}
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setUnsavedDialogOpen(false)} className={btnOutline}>
                {tCommon('cancel')}
              </button>
              <button onClick={forceDrawerClose} className={btnDestructive}>
                {tFields('unsavedDiscard')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm bg-card border rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-2">{tCommon('actionConfirm')}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {tFields('confirmDelete', { name: confirmAction.field.name })}
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
                className={btnDestructive}
              >
                {confirmSubmitting
                  ? tCommon('processing')
                  : tCommon('confirmDeleteBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backfill Dialog — set required with existing null data */}
      <Dialog open={!!backfillDialog} onOpenChange={(open) => { if (!open) setBackfillDialog(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tFields('backfillTitle')}</DialogTitle>
            <DialogDescription>
              {tFields('backfillDescription', { count: backfillDialog?.nullCount ?? 0 })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{tFields('backfillValue')}</Label>
            <Input
              value={backfillValue}
              onChange={(e) => setBackfillValue(e.target.value)}
              placeholder={tFields('backfillPlaceholder')}
              autoFocus
            />
          </div>
          <DialogFooter>
            <button onClick={() => setBackfillDialog(null)} className={btnOutline} disabled={backfillSubmitting}>
              {tCommon('cancel')}
            </button>
            <button
              onClick={handleBackfillSubmit}
              disabled={backfillSubmitting || !backfillValue.trim()}
              className={btnPrimary}
            >
              {backfillSubmitting ? tCommon('processing') : tFields('backfillConfirm')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Default Layout Preview Dialog */}
      {previewType && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-medium">
              {t('designer.preview')} — {previewType === 'form' ? t('designer.formView') : t('designer.listView')}
            </h2>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center rounded-md border bg-background p-0.5 text-sm">
                {(['form', 'list'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setPreviewType(type)}
                    className={`px-3 py-1 rounded-sm transition-colors ${
                      previewType === type
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {type === 'form' ? t('designer.formView') : t('designer.listView')}
                  </button>
                ))}
              </div>
              <button onClick={() => setPreviewType(null)} className={btnOutline}>
                <X className="w-4 h-4 mr-1.5" />
                {tCommon('close')}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <PreviewMode
              layout={
                previewType === 'form'
                  ? ((views.find(v => v.type === 'form' && v.isDefault) ?? views.find(v => v.type === 'form'))?.layout
                    ?? generateDefaultFormLayout(
                        (fields as SharedField[]).filter(f => !(f as any).entityId),
                        entities.map(e => ({ id: e.id, code: e.code, entityType: e.entityType })),
                      ))
                  : ((views.find(v => v.type === 'list' && v.isDefault) ?? views.find(v => v.type === 'list'))?.layout
                    ?? generateDefaultListLayout((fields as SharedField[]).filter(f => !(f as any).entityId)))
              }
              viewType={previewType}
              fields={(fields as SharedField[]).filter(f => !(f as any).entityId)}
              entities={entities.map(e => ({
                ...e,
                fields: fields.filter(f => (f as any).entityId === e.id) as SharedField[],
              }))}
            />
          </div>
        </div>
      )}

    </div>
  );
}
