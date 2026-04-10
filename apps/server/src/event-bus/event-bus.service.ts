import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseEvent } from './events';

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(private eventEmitter: EventEmitter2) {}

  emit(eventName: string, event: BaseEvent): void {
    this.logger.debug(`Emitting event: ${eventName}`);
    this.eventEmitter.emit(eventName, event);
  }

  async emitAsync(eventName: string, event: BaseEvent): Promise<void> {
    this.logger.debug(`Emitting async event: ${eventName}`);
    await this.eventEmitter.emitAsync(eventName, event);
  }
}
