'use client';

import { useEffect, useState } from 'react';
import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Props {
  node: Node;
  onUpdate: (config: any, name?: string) => void;
  onDelete: () => void;
}

const NODE_TYPE_LABEL: Record<string, string> = {
  start: '开始',
  end: '结束',
  approve: '审批',
  cc: '抄送',
  condition: '条件',
  'parallel-fork': '并行分支',
  'parallel-join': '并行合流',
};

export function NodeConfigPanel({ node, onUpdate, onDelete }: Props) {
  const config = ((node.data as any)?.config ?? {}) as Record<string, any>;
  const name = ((node.data as any)?.name ?? node.type ?? '') as string;
  const [localName, setLocalName] = useState(name);

  useEffect(() => {
    setLocalName(((node.data as any)?.name ?? node.type ?? '') as string);
  }, [node.id, node.data, node.type]);

  const commitName = () => {
    if (localName !== name) onUpdate(config, localName);
  };

  const updateField = (key: string, value: any) => {
    onUpdate({ ...config, [key]: value }, localName);
  };

  const typeLabel = NODE_TYPE_LABEL[node.type as string] ?? node.type ?? '';
  const isFixed = node.type === 'start' || node.type === 'end';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm">节点配置</h3>
          <p className="text-xs text-muted-foreground mt-0.5">类型：{typeLabel}</p>
        </div>
        {!isFixed && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            title="删除节点"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!isFixed && (
        <div className="space-y-1.5">
          <Label htmlFor="node-name">名称</Label>
          <Input
            id="node-name"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            onBlur={commitName}
            placeholder="节点名称"
          />
        </div>
      )}

      {node.type === 'approve' && (
        <ApproveConfig config={config} updateField={updateField} />
      )}
      {node.type === 'cc' && (
        <CcConfig config={config} updateField={updateField} />
      )}
      {node.type === 'condition' && (
        <ConditionConfig config={config} updateField={updateField} />
      )}
      {node.type === 'parallel-join' && (
        <ParallelJoinConfig config={config} updateField={updateField} />
      )}
      {isFixed && (
        <p className="text-xs text-muted-foreground">
          {node.type === 'start'
            ? '开始节点是流程入口，没有额外配置。'
            : '结束节点是流程出口，没有额外配置。'}
        </p>
      )}
    </div>
  );
}

interface ConfigFieldProps {
  config: Record<string, any>;
  updateField: (key: string, value: any) => void;
}

