import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskWebhookDto } from './dto/helpdesk-webhook.dto';

@ApiTags('Helpdesk Webhooks')
@Controller('webhooks')
export class HelpdeskWebhookController {
  constructor(private readonly helpdeskService: HelpdeskService) {}

  @Post('helpdesk')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Webhook bidireccional desde ManageEngine ServiceDesk Plus para actualizar estado de ticket en tiempo real',
  })
  receiveHelpdeskUpdate(@Body() dto: HelpdeskWebhookDto) {
    return this.helpdeskService.processWebhook(dto);
  }
}
