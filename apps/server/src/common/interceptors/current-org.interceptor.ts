import { Injectable, NestInterceptor, ExecutionContext, CallHandler, HttpStatus, Inject } from '@nestjs/common';
import { Observable, from, switchMap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCodes } from '../exceptions/error-codes';

const HEADER_NAME = 'x-current-org-id';

@Injectable()
export class CurrentOrgInterceptor implements NestInterceptor {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return next.handle();

    const headerOrg = req.headers[HEADER_NAME] as string | undefined;
    return from(this.resolveOrg(user, headerOrg)).pipe(
      switchMap((orgId) => {
        user.orgId = orgId;
        return next.handle();
      }),
    );
  }

  private async resolveOrg(user: any, headerOrg: string | undefined): Promise<string> {
    if (headerOrg) {
      if (user.isAdmin) return headerOrg;
      const membership = await this.prisma.sysUserOrg.findFirst({
        where: { userId: user.userId, orgId: headerOrg },
      });
      if (!membership) {
        throw new BusinessException(HttpStatus.FORBIDDEN, ErrorCodes.ORG_ACCESS_DENIED, '');
      }
      return headerOrg;
    }
    const def = await this.prisma.sysUserOrg.findFirst({
      where: { userId: user.userId, isDefault: true },
    });
    return def?.orgId ?? user.orgId;
  }
}
