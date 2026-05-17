import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowCompletedListener } from '../workflow-completed.listener';

describe('WorkflowCompletedListener', () => {
  let listener: WorkflowCompletedListener;
  let prisma: any;
  let readonlyPropagation: any;

  const baseInstance = {
    id: 'inst-1',
    modelId: 'model-1',
    recordId: '550e8400-e29b-41d4-a716-446655440000',
  };

  // Default model: NOT distributed (P2.2 private scope)
  function setupModel(opts: { distributed?: boolean } = {}) {
    prisma.sysModel.findUnique.mockResolvedValue({
      id: 'model-1',
      code: 'lead',
      app: { code: 'crm' },
      dataScope: opts.distributed ? 'distributed' : 'private',
      fields: [],
    });
  }

  beforeEach(() => {
    prisma = {
      sysModel: {
        findUnique: vi.fn(),
      },
      sysWorkflowTask: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    };
    readonlyPropagation = {
      propagate: vi.fn().mockResolvedValue(undefined),
    };
    listener = new WorkflowCompletedListener(prisma, readonlyPropagation);
    setupModel();
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

  // ──────────────────────────────────────────────────────────────────────
  //  P2.3 K2: propagation to distributed copies
  // ──────────────────────────────────────────────────────────────────────

  it('non-distributed model: does NOT call readonlyPropagation.propagate', async () => {
    setupModel({ distributed: false });
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' });
    expect(readonlyPropagation.propagate).not.toHaveBeenCalled();
  });

  it("distributed model + finalStatus='approved': propagates data_status + approved_by + approved_at", async () => {
    setupModel({ distributed: true });
    prisma.sysWorkflowTask.findFirst.mockResolvedValue({
      assigneeUserId: 'u-approver',
    });

    await listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' });

    expect(readonlyPropagation.propagate).toHaveBeenCalledTimes(1);
    const [, model, masterId, changes] = readonlyPropagation.propagate.mock.calls[0];
    expect(model).toMatchObject({ id: 'model-1', tableName: 'crm_lead' });
    expect(masterId).toBe(baseInstance.recordId);
    expect(changes.data_status).toBe('approved');
    expect(changes.approved_by).toBe('u-approver');
    expect(changes.approved_at).toBeInstanceOf(Date);
  });

  it("distributed model + finalStatus='approved' but no approver found: propagates data_status + approved_at only", async () => {
    setupModel({ distributed: true });
    prisma.sysWorkflowTask.findFirst.mockResolvedValue(null);

    await listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' });

    expect(readonlyPropagation.propagate).toHaveBeenCalledTimes(1);
    const [, , , changes] = readonlyPropagation.propagate.mock.calls[0];
    expect(changes.data_status).toBe('approved');
    expect(changes.approved_by).toBeUndefined();
    expect(changes.approved_at).toBeInstanceOf(Date);
  });

  it("distributed model + finalStatus='rejected': propagates data_status='draft' only", async () => {
    setupModel({ distributed: true });
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'rejected' });

    expect(readonlyPropagation.propagate).toHaveBeenCalledTimes(1);
    const [, , , changes] = readonlyPropagation.propagate.mock.calls[0];
    expect(changes.data_status).toBe('draft');
    expect(changes.approved_by).toBeUndefined();
    expect(changes.approved_at).toBeUndefined();
  });

  it("distributed model + finalStatus='withdrawn': propagates data_status='draft'", async () => {
    setupModel({ distributed: true });
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'withdrawn' });

    expect(readonlyPropagation.propagate).toHaveBeenCalledTimes(1);
    const [, , , changes] = readonlyPropagation.propagate.mock.calls[0];
    expect(changes.data_status).toBe('draft');
  });

  it('propagation failure: caught and logged, does not throw', async () => {
    setupModel({ distributed: true });
    readonlyPropagation.propagate.mockRejectedValueOnce(new Error('replica db down'));
    await expect(
      listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' }),
    ).resolves.toBeUndefined();
  });

  it('master UPDATE failure: skips propagation', async () => {
    setupModel({ distributed: true });
    prisma.$executeRawUnsafe.mockRejectedValueOnce(new Error('master db down'));
    await listener.onCompleted({ instance: baseInstance, finalStatus: 'approved' });
    expect(readonlyPropagation.propagate).not.toHaveBeenCalled();
  });
});
