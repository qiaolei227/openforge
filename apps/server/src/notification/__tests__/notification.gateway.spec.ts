import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationGateway } from '../notification.gateway';

function makeSocket(overrides: Partial<any> = {}) {
  const rooms = new Set<string>(['some-socket-id']);
  return {
    id: 'socket-1',
    handshake: { auth: {} as any },
    data: {} as any,
    rooms,
    join: vi.fn((room: string) => {
      rooms.add(room);
    }),
    leave: vi.fn((room: string) => {
      rooms.delete(room);
    }),
    disconnect: vi.fn(),
    ...overrides,
  };
}

function makeServer() {
  const emit = vi.fn();
  const to = vi.fn().mockReturnValue({ emit });
  return { server: { to } as any, emit, to };
}

describe('NotificationGateway', () => {
  let gateway: NotificationGateway;
  let jwt: any;
  let configService: any;

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn() };
    configService = { get: vi.fn().mockReturnValue('test-secret') };
    gateway = new NotificationGateway(jwt as any, configService as any);
    const { server } = makeServer();
    gateway.server = server;
  });

  describe('handleConnection', () => {
    it('rejects connection without token by disconnecting', async () => {
      const client = makeSocket();

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins user:{userId} room on valid token', async () => {
      const client = makeSocket({ handshake: { auth: { token: 't1' } } });
      jwt.verifyAsync.mockResolvedValue({ userId: 'u1' });

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user:u1');
      expect(client.data.userId).toBe('u1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('joins org:{orgId} room when orgId in handshake', async () => {
      const client = makeSocket({
        handshake: { auth: { token: 't1', orgId: 'org-9' } },
      });
      jwt.verifyAsync.mockResolvedValue({ userId: 'u1' });

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('user:u1');
      expect(client.join).toHaveBeenCalledWith('org:org-9');
    });

    it('disconnects when jwt verify fails', async () => {
      const client = makeSocket({ handshake: { auth: { token: 'bad' } } });
      jwt.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('switchOrg', () => {
    it('leaves old org rooms and joins the new one', () => {
      const client = makeSocket();
      client.rooms.add('org:old-1');
      client.rooms.add('org:old-2');
      client.rooms.add('user:u1');

      const result = gateway.switchOrg(client as any, { orgId: 'org-new' });

      expect(client.leave).toHaveBeenCalledWith('org:old-1');
      expect(client.leave).toHaveBeenCalledWith('org:old-2');
      expect(client.leave).not.toHaveBeenCalledWith('user:u1');
      expect(client.join).toHaveBeenCalledWith('org:org-new');
      expect(result).toEqual({ ok: true });
    });
  });

  describe('event emissions', () => {
    it('emitNotification emits to user:{userId} room with notification:created event', () => {
      const innerEmit = vi.fn();
      const to = vi.fn().mockReturnValue({ emit: innerEmit });
      gateway.server = { to } as any;

      gateway.emitNotification({ userId: 'u1', id: 'n1', title: 'Hi' } as any);

      expect(to).toHaveBeenCalledWith('user:u1');
      expect(innerEmit).toHaveBeenCalledWith(
        'notification:created',
        expect.objectContaining({ userId: 'u1', id: 'n1' }),
      );
    });

    it('emitInboxNew emits inbox:new to user room', () => {
      const innerEmit = vi.fn();
      const to = vi.fn().mockReturnValue({ emit: innerEmit });
      gateway.server = { to } as any;

      gateway.emitInboxNew({ userId: 'u2', inboxId: 'i1' } as any);

      expect(to).toHaveBeenCalledWith('user:u2');
      expect(innerEmit).toHaveBeenCalledWith(
        'inbox:new',
        expect.objectContaining({ userId: 'u2', inboxId: 'i1' }),
      );
    });

    it('emitInboxDone emits inbox:done to user room', () => {
      const innerEmit = vi.fn();
      const to = vi.fn().mockReturnValue({ emit: innerEmit });
      gateway.server = { to } as any;

      gateway.emitInboxDone({ userId: 'u3', inboxId: 'i2' } as any);

      expect(to).toHaveBeenCalledWith('user:u3');
      expect(innerEmit).toHaveBeenCalledWith(
        'inbox:done',
        expect.objectContaining({ userId: 'u3', inboxId: 'i2' }),
      );
    });

    it('emitWorkflowState emits workflow:state-changed to user room', () => {
      const innerEmit = vi.fn();
      const to = vi.fn().mockReturnValue({ emit: innerEmit });
      gateway.server = { to } as any;

      gateway.emitWorkflowState({ userId: 'u4', instanceId: 'wf1', state: 'approved' } as any);

      expect(to).toHaveBeenCalledWith('user:u4');
      expect(innerEmit).toHaveBeenCalledWith(
        'workflow:state-changed',
        expect.objectContaining({ userId: 'u4', state: 'approved' }),
      );
    });
  });
});
