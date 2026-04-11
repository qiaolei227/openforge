import { Global, Module } from '@nestjs/common';
import { MenuSyncService } from './menu-sync.service';
import { MENU_DEF_TOKEN } from '@openforge/shared';
import { SYS_MANAGEMENT_GROUP, SYS_MENUS } from './menu.menus';
import { SYS_USERS } from '../user/user.menu';
import { SYS_ORGS } from '../org/org.menu';
import { SYS_ROLES } from '../role/role.menus';
import { SYS_CONFIG } from '../config-param/config.menu';
import { SYS_DESIGNER } from '../app-mgmt/designer.menu';

/**
 * All coded MenuDef entries registered centrally in this module.
 *
 * Why central registration instead of per-module multi-provider:
 * NestJS multi-provider aggregation across modules has limits — using a single
 * explicit array here is the most reliable approach. The trade-off is a
 * one-way dependency from MenuModule → other modules' menu files, which is
 * acceptable and cycle-free.
 */
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
  providers: [
    MenuSyncService,
    { provide: MENU_DEF_TOKEN, useValue: ALL_MENU_DEFS },
  ],
  exports: [MenuSyncService],
})
export class MenuModule {}
