import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MENU_DEF_TOKEN, type MenuDef } from '@openforge/shared';

@Injectable()
export class MenuSyncService implements OnModuleInit {
  private readonly logger = new Logger(MenuSyncService.name);

  // Explicit @Inject required because esbuild does not emit full
  // `design:paramtypes` metadata in the Vitest runtime.
  constructor(
    @Inject(MENU_DEF_TOKEN) private menuDefs: MenuDef[],
    @Inject(PrismaService) private prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(`Syncing ${this.menuDefs.length} coded MenuDef entries...`);

    // 1. Upsert all MenuDef entries
    for (const def of this.menuDefs) {
      await this.prisma.sysMenu.upsert({
        where: { code: def.code },
        update: {
          // Code-authoritative fields (always overwritten)
          source: 'coded',
          type: def.type,
          targetRoute: def.targetRoute ?? null,
          visible: true,
          // NOT overwritten on update: name, nameEn, icon, sortOrder
          // (admins may have customized these via the menu admin UI)
        },
        create: {
          code: def.code,
          source: 'coded',
          type: def.type,
          name: def.name,
          nameEn: def.nameEn ?? null,
          icon: def.icon ?? null,
          sortOrder: def.sortOrder ?? 0,
          targetRoute: def.targetRoute ?? null,
        },
      });
    }

    // 2. Mark coded menus that no longer have a MenuDef as visible=false
    //    (preserves role_menu bindings; admin may re-enable when MenuDef returns)
    const activeCodes = this.menuDefs.map((d) => d.code);
    await this.prisma.sysMenu.updateMany({
      where: { source: 'coded', code: { notIn: activeCodes } },
      data: { visible: false },
    });

    // 3. Rebuild parent_id links from parentCode references
    for (const def of this.menuDefs) {
      if (!def.parentCode) continue;
      const parent = await this.prisma.sysMenu.findUnique({
        where: { code: def.parentCode },
      });
      if (parent) {
        await this.prisma.sysMenu.update({
          where: { code: def.code },
          data: { parentId: parent.id },
        });
      }
    }

    this.logger.log('Menu sync complete.');
  }
}
