import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';

@Module({
  imports: [AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway],
  exports: [NotificationService],
})
export class NotificationModule {}
