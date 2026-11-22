import { Injectable, Logger } from '@nestjs/common';
import { auditLogs } from '@alliance-hcm/database';
import { DatabaseService } from '../database/database.service';

export interface AuditLogInput {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly database: DatabaseService) {}

  async record(entry: AuditLogInput): Promise<void> {
    try {
      await this.database.db.insert(auditLogs).values({
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        oldValues: entry.oldValues ?? null,
        newValues: entry.newValues ?? null,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo escribir audit_log para ${entry.entity}:${entry.entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
