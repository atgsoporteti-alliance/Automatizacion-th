import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { eq, ilike } from 'drizzle-orm';
import { userProfiles } from '@alliance-hcm/database';
import { AuthenticatedUserProfile } from '@alliance-hcm/shared';
import { DatabaseService } from '../../../common/database/database.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly supabase: SupabaseClient | null;
  private readonly isDevBypassEnabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {
    const supabaseUrl =
      this.config.get<string>('SUPABASE_URL') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseKey =
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      this.config.get<string>('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    this.supabase =
      supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

    this.isDevBypassEnabled =
      this.config.get<string>('NEXT_PUBLIC_DEV_AUTH_BYPASS', 'true') !== 'false';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthenticatedUserProfile;
    }>();

    const authHeader = request.headers['authorization'];
    const token =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    // 1. Modo desarrollo UAT: permite token "dev-role:<email>" o header "x-dev-user-email"
    const devHeaderEmail = request.headers['x-dev-user-email'];
    const devEmail =
      token?.startsWith('dev-role:')
        ? token.slice('dev-role:'.length).trim()
        : typeof devHeaderEmail === 'string'
          ? devHeaderEmail.trim()
          : null;

    if (this.isDevBypassEnabled && devEmail) {
      const profile = await this.findProfileByEmail(devEmail);
      if (!profile) {
        throw new UnauthorizedException(`Perfil de prueba no encontrado: ${devEmail}`);
      }
      if (!profile.isActive) {
        throw new ForbiddenException('Usuario desactivado. Contacta al Super Administrador.');
      }
      request.user = profile;
      return true;
    }

    // 2. Validación estricta de Bearer JWT emitido por Supabase Auth
    if (!token) {
      throw new UnauthorizedException('Token de autenticación requerido.');
    }

    if (!this.supabase) {
      throw new UnauthorizedException('Supabase Auth no configurado en el servidor.');
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      this.logger.warn(`Token Supabase inválido: ${error?.message ?? 'sin usuario'}`);
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }

    let profile = await this.findProfileByIdOrEmail(data.user.id, data.user.email ?? '');

    if (!profile && data.user.email) {
      // Auto-crear perfil inicial si el usuario se autenticó por Google SSO/Supabase por primera vez
      const [created] = await this.database.db
        .insert(userProfiles)
        .values({
          id: data.user.id,
          email: data.user.email.toLowerCase(),
          fullName:
            (data.user.user_metadata?.full_name as string | undefined) ??
            data.user.email.split('@')[0],
          role: 'TH_ANALYST',
          operationalArea: 'ALL',
          isActive: true,
        })
        .returning();

      profile = {
        id: created.id,
        email: created.email,
        fullName: created.fullName,
        role: created.role,
        operationalArea: created.operationalArea,
        clearanceDepartment: created.clearanceDepartment,
        isActive: created.isActive,
      };
    }

    if (!profile) {
      throw new UnauthorizedException('El usuario no tiene un perfil RBAC asignado.');
    }

    if (!profile.isActive) {
      throw new ForbiddenException('Tu cuenta ha sido desactivada. Contacta al Super Administrador.');
    }

    request.user = profile;
    return true;
  }

  private async findProfileByEmail(email: string): Promise<AuthenticatedUserProfile | null> {
    const row = await this.database.db.query.userProfiles.findFirst({
      where: ilike(userProfiles.email, email),
    });
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      operationalArea: row.operationalArea,
      clearanceDepartment: row.clearanceDepartment,
      isActive: row.isActive,
    };
  }

  private async findProfileByIdOrEmail(
    id: string,
    email: string,
  ): Promise<AuthenticatedUserProfile | null> {
    const byId = await this.database.db.query.userProfiles.findFirst({
      where: eq(userProfiles.id, id),
    });
    if (byId) {
      return {
        id: byId.id,
        email: byId.email,
        fullName: byId.fullName,
        role: byId.role,
        operationalArea: byId.operationalArea,
        clearanceDepartment: byId.clearanceDepartment,
        isActive: byId.isActive,
      };
    }
    return email ? this.findProfileByEmail(email) : null;
  }
}