/** Toggle styled as a switch, matching WorkflowListTab pattern (no Switch primitive in this repo). */
function ToggleSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex items-center justify-start h-5 w-10 rounded-full transition-colors shrink-0',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <span
          className={cn(
            'inline-block w-3.5 h-3.5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  );
}

function ApproveConfig({ config, updateField }: ConfigFieldProps) {
  const assigneeConfig = (config.assigneeConfig ?? {}) as Record<string, any>;
  const setAssignee = (kv: Record<string, any>) =>
    updateField('assigneeConfig', { ...assigneeConfig, ...kv });

  const strategy = config.assigneeStrategy ?? 'fixed';
  const mode = config.mode ?? 'and';
  const onEmpty = config.onEmpty ?? 'pass';
  const onTimeout = config.onTimeout ?? 'notify';
  const timeoutHours = config.timeoutHours;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>审批人策略</Label>
        <Select
          value={strategy}
          onValueChange={(v) => updateField('assigneeStrategy', v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">固定用户</SelectItem>
            <SelectItem value="role">角色</SelectItem>
            <SelectItem value="org">组织</SelectItem>
            <SelectItem value="submitterUpline">提交人上级</SelectItem>
            <SelectItem value="userField">表单用户字段</SelectItem>
            <SelectItem value="orgField">表单组织字段</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {strategy === 'fixed' && (
        <div className="space-y-1.5">
          <Label>用户 IDs (逗号分隔)</Label>
          <Input
            value={(assigneeConfig.userIds ?? []).join(',')}
            onChange={(e) =>
              setAssignee({
                userIds: e.target.value
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="user-id-1, user-id-2"
          />
        </div>
      )}
      {strategy === 'role' && (
        <div className="space-y-1.5">
          <Label>角色 IDs (逗号分隔)</Label>
          <Input
            value={(assigneeConfig.roleIds ?? []).join(',')}
            onChange={(e) =>
              setAssignee({
                roleIds: e.target.value
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="role-id-1, role-id-2"
          />
        </div>
      )}
      {strategy === 'org' && (
        <div className="space-y-1.5">
          <Label>组织 IDs (逗号分隔)</Label>
          <Input
            value={(assigneeConfig.orgIds ?? []).join(',')}
            onChange={(e) =>
              setAssignee({
                orgIds: e.target.value
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="org-id-1, org-id-2"
          />
        </div>
      )}
      {strategy === 'submitterUpline' && (
        <div className="space-y-1.5">
          <Label>向上 N 级</Label>
          <Input
            type="number"
            min={1}
            value={assigneeConfig.upLevel ?? 1}
            onChange={(e) =>
              setAssignee({ upLevel: Number(e.target.value) || 1 })
            }
          />
        </div>
      )}
      {(strategy === 'userField' || strategy === 'orgField') && (
        <div className="space-y-1.5">
          <Label>字段列名 (columnName)</Label>
          <Input
            value={assigneeConfig.fieldColumnName ?? ''}
            onChange={(e) =>
              setAssignee({ fieldColumnName: e.target.value })
            }
            placeholder="assignee_user / department_id"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label>多人签批模式</Label>
        <Select value={mode} onValueChange={(v) => updateField('mode', v)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">会签（全员同意）</SelectItem>
            <SelectItem value="or">或签（任一同意）</SelectItem>
            <SelectItem value="sequential">顺序签</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>无审批人时</Label>
        <Select
          value={onEmpty}
          onValueChange={(v) => updateField('onEmpty', v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pass">自动通过</SelectItem>
            <SelectItem value="fallback">转给默认审批人</SelectItem>
            <SelectItem value="error">报错</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ToggleSwitch
        id="autoSkipDuplicates"
        checked={config.autoSkipDuplicates ?? true}
        onChange={(v) => updateField('autoSkipDuplicates', v)}
        label="自动跳过重复审批人"
      />
      <ToggleSwitch
        id="autoSkipSubmitter"
        checked={config.autoSkipSubmitter ?? true}
        onChange={(v) => updateField('autoSkipSubmitter', v)}
        label="自动跳过提交人"
      />

      <div className="space-y-1.5">
        <Label>超时小时数（可选）</Label>
        <Input
          type="number"
          min={0}
          step={0.5}
          value={timeoutHours ?? ''}
          onChange={(e) =>
            updateField(
              'timeoutHours',
              e.target.value === '' ? undefined : Number(e.target.value),
            )
          }
          placeholder="留空表示不超时"
        />
      </div>

      {typeof timeoutHours === 'number' && timeoutHours > 0 && (
        <div className="space-y-1.5">
          <Label>超时策略</Label>
          <Select
            value={onTimeout}
            onValueChange={(v) => updateField('onTimeout', v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="notify">仅提醒</SelectItem>
              <SelectItem value="autoApprove">自动通过</SelectItem>
              <SelectItem value="autoReject">自动驳回</SelectItem>
              <SelectItem value="transferTo">转交</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function CcConfig({ config, updateField }: ConfigFieldProps) {
  // CC node reuses approve assignee picker, plus dedup-across-instance toggle.
  return (
    <div className="space-y-4">
      <ApproveAssigneeOnly config={config} updateField={updateField} />
      <ToggleSwitch
        id="dedupAcrossInstance"
        checked={config.dedupAcrossInstance ?? true}
        onChange={(v) => updateField('dedupAcrossInstance', v)}
        label="同一流程内去重"
      />
    </div>
  );
}

/** Approver picker without the heavy approval-mode/timeout/etc. options. Used by CC. */
function ApproveAssigneeOnly({ config, updateField }: ConfigFieldProps) {
  const assigneeConfig = (config.assigneeConfig ?? {}) as Record<string, any>;
  const setAssignee = (kv: Record<string, any>) =>
    updateField('assigneeConfig', { ...assigneeConfig, ...kv });
  const strategy = config.assigneeStrategy ?? 'fixed';
  return (
    <>
      <div className="space-y-1.5">
        <Label>抄送人策略</Label>
        <Select
          value={strategy}
          onValueChange={(v) => updateField('assigneeStrategy', v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">固定用户</SelectItem>
            <SelectItem value="role">角色</SelectItem>
            <SelectItem value="org">组织</SelectItem>
            <SelectItem value="userField">表单用户字段</SelectItem>
            <SelectItem value="orgField">表单组织字段</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {strategy === 'fixed' && (
        <div className="space-y-1.5">
          <Label>用户 IDs (逗号分隔)</Label>
          <Input
            value={(assigneeConfig.userIds ?? []).join(',')}
            onChange={(e) =>
              setAssignee({
                userIds: e.target.value
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="user-id-1, user-id-2"
          />
        </div>
      )}
      {strategy === 'role' && (
        <div className="space-y-1.5">
          <Label>角色 IDs (逗号分隔)</Label>
          <Input
            value={(assigneeConfig.roleIds ?? []).join(',')}
            onChange={(e) =>
              setAssignee({
                roleIds: e.target.value
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}
      {strategy === 'org' && (
        <div className="space-y-1.5">
          <Label>组织 IDs (逗号分隔)</Label>
          <Input
            value={(assigneeConfig.orgIds ?? []).join(',')}
            onChange={(e) =>
              setAssignee({
                orgIds: e.target.value
                  .split(',')
                  .map((s: string) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}
      {(strategy === 'userField' || strategy === 'orgField') && (
        <div className="space-y-1.5">
          <Label>字段列名 (columnName)</Label>
          <Input
            value={assigneeConfig.fieldColumnName ?? ''}
            onChange={(e) =>
              setAssignee({ fieldColumnName: e.target.value })
            }
            placeholder="cc_user / cc_department_id"
          />
        </div>
      )}
    </>
  );
}

function ConditionConfig({ config, updateField }: ConfigFieldProps) {
  const branches = config.branches ?? [];
  const [draft, setDraft] = useState(() => JSON.stringify(branches, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  // Re-sync when the selected node changes externally
  useEffect(() => {
    setDraft(JSON.stringify(config.branches ?? [], null, 2));
    setParseError(null);
  }, [config.branches]);

  const handleChange = (text: string) => {
    setDraft(text);
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setParseError('必须是 JSON 数组');
        return;
      }
      setParseError(null);
      updateField('branches', parsed);
    } catch (e: any) {
      setParseError('JSON 解析错误: ' + (e?.message ?? ''));
    }
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="branches">分支配置 (JSON)</Label>
      <textarea
        id="branches"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full min-h-[200px] rounded-md border bg-background p-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        spellCheck={false}
      />
      {parseError && (
        <p className="text-xs text-destructive">{parseError}</p>
      )}
      <p className="text-xs text-muted-foreground">
        每个分支需包含 name / condition / targetNodeId / isDefault（可选）。出口连线应与分支顺序匹配。
      </p>
    </div>
  );
}

function ParallelJoinConfig({ config, updateField }: ConfigFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label>合流模式</Label>
      <Select
        value={config.joinMode ?? 'and'}
        onValueChange={(v) => updateField('joinMode', v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="and">AND（全部到齐）</SelectItem>
          <SelectItem value="or">OR（任一到齐）</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
