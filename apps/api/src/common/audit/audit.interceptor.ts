import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<{
      method: string;
      url: string;
      ip?: string;
      params?: Record<string, string>;
      body?: Record<string, unknown>;
      user?: AuthenticatedUserProfile;
    }>();

    const method = request.method?.toUpperCase();
    const isMutation = method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';

    if (!isMutation) {
      return next.handle();
    }

    const cleanPath = request.url.split('?')[0];

    // Las respuestas a encuestas de pulso son estrictamente anónimas:
    // no registrar actorId, email ni IP en audit_logs para evitar correlación temporal.
    if (/^\/api\/communications\/surveys\/[^/]+\/respond$/.test(cleanPath)) {
      return next.handle();
    }

    const actorId = request.user?.id ?? request.user?.email ?? 'public-or-webhook';
    const entity = cleanPath.split('/')[2] ?? 'api';
    const entityId = request.params?.id ?? request.params?.clearanceId ?? 'batch';

    return next.handle().pipe(
      tap(() => {
        void this.auditService.record({
          actorId,
          action: `HTTP_${method}_${cleanPath}`,
          entity,
          entityId,
          newValues: {
            ip: request.ip ?? 'unknown',
            actorRole: request.user?.role ?? 'PUBLIC',
            payloadKeys: request.body ? Object.keys(request.body) : [],
          },
        });
      }),
    );
  }
}
