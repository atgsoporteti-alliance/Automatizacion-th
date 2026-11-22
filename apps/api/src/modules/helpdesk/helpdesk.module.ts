import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HELPDESK_ADAPTER_TOKEN } from './adapters/helpdesk-adapter.interface';
import { ManageEngineAdapter } from './adapters/manage-engine.adapter';
import { HELPDESK_QUEUE_NAME, HelpdeskProcessor } from './helpdesk.processor';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskWebhookController } from './helpdesk-webhook.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: HELPDESK_QUEUE_NAME,
    }),
  ],
  controllers: [HelpdeskWebhookController],
  providers: [
    {
      provide: HELPDESK_ADAPTER_TOKEN,
      useClass: ManageEngineAdapter,
    },
    HelpdeskProcessor,
    HelpdeskService,
  ],
  exports: [HelpdeskService],
})
export class HelpdeskModule {}
