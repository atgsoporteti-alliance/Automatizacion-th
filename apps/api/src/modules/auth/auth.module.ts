import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RolesGuard } from './guards/roles.guard';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [SupabaseAuthGuard, RolesGuard],
  exports: [SupabaseAuthGuard, RolesGuard],
})
export class AuthModule {}
