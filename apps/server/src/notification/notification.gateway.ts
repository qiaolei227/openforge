import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ path: '/api/ws', cors: { origin: true, credentials: true } })
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    @Inject(JwtService) private jwt: JwtService,
    @Inject(ConfigService) private configService: ConfigService,
  ) {}

  onModuleInit() {
    this.logger.log('NotificationGateway initialized at /api/ws');
  }

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth as any)?.token as string | undefined;
      if (!token) throw new Error('No token');
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });
      // JWT payload uses `userId` (not `sub`) — see AuthService.login
      const userId = payload.userId;
      if (!userId) throw new Error('Invalid token payload');
      client.data.userId = userId;
      client.join(`user:${userId}`);
      const orgId =
        ((client.handshake.auth as any)?.orgId as string | undefined) ?? payload.orgId;
      if (orgId) client.join(`org:${orgId}`);
      this.logger.debug(`Socket connected: user=${userId} socket=${client.id}`);
    } catch (e) {
      this.logger.warn(`Socket auth failed: ${(e as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('switch-org')
  switchOrg(@ConnectedSocket() client: Socket, @MessageBody() body: { orgId: string }) {
    for (const room of Array.from(client.rooms)) {
      if (room.startsWith('org:')) client.leave(room);
    }
    if (body?.orgId) client.join(`org:${body.orgId}`);
    return { ok: true };
  }

  @OnEvent('notification.created')
  emitNotification(notif: { userId: string; [k: string]: any }) {
    this.server.to(`user:${notif.userId}`).emit('notification:created', notif);
  }

  @OnEvent('workflow.inbox.new')
  emitInboxNew(payload: { userId: string; [k: string]: any }) {
    this.server.to(`user:${payload.userId}`).emit('inbox:new', payload);
  }

  @OnEvent('workflow.inbox.done')
  emitInboxDone(payload: { userId: string; [k: string]: any }) {
    this.server.to(`user:${payload.userId}`).emit('inbox:done', payload);
  }

  @OnEvent('workflow.state.changed')
  emitWorkflowState(payload: { userId: string; [k: string]: any }) {
    this.server.to(`user:${payload.userId}`).emit('workflow:state-changed', payload);
  }
}
