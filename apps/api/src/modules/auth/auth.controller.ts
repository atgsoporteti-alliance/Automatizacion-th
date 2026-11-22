import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { asc, sql } from 'drizzle-orm';
import { userProfiles } from '@alliance-hcm/database';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { DatabaseService } from '../../common/database/database.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

@ApiTags('Auth & RBAC')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) { }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener perfil RBAC del usuario autenticado' })
  getMe(@CurrentUser() user: AuthenticatedUserProfile) {
    return user;
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Diagnóstico de salud de API y conexión PostgreSQL' })
  async health() {
    try {
      await this.database.db.execute(sql`SELECT 1`);
      return { ok: true, database: 'connected' };
    } catch (err) {
      return {
        ok: false,
        database: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  @Get('dev-profiles')
  @Public()
  @ApiOperation({
    summary: 'Listar perfiles de prueba (disponible salvo que NEXT_PUBLIC_DEV_AUTH_BYPASS=false)',
  })
  async getDevProfiles() {
    const isUatBypass =
      this.config.get<string>('NEXT_PUBLIC_DEV_AUTH_BYPASS', 'true') !== 'false';

    if (!isUatBypass) {
      return [];
    }
    return this.database.db
      .select()
      .from(userProfiles)
      .orderBy(asc(userProfiles.role));
  }
}
