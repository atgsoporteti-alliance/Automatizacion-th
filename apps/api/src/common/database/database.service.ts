import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabaseClient, Database } from '@alliance-hcm/database';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  public readonly db: Database;
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'DATABASE_URL',
      'postgresql://alliance_hcm:alliance_hcm_secret@localhost:5432/alliance_hcm_db',
    );
    const client = createDatabaseClient(connectionString);
    this.db = client.db;
    this.pool = client.pool;
    this.logger.log('Conexión Drizzle ORM / PostgreSQL configurada');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
