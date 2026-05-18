import { type WorkflowDefinitionFE } from '@/lib/api/workflow';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  build: () => WorkflowDefinitionFE;
}

const baseApproveConfig = {
  assigneeStrategy: 'fixed',
  assigneeConfig: { userIds: [] },
  mode: 'or',
  onEmpty: 'pass',
  autoSkipDuplicates: true,
  autoSkipSubmitter: true,
  allowedActions: {
    approve: true,
    reject: true,
    transfer: true,
    addBefore: true,
    addAfter: true,
    returnPrev: true,
    returnStart: true,
  },
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'empty',
    name: '空白流程',
    description: '只有开始和结束节点，由你自由设计',
    build: () => ({
      nodes: [
        { id: 'start-1', type: 'start', name: '开始', position: { x: 100, y: 200 }, config: {} },
        { id: 'end-1', type: 'end', name: '结束', position: { x: 400, y: 200 }, config: {} },
      ],
      edges: [{ id: 'e1', from: 'start-1', to: 'end-1' }],
    }),
  },
  {
    id: 'single',
    name: '单级审批',
    description: '提交人 → 一人审批 → 完成（最常见的请假/报销场景）',
    build: () => ({
      nodes: [
        { id: 'start-1', type: 'start', name: '开始', position: { x: 100, y: 200 }, config: {} },
        {
          id: 'app-1',
          type: 'approve',
          name: '审批人',
          position: { x: 300, y: 200 },
          config: { ...baseApproveConfig },
        },
        { id: 'end-1', type: 'end', name: '结束', position: { x: 500, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'app-1' },
        { id: 'e2', from: 'app-1', to: 'end-1' },
      ],
    }),
  },
  {
    id: 'nlevel',
    name: '两级串行审批',
    description: '提交人 → 一级审批 → 二级审批 → 完成（适合需要层级签字的场景）',
    build: () => ({
      nodes: [
        { id: 'start-1', type: 'start', name: '开始', position: { x: 80, y: 200 }, config: {} },
        {
          id: 'app-1',
          type: 'approve',
          name: '直属主管',
          position: { x: 260, y: 200 },
          config: { ...baseApproveConfig },
        },
        {
          id: 'app-2',
          type: 'approve',
          name: '部门总监',
          position: { x: 460, y: 200 },
          config: { ...baseApproveConfig },
        },
        { id: 'end-1', type: 'end', name: '结束', position: { x: 660, y: 200 }, config: {} },
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'app-1' },
        { id: 'e2', from: 'app-1', to: 'app-2' },
        { id: 'e3', from: 'app-2', to: 'end-1' },
      ],
    }),
  },
  {
    id: 'conditional',
    name: '按金额分流',
    description: '小额 → 单级审批；大额 → 两级审批（条件可在节点图中调整阈值）',
    build: () => ({
      nodes: [
        { id: 'start-1', type: 'start', name: '开始', position: { x: 60, y: 240 }, config: {} },
        {
          id: 'cond-1',
          type: 'condition',
          name: '金额判断',
          position: { x: 220, y: 240 },
          config: {
            branches: [
              {
                name: '小额',
                // 默认条件留空 placeholder — 用户进入编辑器后配置实际字段
                condition: { op: 'and', conditions: [] },
                targetNodeId: 'app-low',
                isDefault: true,
              },
              {
                name: '大额',
                condition: { op: 'and', conditions: [] },
                targetNodeId: 'app-high-1',
                isDefault: false,
              },
            ],
          },
        },
        {
          id: 'app-low',
          type: 'approve',
          name: '普通审批',
          position: { x: 420, y: 360 },
          config: { ...baseApproveConfig },
        },
        {
          id: 'app-high-1',
          type: 'approve',
          name: '高级审批 (一级)',
          position: { x: 420, y: 120 },
          config: { ...baseApproveConfig },
        },
        {
          id: 'app-high-2',
          type: 'approve',
          name: '高级审批 (二级)',
          position: { x: 620, y: 120 },
          config: { ...baseApproveConfig },
        },
        { id: 'end-1', type: 'end', name: '结束', position: { x: 820, y: 240 }, config: {} },
      ],
      edges: [
        { id: 'e1', from: 'start-1', to: 'cond-1' },
        { id: 'e2', from: 'cond-1', to: 'app-low' },
        { id: 'e3', from: 'cond-1', to: 'app-high-1' },
        { id: 'e4', from: 'app-high-1', to: 'app-high-2' },
        { id: 'e5', from: 'app-high-2', to: 'end-1' },
        { id: 'e6', from: 'app-low', to: 'end-1' },
      ],
    }),
  },
];
