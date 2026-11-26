'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Cpu,
  ExternalLink,
  FileUp,
  GitBranch,
  KeyRound,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  UserCheck,
  UserMinus,
  Users,
  Video,
} from 'lucide-react';
import {
  AREA_PROVISIONING_RULES,
  CLEARANCE_DEPARTMENT_LABELS,
  CLEARANCE_DEPARTMENTS,
  OPERATIONAL_AREAS,
} from '@alliance-hcm/shared';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/components/providers';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';

type PhaseId = 'ALL' | 'SELECTION' | 'PRE_ONBOARDING' | 'APPROVAL_IT' | 'OFFBOARDING';

interface FlowStepDef {
  stepNumber: string;
  id: string;
  phase: Exclude<PhaseId, 'ALL'>;
  phaseLabel: string;
  title: string;
  subtitle: string;
  actor: string;
  badgeVariant: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'purple' | 'outline';
  stateTransition: string;
  summary: string;
  systemActions: string[];
  routeHref: string;
  routeLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  branches?: Array<{ label: string; target: string; tone: 'warning' | 'danger' | 'purple' | 'success' }>;
}

const PHASES: Array<{ id: PhaseId; label: string; shortLabel: string }> = [
  { id: 'ALL', label: 'Ciclo completo (10 pasos)', shortLabel: 'Todo el ciclo' },
  { id: 'SELECTION', label: '1. Postulación y Selección', shortLabel: '1. Selección' },
  { id: 'PRE_ONBOARDING', label: '2. Pre-Ingreso y Ley 1581', shortLabel: '2. Pre-Ingreso' },
  { id: 'APPROVAL_IT', label: '3. Validación TH, DSI e IT', shortLabel: '3. Validación & IT' },
  { id: 'OFFBOARDING', label: '4. Salida: Renuncia / Despido', shortLabel: '4. Offboarding' },
];

