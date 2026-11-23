import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from './common/database/database.module';
import { AuditModule } from './common/audit/audit.module';
import { AuditInterceptor } from './common/audit/audit.interceptor';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { SupabaseAuthGuard } from './modules/auth/guards/supabase-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { AdminModule } from './modules/admin/admin.module';
import { RulesModule } from './modules/rules/rules.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { PreOnboardingModule } from './modules/pre-onboarding/pre-onboarding.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { OffboardingModule } from './modules/offboarding/offboarding.module';
import { CandidatePortalModule } from './modules/candidate-portal/candidate-portal.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<string>('REDIS_PORT', '6379')),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null,
        },
      }),
    }),
    DatabaseModule,
    AuditModule,
    StorageModule,
    AuthModule,
    AdminModule,
    RulesModule,
    HelpdeskModule,
    EmployeesModule,
    PreOnboardingModule,
    WorkflowsModule,
    OffboardingModule,
    CandidatePortalModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
