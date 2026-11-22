import { Injectable } from '@nestjs/common';
import {
  AREA_PROVISIONING_RULES,
  AreaProvisioningRule,
  buildCorporateEmailSuggestion,
  OperationalArea,
  WorkflowStep,
} from '@alliance-hcm/shared';

export interface RuleEvaluationResult {
  area: OperationalArea;
  rule: AreaProvisioningRule;
  nextStepAfterThApproval: WorkflowStep;
  shouldDispatchHelpdeskImmediately: boolean;
  slaDeadline: Date;
  suggestedCorporateEmail: string;
  provisioningItems: string[];
}

@Injectable()
export class RuleEngineService {
  evaluateOperationalArea(
    area: OperationalArea,
    preferredNameCredentials: string,
    referenceDate: Date = new Date(),
    corporateDomain: string = process.env.CORPORATE_EMAIL_DOMAIN ?? 'alliance.com.co',
  ): RuleEvaluationResult {
    const rule = AREA_PROVISIONING_RULES[area];
    if (!rule) {
      throw new Error(`Área operativa no soportada: ${String(area)}`);
    }

    const slaDeadline = new Date(referenceDate.getTime() + rule.slaHours * 60 * 60 * 1000);

    // Regla obligatoria: Si el área es DSI, pasa primero por DSI_LEADER_APPROVAL antes del ticket Helpdesk
    const nextStepAfterThApproval: WorkflowStep = rule.requiresDsiLeaderApproval
      ? 'DSI_LEADER_APPROVAL'
      : 'HELPDESK_TICKET_CREATED';

    return {
      area,
      rule,
      nextStepAfterThApproval,
      shouldDispatchHelpdeskImmediately: !rule.requiresDsiLeaderApproval,
      slaDeadline,
      suggestedCorporateEmail: buildCorporateEmailSuggestion(
        preferredNameCredentials,
        corporateDomain,
      ),
      provisioningItems: [...rule.provisioningItems],
    };
  }
}
