import { Module } from '@nestjs/common';
import { ExpirationsModule } from '../expirations/expirations.module';
import { TimeRequestsController } from './time-requests.controller';
import { TimeRequestsService } from './time-requests.service';

@Module({
  imports: [ExpirationsModule],
  controllers: [TimeRequestsController],
  providers: [TimeRequestsService],
  exports: [TimeRequestsService],
})
export class TimeRequestsModule {}