const FLOW_STEPS: FlowStepDef[] = [
  {
    stepNumber: '01',
    id: 'candidate-created',
    phase: 'SELECTION',
    phaseLabel: 'Fase 1 · Selección',
    title: 'Postulación y creación del candidato',
    subtitle: 'TH registra al candidato y genera su portal único',
    actor: 'Talento Humano (TH_ANALYST / TH_ADMIN)',
    badgeVariant: 'outline',
    stateTransition: 'Nuevo → REGISTERED (Postulado)',
    summary:
      'Talento Humano crea el proceso en Selección ingresando nombre, correo, cédula (opcional) y vacante. También puede generar directo un Magic Link JWT de 72h desde Validación TH.',
    systemActions: [
      'Genera token único (/candidato/[token]) en candidate_processes.',
      'Envía invitación automática por Gmail vía HTTPS Relay (Vercel) o SMTP.',
      'Registra notificación inicial de bienvenida y evento en audit_logs.',
    ],
    routeHref: '/dashboard/candidatos',
    routeLabel: 'Abrir Selección & Candidatos',
    icon: UserCheck,
  },
  {
    stepNumber: '02',
    id: 'cv-upload',
    phase: 'SELECTION',
    phaseLabel: 'Fase 1 · Selección',
    title: 'Carga de Hoja de Vida (PDF)',
    subtitle: 'El candidato sube su CV desde su enlace sin crear contraseña',
    actor: 'Candidato (Portal público)',
    badgeVariant: 'default',
    stateTransition: 'REGISTERED → CV_UPLOADED',
    summary:
      'El candidato accede a /candidato/[token] desde cualquier navegador y adjunta su hoja de vida en PDF. TH puede previsualizar o descargar el documento en línea.',
    systemActions: [
      'Almacena el PDF en Supabase Storage S3 (bucket alliance) y guarda metadatos.',
      'Avanza automáticamente la etapa a CV_UPLOADED.',
      'Decodifica nombres UTF-8 y sirve PDF binario seguro con RFC 5987.',
    ],
    routeHref: '/candidato/demo',
    routeLabel: 'Ver Portal Candidato (Demo)',
    icon: FileUp,
  },
  {
    stepNumber: '03',
    id: 'interviews-teams-meet',
    phase: 'SELECTION',
    phaseLabel: 'Fase 1 · Selección',
    title: 'Entrevistas y reuniones (Teams / Meet)',
    subtitle: 'Agenda de entrevistas con enlace directo y notificación Gmail',
    actor: 'Talento Humano ↔ Candidato',
    badgeVariant: 'default',
    stateTransition: 'CV_UPLOADED → IN_SELECTION',
    summary:
      'TH programa entrevistas seleccionando Microsoft Teams o Google Meet (con detección automática al pegar el link), fecha, entrevistador y notas. También puede editar o agregar el enlace después.',
    systemActions: [
      'Valida enlaces largos de Teams (hasta 1500 caracteres) y Google Meet.',
      'Muestra el botón "Unirse por Teams / Meet" en el portal del candidato.',
      'Envía correo de citación o actualización automática por Gmail.',
    ],
    routeHref: '/dashboard/candidatos',
    routeLabel: 'Gestionar Reuniones TH',
    icon: Video,
    branches: [
      {
        label: 'No supera selección',
        target: 'TH marca REJECTED (Proceso Cerrado) · Fin del proceso',
        tone: 'danger',
      },
    ],
  },
  {
    stepNumber: '04',
    id: 'enable-pre-onboarding',
    phase: 'PRE_ONBOARDING',
    phaseLabel: 'Fase 2 · Pre-Ingreso',
    title: 'Habilitación del Pre-Registro Digital',
    subtitle: 'Superada la selección, TH libera el formulario de ingreso',
    actor: 'Talento Humano',
    badgeVariant: 'warning',
    stateTransition: 'IN_SELECTION → PRE_ONBOARDING',
    summary:
      'TH habilita el Pre-Registro desde el perfil del candidato. Se emite un enlace seguro firmado con JWT (vigencia de 72 horas) dentro del portal y por correo electrónico.',
    systemActions: [
      'Firma JWT con purpose=PRE_ONBOARDING vinculado al proceso del candidato.',
      'Habilita el acceso al formulario de 24 campos en /pre-ingreso/[token].',
      'Notifica al candidato en tiempo real en su bitácora y bandeja Gmail.',
    ],
    routeHref: '/pre-ingreso/demo',
    routeLabel: 'Ver Formulario Pre-Ingreso (Demo)',
    icon: KeyRound,
  },
  {
    stepNumber: '05',
    id: 'otp-24fields-ley1581',
    phase: 'PRE_ONBOARDING',
    phaseLabel: 'Fase 2 · Pre-Ingreso',
    title: 'OTP, 24 Campos, Documentos y Firma Ley 1581',
    subtitle: 'Diligenciamiento completo con validación anti-duplicado y reintegro',
    actor: 'Candidato',
    badgeVariant: 'warning',
    stateTransition: 'Empleado: PRE_ONBOARDING · Workflow: TH_REVIEW (SLA 24h)',
    summary:
      'El candidato valida un código OTP de 6 dígitos (10 min de vigencia), llena los 24 campos del expediente único, sube certificados soporte en S3 y firma electrónicamente la autorización Ley 1581 (Habeas Data).',
    systemActions: [
      'Calcula edad exacta y registra firma manuscrita + Hash SHA-256 + IP + User-Agent.',
      'Control anti-duplicados: bloquea cédula/correo activo (HTTP 409).',
      'Detección automática de REINTEGRO: si existía como INACTIVE, reactiva su expediente.',
    ],
    routeHref: '/pre-ingreso/demo',
    routeLabel: 'Explorar 24 Campos y Firma',
    icon: ShieldCheck,
    branches: [
      {
        label: 'Ex-colaborador INACTIVE',
        target: 'Se vincula automáticamente como REINTEGRO sin duplicar hoja de vida',
        tone: 'purple',
      },
    ],
  },
  {
    stepNumber: '06',
    id: 'th-review-decision',
    phase: 'APPROVAL_IT',
    phaseLabel: 'Fase 3 · Validación & IT',
    title: 'Validación de Talento Humano y Asignación de Área',
    subtitle: 'TH revisa expediente, asigna área operativa o devuelve / cancela',
    actor: 'Talento Humano (TH_ANALYST / TH_ADMIN)',
    badgeVariant: 'purple',
    stateTransition: 'TH_REVIEW → (DSI_LEADER_APPROVAL | HELPDESK_TICKET_CREATED)',
    summary:
      'En /dashboard/th, TH verifica los 24 campos, documentos PDF y firma Ley 1581. Al aprobar, asigna Área (CUSTOMER, VENTAS o DSI), cargo, centro de costo, jefe, fecha de ingreso y correo corporativo sugerido.',
    systemActions: [
      'Marca HIRED_APPROVED en el portal e inicia la ventana temporal de 15 días para el candidato (permanente para TH).',
      'Evalúa RuleEngineService para calcular SLA (24h Customer/Ventas · 48h DSI) y plantilla Helpdesk.',
      'Envía correo de aprobación de contratación al candidato.',
    ],
    routeHref: '/dashboard/th',
    routeLabel: 'Abrir Validación TH',
    icon: ClipboardCheck,
    branches: [
      {
        label: 'Dato errado / soporte faltante',
        target: 'Devolución → CANDIDATE_PENDING + enlace JWT 72h prellenado + correo',
        tone: 'warning',
      },
      {
        label: 'No asiste el Día 1',
        target: 'TH_ADMIN marca CANCELLED_NO_SHOW y empleado pasa a NO_SHOW',
        tone: 'danger',
      },
    ],
  },
  {
    stepNumber: '07',
    id: 'dsi-gate-and-rules',
    phase: 'APPROVAL_IT',
    phaseLabel: 'Fase 3 · Validación & IT',
    title: 'Motor de Reglas y Puerta Obligatoria Líder DSI',
    subtitle: 'Bifurcación automática según área operativa asignada',
    actor: 'Líder de Área DSI (AREA_LEADER) / Motor de Reglas',
    badgeVariant: 'purple',
    stateTransition: 'CUSTOMER/VENTAS directo a IT · DSI pasa por DSI_LEADER_APPROVAL',
    summary:
      'Customer y Ventas despachan inmediatamente el ticket hacia IT/Helpdesk. Si el ingreso pertenece a DSI (Ingeniería y Sistemas), queda bloqueado hasta contar con aprobación del Líder DSI en /dashboard/team.',
    systemActions: [
      'Verifica RBAC estricto: solo AREA_LEADER (DSI) o SUPER_ADMIN aprueba la puerta DSI.',
      'Al aprobar DSI, encola el job en BullMQ (helpdesk-provisioning) hacia ServiceDesk Plus.',
      'Sincroniza la actualización en la bitácora del candidato.',
    ],
    routeHref: '/dashboard/team',
    routeLabel: 'Abrir Mi Equipo y Puerta DSI',
    icon: GitBranch,
  },
  {
    stepNumber: '08',
    id: 'it-provisioning-active',
    phase: 'APPROVAL_IT',
    phaseLabel: 'Fase 3 · Validación & IT',
    title: 'Aprovisionamiento IT y Contratación Activa',
    subtitle: 'Creación de correo, accesos y entrega de hardware vía Helpdesk',
    actor: 'Soporte IT / ManageEngine ServiceDesk Plus',
    badgeVariant: 'success',
    stateTransition: 'IT_PROVISIONING → COMPLETED · Empleado: ACTIVE',
    summary:
      'IT recibe el ticket en /dashboard/it con la lista exacta de accesos y equipos según plantilla (TPL_ONB_CUSTOMER_V1, VENTAS_V1 o DSI_V1). Al cerrarse el ticket (RESOLVED / CLOSED), el colaborador queda activo.',
    systemActions: [
      'Recibe webhooks bidireccionales de ServiceDesk Plus en HelpdeskService.',
      'Asigna el correo corporativo final y cambia status del empleado a ACTIVE.',
      'Marca el workflow de ONBOARDING como COMPLETED (contratación terminada).',
    ],
    routeHref: '/dashboard/it',
    routeLabel: 'Abrir Consola Operativa IT',
    icon: Cpu,
  },
  {
    stepNumber: '09',
    id: 'offboarding-triggered',
    phase: 'OFFBOARDING',
    phaseLabel: 'Fase 4 · Offboarding',
    title: 'Salida del Colaborador: Renuncia o Despido',
    subtitle: 'Retiro programado (23:59) o despido crítico inmediato (SLA 2h)',
    actor: 'Talento Humano (STANDARD) / TH_ADMIN (CRITICAL_IMMEDIATE)',
    badgeVariant: 'danger',
    stateTransition: 'ACTIVE → OFFBOARDING_PENDING + 4 Paz y Salvo PENDING',
    summary:
      'Ante renuncia o terminación estándar (STANDARD), el sistema programa el corte a las 23:59 mediante Cron Job diario. Ante despido inmediato (CRITICAL_IMMEDIATE, exclusivo TH_ADMIN / SUPER_ADMIN), bloquea accesos de inmediato.',
    systemActions: [
      'Genera automáticamente 4 registros de Paz y Salvo: IT, Finanzas, Activo Fijo y Jefe Directo.',
      'STANDARD: @Cron("59 23 * * *") dispara revocación IT el día del retiro a las 23:59.',
      'CRITICAL_IMMEDIATE: encola al instante ticket urgente IT con SLA de 2 horas.',
    ],
    routeHref: '/dashboard/offboarding',
    routeLabel: 'Abrir Offboarding & Paz y Salvo',
    icon: UserMinus,
  },
  {
    stepNumber: '10',
    id: 'clearance-and-inactive',
    phase: 'OFFBOARDING',
    phaseLabel: 'Fase 4 · Offboarding',
    title: 'Paz y Salvo Multi-Área y Cierre Definitivo',
    subtitle: 'Aprobación de 4 departamentos para desactivar al ex-colaborador',
    actor: 'IT · Finanzas · Activo Fijo · Jefe Directo',
    badgeVariant: 'secondary',
    stateTransition: '4 áreas APPROVED → Workflow COMPLETED · Empleado: INACTIVE',
    summary:
      'Cada área firma su Paz y Salvo en /dashboard/offboarding según su rol RBAC (APPROVED o REJECTED_WITH_DEBT si hay deudas o equipos pendientes). Cuando las 4 áreas aprueban, el cierre es automático.',
    systemActions: [
      'IT_HARDWARE_ACCESS (IT_SUPPORT) · FINANCE & FIXED_ASSETS (CLEARANCE_APPROVER) · DIRECT_MANAGER (AREA_LEADER).',
      'Al completar 4/4 APPROVED, cambia workflow a COMPLETED y empleado a INACTIVE.',
      'El expediente histórico permanece auditable y apto para futuro Reintegro.',
    ],
    routeHref: '/dashboard/offboarding',
    routeLabel: 'Ver Semáforo Paz y Salvo',
    icon: CheckCircle2,
  },
];

