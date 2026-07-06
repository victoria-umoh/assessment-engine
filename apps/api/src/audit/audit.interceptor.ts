import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { AuthUser } from '../auth/jwt.strategy';
import { AuditService } from './audit.service';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const SECRET_KEYS = new Set(['password', 'passwordHash', 'refreshToken', 'accessToken']);
const MAX_DIFF_BYTES = 10_240;

// Audit is a trail, not a backup: an oversized payload (lesson bodies,
// material content) is recorded as a size marker, not stored verbatim.
function capDiff(diff: unknown): unknown {
  if (diff === undefined) return undefined;
  const bytes = JSON.stringify(diff)?.length ?? 0;
  return bytes > MAX_DIFF_BYTES ? { truncated: true, bytes } : diff;
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k)) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

interface AuditableRequest {
  method: string;
  path: string;
  body?: unknown;
  params?: Record<string, string>;
  route?: { path?: string };
  user?: AuthUser;
}

// Records every successful admin mutation (spec §4 auditLogs). Failures to
// write the audit entry are logged, never surfaced — audit must not break
// the mutation it observes.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<AuditableRequest>();
    // NB: matches on the raw '/admin/' path — correct while main.ts sets no
    // global prefix. If setGlobalPrefix is ever added, update this prefix or
    // auditing silently stops.
    if (!MUTATING.has(req.method) || !req.path.startsWith('/admin/') || !req.user) {
      return next.handle();
    }
    return next.handle().pipe(
      mergeMap(async (response) => {
        try {
          const entity = req.path.split('/')[2] ?? 'unknown';
          const responseId = (response as { _id?: unknown } | undefined)?._id;
          await this.audit.record({
            actorId: req.user!.userId,
            action: `${req.method} ${req.route?.path ?? req.path}`,
            entity,
            entityId: req.params?.id ?? (responseId ? String(responseId) : undefined),
            diff: req.body !== undefined ? capDiff(sanitize(req.body)) : undefined,
          });
        } catch (err) {
          this.logger.warn(`audit write failed: ${(err as Error).message}`);
        }
        return response;
      }),
    );
  }
}
