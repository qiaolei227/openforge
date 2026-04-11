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

    // Upsert all defs. `name / nameEn / icon / sortOrder` are intentionally not in
    // the update payload — admins can customize them via the menu admin UI and we
    // don't want to overwrite their changes on every boot.
    await this.prisma.$transaction(
      this.menuDefs.map((def) =>
        this.prisma.sysMenu.upsert({
          where: { code: def.code },
          update: {
            source: 'coded',
            type: def.type,
            targetRoute: def.targetRoute ?? null,
            visible: true,
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
        }),
      ),
    );

    // Hide coded menus whose MenuDef has been deleted from code.
    // visible=false (not DELETE) preserves any sys_role_menu bindings so they come
    // back automatically if the MenuDef is re-added later.
    const activeCodes = this.menuDefs.map((d) => d.code);
    await this.prisma.sysMenu.updateMany({
      where: { source: 'coded', code: { notIn: activeCodes } },
      data: { visible: false },
    });

    // Rebuild parent_id links from parentCode in a single batch: fetch all menu
    // ids in one query, then apply updates in one transaction. This replaces the
    // previous N findUnique + N update pattern (~12 serial round trips).
    const defsWithParent = this.menuDefs.filter((d) => d.parentCode);
    if (defsWithParent.length > 0) {
      const rows = await this.prisma.sysMenu.findMany({
        where: { code: { in: this.menuDefs.map((d) => d.code) } },
        select: { id: true, code: true },
      });
      const codeToId = new Map(rows.map((r) => [r.code, r.id]));
      await this.prisma.$transaction(
        defsWithParent
          .filter((d) => codeToId.has(d.parentCode!))
          .map((d) =>
            this.prisma.sysMenu.update({
              where: { code: d.code },
              data: { parentId: codeToId.get(d.parentCode!)! },
            }),
          ),
      );
    }

    this.logger.log('Menu sync complete.');
  }
}
