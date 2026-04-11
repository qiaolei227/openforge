import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
import { PermissionService } from '../permission/permission.service';
import { PrismaService } from '../../prisma/prisma.service';

// Matches both business data path and designer data path:
//   /api/apps/:appCode/models/:modelCode/data[/...]
//   /api/designer/apps/:appCode/models/:modelCode/data[/...]
const BUSINESS_DATA_REGEX =
  /^\/api\/(?:designer\/)?apps\/([^/?]+)\/models\/([^/?]+)\/data(?:[/?]|$)/;

@Injectable()
export class FieldPermissionInterceptor implements NestInterceptor {
  // Explicit @Inject is required because esbuild does not emit full
  // `design:paramtypes` metadata in the Vitest runtime.
  constructor(
    @Inject(PermissionService) private permissionService: PermissionService,
    @Inject(PrismaService) private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    const match = (req.url as string).match(BUSINESS_DATA_REGEX);
    if (!match) return next.handle();

    const user = req.user;
    if (!user || user.isAdmin) return next.handle();

    const appCode = decodeURIComponent(match[1]);
    const modelCode = decodeURIComponent(match[2]);
    const isWrite = ['POST', 'PUT', 'PATCH'].includes(req.method);

    return from(this.resolvePermissions(user.id, appCode, modelCode)).pipe(
      mergeMap(({ hiddenColumns, readonlyColumns }) => {
        if (isWrite && req.body && typeof req.body === 'object') {
          this.stripFromBody(req.body, hiddenColumns);
          this.stripFromBody(req.body, readonlyColumns);
        }
        return next.handle().pipe(
          map((response) => this.stripFromResponse(response, hiddenColumns)),
        );
      }),
    );
  }

  private async resolvePermissions(
    userId: string,
    appCode: string,
    modelCode: string,
  ) {
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: {
        id: true,
        fields: {
          where: { deletedAt: null, entityId: null },
          select: { id: true, columnName: true },
        },
      },
    });
    if (!model) {
      return {
        hiddenColumns: new Set<string>(),
        readonlyColumns: new Set<string>(),
      };
    }

    const perms = await this.permissionService.getFieldPermissions(userId, model.id);
    const hiddenColumns = new Set<string>();
    const readonlyColumns = new Set<string>();
    for (const f of model.fields) {
      const access = perms.get(f.id);
      if (access === 'hidden') hiddenColumns.add(f.columnName);
      else if (access === 'readonly') readonlyColumns.add(f.columnName);
    }
    return { hiddenColumns, readonlyColumns };
  }

  private stripFromBody(body: Record<string, any>, columns: Set<string>): void {
    for (const col of columns) {
      if (col in body) delete body[col];
    }
    // Recursively strip from __children subtable rows
    if (Array.isArray(body.__children)) {
      for (const child of body.__children) {
        if (child && typeof child === 'object') {
          this.stripFromBody(child, columns);
        }
      }
    }
  }

  private stripFromResponse(response: any, hiddenColumns: Set<string>): any {
    if (response == null) return response;
    if (Array.isArray(response)) {
      return response.map((item) => this.stripFromResponse(item, hiddenColumns));
    }
    if (typeof response !== 'object') return response;

    // Handle { items, total } list response
    if ('items' in response && Array.isArray(response.items)) {
      response.items = response.items.map((item: any) =>
        this.stripFromResponse(item, hiddenColumns),
      );
      return response;
    }

    // Single record
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(response)) {
      if (hiddenColumns.has(key)) continue;
      result[key] = value;
    }
    return result;
  }
}
