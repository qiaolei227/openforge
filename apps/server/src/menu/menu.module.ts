import { Global, Module } from '@nestjs/common';
import { MenuSyncService } from './menu-sync.service';
import { MenuService } from './menu.service';
import { MenuController } from './menu.controller';
import { MENU_DEF_TOKEN } from '@openforge/shared';
import { SYS_MANAGEMENT_GROUP, SYS_MENUS } from './menu.menus';
import { SYS_USERS } from '../user/user.menu';
import { SYS_ORGS } from '../org/org.menu';
import { SYS_ROLES } from '../role/role.menus';
import { SYS_CONFIG } from '../config-param/config.menu';
import { SYS_DESIGNER } from '../app-mgmt/designer.menu';

// NestJS multi-provider aggregation across modules is unreliable, so every
// coded MenuDef is imported explicitly here. This creates a one-way dependency
// from MenuModule → other modules' menu files — acceptable and cycle-free.
const ALL_MENU_DEFS = [
  SYS_MANAGEMENT_GROUP,
  SYS_MENUS,
  SYS_USERS,
  SYS_ORGS,
  SYS_ROLES,
  SYS_CONFIG,
  SYS_DESIGNER,
];

@Global()
@Module({
  controllers: [MenuController],
  providers: [
    MenuSyncService,
    MenuService,
    { provide: MENU_DEF_TOKEN, useValue: ALL_MENU_DEFS },
  ],
  exports: [MenuSyncService, MenuService],
})
export class MenuModule {}
