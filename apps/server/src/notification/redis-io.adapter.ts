import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplicationContext, Logger } from '@nestjs/common';

/**
 * Socket.IO adapter backed by ioredis pub/sub so notifications fan out
 * across multiple server processes / pods. Without it, an emit on one node
 * only reaches sockets connected to that same node.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: any;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(url: string): Promise<void> {
    const pub = new Redis(url);
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
    this.logger.log(`Redis adapter connected to ${url}`);
  }

  override createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
