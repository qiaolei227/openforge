import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowLockHelper } from '../workflow-lock.helper';

describe('WorkflowLockHelper', () => {
  let helper: WorkflowLockHelper;
  let redis: any;

  beforeEach(() => {
    helper = new WorkflowLockHelper();
    redis = {
      set: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    (helper as any).redis = redis;
  });

  it('acquires lock and releases after fn completes', async () => {
    redis.set.mockResolvedValue('OK');
    const fn = vi.fn().mockResolvedValue('result');
    const r = await helper.withLock('i1', fn);
    expect(redis.set).toHaveBeenCalledWith('workflow:instance:i1', '1', 'PX', 10000, 'NX');
    expect(fn).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('workflow:instance:i1');
    expect(r).toBe('result');
  });

  it('uses custom ttl when provided', async () => {
    redis.set.mockResolvedValue('OK');
    await helper.withLock('i1', vi.fn().mockResolvedValue(undefined), 30000);
    expect(redis.set).toHaveBeenCalledWith('workflow:instance:i1', '1', 'PX', 30000, 'NX');
  });

  it('throws WORKFLOW_CONCURRENT_UPDATE when lock not acquired', async () => {
    redis.set.mockResolvedValue(null);
    const fn = vi.fn();
    await expect(helper.withLock('i1', fn)).rejects.toMatchObject({
      errorCode: 'WORKFLOW_CONCURRENT_UPDATE',
    });
    expect(fn).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it('releases lock when fn throws', async () => {
    redis.set.mockResolvedValue('OK');
    await expect(
      helper.withLock('i1', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(redis.del).toHaveBeenCalledWith('workflow:instance:i1');
  });

  it('does not throw when redis.del fails during release', async () => {
    redis.set.mockResolvedValue('OK');
    redis.del.mockRejectedValue(new Error('redis down'));
    const r = await helper.withLock('i1', vi.fn().mockResolvedValue('ok'));
    expect(r).toBe('ok');
  });

  it('onModuleDestroy closes redis connection', async () => {
    await helper.onModuleDestroy();
    expect(redis.quit).toHaveBeenCalled();
  });
});
