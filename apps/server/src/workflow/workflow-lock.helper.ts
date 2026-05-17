import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrorCodes } from '../common/exceptions/error-codes';

/**
 * Distributed lock for workflow instance state transitions.
 *
 * Uses Redis SETNX (`SET key value PX <ttl> NX`) to ensure only one
 * decide/transfer/return/withdraw operation runs against an instance at a time.
 *
 * Lock TTL defaults to 10s — long enough for a complete state-machine pass
 * inside a $transaction, short enough that a crashed worker doesn't block forever.
 */
@Injectable()
export class WorkflowLockHelper implements OnModuleDestroy {
  private readonly logger = new Logger(WorkflowLockHelper.name);
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  async withLock<T>(instanceId: string, fn: () => Promise<T>, ttlMs = 10000): Promise<T> {
    const key = `workflow:instance:${instanceId}`;
    const acquired = await this.redis.set(key, '1', 'PX', ttlMs, 'NX');
    if (!acquired) {
      throw new BusinessException(
        409,
        ErrorCodes.WORKFLOW_CONCURRENT_UPDATE,
        'Instance is being processed by another operation',
      );
    }
    try {
      return await fn();
    } finally {
      await this.redis.del(key).catch((err) => {
        this.logger.warn(`Failed to release workflow lock ${key}: ${err?.message ?? err}`);
      });
    }
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => {});
  }
}