export function LifecycleFlowPresentation() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [selectedPhase, setSelectedPhase] = useState<PhaseId>('ALL');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [presentationMode, setPresentationMode] = useState(false);

  const visibleSteps =
    selectedPhase === 'ALL'
      ? FLOW_STEPS
      : FLOW_STEPS.filter((s) => s.phase === selectedPhase);

  const safeIndex = Math.min(activeStepIndex, Math.max(visibleSteps.length - 1, 0));
  const activeStep = visibleSteps[safeIndex] ?? FLOW_STEPS[0];

  useEffect(() => {
    setActiveStepIndex(0);
  }, [selectedPhase]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') {
        setActiveStepIndex((prev) => Math.min(prev + 1, visibleSteps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setActiveStepIndex((prev) => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleSteps.length]);

  const ActiveIcon = activeStep.icon;

  const content = (
    <div className="space-y-6">
      {/* Cabecera de Presentación */}
      <div className="flex flex-col gap-4 border-b border-zinc-200/80 pb-5 dark:border-zinc-800/80 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Vista de Presentación</Badge>
            <Badge variant="success">End-to-End · TH + IT + Offboarding</Badge>
            <Badge variant="purple">Ley 1581 &amp; ServiceDesk Plus</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
            Flujo Completo del Colaborador — Alliance HCM
          </h1>
          <p className="max-w-2xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            Recorrido visual paso a paso desde la postulación del candidato hasta la contratación
            activa, excepciones (devolución, No-Show, reintegro) y salida por renuncia o despido.
            Usa las flechas <kbd className="rounded border px-1 py-0.5 text-[10px]">←</kbd>{' '}
            <kbd className="rounded border px-1 py-0.5 text-[10px]">→</kbd> del teclado o haz clic
            en cualquier paso para presentar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!user && (
            <Link
              href="/login"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Ir a Login / Demos UAT
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPresentationMode((v) => !v)}
          >
            {presentationMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                Salir pantalla completa
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                Modo presentación
              </>
            )}
          </Button>
          {(!user || presentationMode) && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={toggleTheme}
              title="Cambiar tema"
              aria-label="Cambiar tema"
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>
      </div>

      {/* KPIs de Resumen Ejecutivo */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Ciclo completo
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">10 Pasos · 4 Fases</p>
          <p className="text-[11px] text-zinc-500">De Postulado a Activo o Inactivo</p>
        </div>
        <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Pre-Ingreso Digital
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">24 Campos + OTP</p>
          <p className="text-[11px] text-zinc-500">Magic Link 72h · Firma SHA-256</p>
        </div>
        <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Portal Candidato
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">Teams / Meet + 15d</p>
          <p className="text-[11px] text-zinc-500">Visible 15 días tras aprobación TH</p>
        </div>
        <div className="rounded-lg border border-zinc-200/80 bg-white px-4 py-3 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Offboarding Multi-Área
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums">4 Paz y Salvo</p>
          <p className="text-[11px] text-zinc-500">Standard 23:59 o Crítico SLA 2h</p>
        </div>
      </div>

      {/* Filtro por Fase + Controles Paso a Paso */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PHASES.map((phase) => {
            const active = selectedPhase === phase.id;
            return (
              <button
                key={phase.id}
                type="button"
                onClick={() => setSelectedPhase(phase.id)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-[#0f0f12] dark:text-zinc-400 dark:hover:bg-zinc-900'
                }`}
              >
                {phase.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={safeIndex <= 0}
            onClick={() => setActiveStepIndex((i) => Math.max(i - 1, 0))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </Button>
          <span className="text-xs font-medium tabular-nums text-zinc-500">
            Paso {activeStep.stepNumber} ({safeIndex + 1}/{visibleSteps.length})
          </span>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={safeIndex >= visibleSteps.length - 1}
            onClick={() => setActiveStepIndex((i) => Math.min(i + 1, visibleSteps.length - 1))}
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Mapa Visual Conectado (Pasos 1 a 10) */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {visibleSteps.map((step, idx) => {
          const Icon = step.icon;
          const isSelected = idx === safeIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStepIndex(idx)}
              className={`group relative flex flex-col justify-between rounded-lg border p-3.5 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-zinc-900 bg-white ring-2 ring-zinc-900/10 dark:border-zinc-100 dark:bg-zinc-900 dark:ring-zinc-100/15'
                  : 'border-zinc-200/80 bg-white hover:border-zinc-400 dark:border-zinc-800/80 dark:bg-[#0f0f12] dark:hover:border-zinc-600'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 text-[11px] font-semibold tabular-nums text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    {step.stepNumber}
                  </span>
                  <Badge variant={step.badgeVariant}>{step.phaseLabel.split('·')[1]?.trim() ?? step.phaseLabel}</Badge>
                </div>

                <div className="flex items-start gap-2 pt-0.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
                  <p className="text-xs font-semibold leading-snug text-zinc-950 dark:text-zinc-100">
                    {step.title}
                  </p>
                </div>

                <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {step.subtitle}
                </p>
              </div>

              <div className="mt-3 flex items-center justify-between gap-1 border-t border-zinc-100 pt-2 text-[10px] font-medium text-zinc-500 dark:border-zinc-800/80">
                <span className="truncate">{step.stateTransition}</span>
                {idx < visibleSteps.length - 1 && (
                  <ArrowRight className="h-3 w-3 shrink-0 opacity-60" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Inspector Detallado del Paso Activo */}
      <Card className="border-zinc-300/90 dark:border-zinc-700/80">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={activeStep.badgeVariant}>
                  Paso {activeStep.stepNumber} · {activeStep.phaseLabel}
                </Badge>
                <Badge variant="outline">{activeStep.actor}</Badge>
              </div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ActiveIcon className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                {activeStep.title}
              </CardTitle>
              <CardDescription className="text-xs">{activeStep.summary}</CardDescription>
            </div>

            <Link
              href={activeStep.routeHref}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {activeStep.routeLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 border-t border-zinc-200/80 pt-4 lg:grid-cols-12 dark:border-zinc-800/80">
          <div className="space-y-2.5 lg:col-span-7">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Qué hace automáticamente la plataforma
            </p>
            <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
              {activeStep.systemActions.map((act) => (
                <li key={act} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{act}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 lg:col-span-5">
            <div className="rounded-md border border-zinc-200/80 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Transición de estado
              </p>
              <p className="mt-1 font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {activeStep.stateTransition}
              </p>
            </div>

            {activeStep.branches && activeStep.branches.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                  Desvíos y excepciones en este punto
                </p>
                {activeStep.branches.map((br) => (
                  <div
                    key={br.label}
                    className="rounded-md border border-zinc-200/80 px-3 py-2 text-xs dark:border-zinc-800"
                  >
                    <Badge variant={br.tone} className="mb-1">
                      {br.label}
                    </Badge>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">{br.target}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bifurcaciones Clave para Explicar en Presentación */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 1. Reglas por Área Operativa */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-zinc-500" />
              Reglas de Aprovisionamiento por Área
            </CardTitle>
            <CardDescription>
              Customer y Ventas despachan directo a IT; DSI exige puerta del Líder DSI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {OPERATIONAL_AREAS.map((areaKey) => {
              const rule = AREA_PROVISIONING_RULES[areaKey];
              return (
                <div
                  key={areaKey}
                  className="rounded-md border border-zinc-200/80 p-2.5 text-xs dark:border-zinc-800/80"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-950 dark:text-zinc-100">
                      {rule.area}
                    </span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline">SLA {rule.slaHours}h</Badge>
                      {rule.requiresDsiLeaderApproval ? (
                        <Badge variant="purple">Requiere Líder DSI</Badge>
                      ) : (
                        <Badge variant="success">Directo a IT</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {rule.provisioningItems.join(' · ')}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* 2. Excepciones del Flujo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-zinc-500" />
              Excepciones y Reglas de Control
            </CardTitle>
            <CardDescription>
              Manejo controlado de devoluciones, ausencias, reintegros y privacidad.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="rounded-md border border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
              <div className="flex items-center gap-1.5 font-medium">
                <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                Devolución para corrección
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Regresa a CANDIDATE_PENDING con enlace JWT 72h prellenado y correo al candidato.
              </p>
            </div>
            <div className="rounded-md border border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
              <div className="flex items-center gap-1.5 font-medium">
                <Ban className="h-3.5 w-3.5 text-rose-600" />
                Cancelación No-Show Día 1
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Pasa workflow a CANCELLED_NO_SHOW, empleado a NO_SHOW y cancela el ticket en IT.
              </p>
            </div>
            <div className="rounded-md border border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
              <div className="flex items-center gap-1.5 font-medium">
                <Users className="h-3.5 w-3.5 text-indigo-600" />
                Reintegro automático &amp; TTL 15 días
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Ex-colaboradores INACTIVE se vinculan como Reintegro; tras aprobación TH el portal
                del candidato expira en 15 días pero queda permanente para TH.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 3. Desvinculación y Paz y Salvo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-zinc-500" />
              Renuncia / Despido y Paz y Salvo
            </CardTitle>
            <CardDescription>
              Desactivación segura hasta completar la aprobación de las 4 áreas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="rounded-md border border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  STANDARD (Renuncia / Programado)
                </span>
                <Badge variant="warning">Corte 23:59</Badge>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Cron Job diario 23:59 dispara revocación de accesos IT al llegar la fecha de retiro.
              </p>
            </div>
            <div className="rounded-md border border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium">
                  <Ban className="h-3.5 w-3.5 text-rose-600" />
                  CRITICAL_IMMEDIATE (Despido ya)
                </span>
                <Badge variant="danger">SLA 2h</Badge>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">
                Exclusivo TH_ADMIN / SUPER_ADMIN. Encola ticket urgente inmediato a Helpdesk IT.
              </p>
            </div>
            <div className="rounded-md border border-zinc-200/80 p-2.5 dark:border-zinc-800/80">
              <p className="font-medium">4 Firmas obligatorias → Estado INACTIVE</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {CLEARANCE_DEPARTMENTS.map((dept) => (
                  <Badge key={dept} variant="secondary">
                    {CLEARANCE_DEPARTMENT_LABELS[dept].split('—')[0]?.trim()}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  if (user && !presentationMode) {
    return <AppShell>{content}</AppShell>;
  }

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-950 dark:bg-[#09090b] dark:text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-[#fafafa]/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-[#09090b]/85">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Alliance HCM</span>
            <Badge variant="outline">Presentación</Badge>
          </div>
          <Link
            href={user ? '/dashboard/th' : '/login'}
            className="text-xs font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {user ? 'Volver al panel' : 'Iniciar sesión →'}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:py-8">{content}</main>
    </div>
  );
}
