import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma/prisma.service';
import { EventBusModule } from './event-bus/event-bus.module';
import { AuthModule } from './auth/auth.module';
import { OrgModule } from './org/org.module';
import { UserModule } from './user/user.module';
import { ConfigParamModule } from './config-param/config-param.module';
import { AppMgmtModule } from './app-mgmt/app-mgmt.module';
import { ModelModule } from './model/model.module';
import { EntityModule } from './entity/entity.module';
import { DynamicDataModule } from './dynamic-data/dynamic-data.module';
import { AiModule } from './ai/ai.module';
import { DictModule } from './dict/dict.module';
import { ViewModule } from './view/view.module';
import { FileModule } from './file/file.module';
import { SetupModule } from './setup/setup.module';
import { PermissionModule } from './common/permission/permission.module';
import { MenuModule } from './menu/menu.module';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { OrgInterceptor } from './common/interceptors/org.interceptor';
import { FieldPermissionInterceptor } from './common/interceptors/field-permission.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import configuration from './config/configuration';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    EventEmitterModule.forRoot(),
    EventBusModule,
    AuthModule,
    OrgModule,
    UserModule,
    ConfigParamModule,
    AppMgmtModule,
    ModelModule,
    EntityModule,
    DynamicDataModule,
    DictModule,
    AiModule,
    ViewModule,
    FileModule,
    SetupModule,
    PermissionModule,
    MenuModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: OrgInterceptor },
    { provide: APP_INTERCEPTOR, useClass: FieldPermissionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [PrismaService],
})
export class AppModule {}
