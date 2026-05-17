import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowCompletedListener } from '../workflow-completed.listener';

describe('WorkflowCompletedListener', () => {
  let listener: WorkflowCompletedListener;
  let prisma: any;

  const baseInstance = {
    id: 'inst-1',
    modelId: 'model-1',
    recordId: '550e8400-e29b-41d4-a716-446655440000',
  };

  beforeEach(() => {
    prisma = {
      sysModel: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'model-1',
          code: 'lead',
          app: { code: 'crm' },
        }),
      },
      sysWorkflowTask: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
    listener = new WorkflowCompletedListener(prisma);
  });

  it('approved: updates data_status="approved" and sets approved_by/at from last approver', async () => {
    prisma.sysWorkflowTask.findFirst.mockResolvedValue({
      assigneeUserId: '770e8400-e29b-41d4-a716-446655440002',
    });

    await listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('"data_status" = $1'),
      'approved',
      baseInstance.recordId,
    );
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('"approved_by" = $1::uuid'),
      '770e8400-e29b-41d4-a716-446655440002',
      baseInstance.recordId,
    );
    // table name composed from app.code + model.code
    expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('biz."crm_lead"');
  });

  it('approved with no approver found: sets approved_at only (no approved_by)', async () => {
    prisma.sysWorkflowTask.findFirst.mockResolvedValue(null);

    await listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(2);
    const secondCall = prisma.$executeRawUnsafe.mock.calls[1];
    expect(secondCall[0]).toContain('"approved_at" = NOW()');
    expect(secondCall[0]).not.toContain('"approved_by"');
    expect(secondCall[1]).toBe(baseInstance.recordId);
  });

  it('rejected: updates data_status="draft"', async () => {
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'rejected' });

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('"data_status" = $1'),
      'draft',
      baseInstance.recordId,
    );
    expect(prisma.sysWorkflowTask.findFirst).not.toHaveBeenCalled();
  });

  it('returned: updates data_status="draft"', async () => {
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'returned' });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('"data_status" = $1'),
      'draft',
      baseInstance.recordId,
    );
  });

  it('withdrawn: updates data_status="draft"', async () => {
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'withdrawn' });
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('"data_status" = $1'),
      'draft',
      baseInstance.recordId,
    );
  });

  it('cancelled: no-op (DataStatusService.unapprove writes data_status="reaudit" directly)', async () => {
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'cancelled' });
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.sysModel.findUnique).not.toHaveBeenCalled();
  });

  it('unknown finalStatus: no-op', async () => {
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'something-else' });
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('missing model: logs warn and returns without UPDATE', async () => {
    prisma.sysModel.findUnique.mockResolvedValue(null);
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' });
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('missing instance payload: logs warn and returns', async () => {
    await listener.onCompleted({ instance: null as any, finalStatus: 'approved' });
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(prisma.sysModel.findUnique).not.toHaveBeenCalled();
  });

  it('UPDATE failure: caught and logged, does not throw', async () => {
    prisma.$executeRawUnsafe.mockRejectedValue(new Error('db is down'));
    await expect(
      listener.onCompleted({ instance: baseInstance, finalStatus: 'rejected' }),
    ).resolves.toBeUndefined();
  });
});
