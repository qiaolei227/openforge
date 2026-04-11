import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap, map } from 'rxjs/operators';
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
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    const match = (req.url as string).match(BUSINESS_DATA_REGEX);
    if (!match) return next.handle();

    const user = req.user;
    if (!user || user.isAdmin) return next.handle();

    const appCode = decodeURIComponent(match[1]);
    const modelCode = decodeURIComponent(match[2]);
    const isWrite = ['POST', 'PUT', 'PATCH'].includes(req.method);

    return from(this.resolvePermissions(user.userId, appCode, modelCode)).pipe(
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
    // Single query: model + its fields, with each field's permission rows
    // restricted to the current user's roles. Collapses two sequential joins
    // (sysModel.findFirst, then sysFieldPermission.findMany via PermissionService)
    // into one round-trip that fires on every business data request.
    const model = await this.prisma.sysModel.findFirst({
      where: { code: modelCode, app: { code: appCode } },
      select: {
        id: true,
        fields: {
          where: { deletedAt: null, entityId: null },
          select: {
            id: true,
            columnName: true,
            fieldPermissions: {
              where: { role: { userRoles: { some: { userId } } } },
              select: { access: true },
            },
          },
        },
      },
    });
    if (!model) {
      return {
        hiddenColumns: new Set<string>(),
        readonlyColumns: new Set<string>(),
      };
    }

    const hiddenColumns = new Set<string>();
    const readonlyColumns = new Set<string>();
    for (const f of model.fields) {
      // Widest-wins merge across roles: editable > readonly > hidden.
      // editable short-circuits (break); after the loop `widest` is readonly,
      // hidden, or null (no rows = default editable, nothing to strip).
      let widest: 'hidden' | 'readonly' | 'editable' | null = null;
      for (const p of f.fieldPermissions) {
        const a = p.access as 'hidden' | 'readonly' | 'editable';
        if (a === 'editable') { widest = 'editable'; break; }
        if (a === 'readonly') widest = 'readonly';
        else if (widest !== 'readonly') widest = a;
      }
      if (widest === 'hidden') hiddenColumns.add(f.columnName);
      else if (widest === 'readonly') readonlyColumns.add(f.columnName);
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
