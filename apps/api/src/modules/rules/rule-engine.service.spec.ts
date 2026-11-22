import { RuleEngineService } from './rule-engine.service';

describe('RuleEngineService', () => {
  let service: RuleEngineService;

  beforeEach(() => {
    service = new RuleEngineService();
  });

  it('debe aprovisionar CUSTOMER inmediatamente con CRM Atención, VoIP y Base Conocimiento', () => {
    const ref = new Date('2026-11-21T12:00:00Z');
    const result = service.evaluateOperationalArea('CUSTOMER', 'Camila Morales', ref);

    expect(result.nextStepAfterThApproval).toBe('HELPDESK_TICKET_CREATED');
    expect(result.shouldDispatchHelpdeskImmediately).toBe(true);
    expect(result.suggestedCorporateEmail).toBe('camila.morales@alliance.com.co');
    expect(result.provisioningItems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Correo Corporativo'),
        expect.stringContaining('CRM Atención'),
        expect.stringContaining('VoIP'),
        expect.stringContaining('Base de Conocimiento'),
      ]),
    );
    expect(result.slaDeadline.toISOString()).toBe('2026-11-22T12:00:00.000Z');
  });

  it('debe aprovisionar VENTAS inmediatamente con CRM Comercial, Línea Comercial y Prospección', () => {
    const result = service.evaluateOperationalArea('VENTAS', 'Sebastián Vargas');

    expect(result.nextStepAfterThApproval).toBe('HELPDESK_TICKET_CREATED');
    expect(result.shouldDispatchHelpdeskImmediately).toBe(true);
    expect(result.suggestedCorporateEmail).toBe('sebastian.vargas@alliance.com.co');
    expect(result.provisioningItems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('CRM Comercial'),
        expect.stringContaining('Línea Telefónica Comercial'),
        expect.stringContaining('Prospección'),
      ]),
    );
  });

  it('debe exigir aprobación obligatoria del Líder DSI antes de disparar ticket Helpdesk', () => {
    const ref = new Date('2026-11-21T12:00:00Z');
    const result = service.evaluateOperationalArea('DSI', 'Andrés Castellanos', ref);

    expect(result.nextStepAfterThApproval).toBe('DSI_LEADER_APPROVAL');
    expect(result.shouldDispatchHelpdeskImmediately).toBe(false);
    expect(result.provisioningItems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Git'),
        expect.stringContaining('VPN'),
        expect.stringContaining('Licencias Dev'),
        expect.stringContaining('Hardware de Alto Rendimiento'),
      ]),
    );
    expect(result.slaDeadline.toISOString()).toBe('2026-11-23T12:00:00.000Z');
  });
});
