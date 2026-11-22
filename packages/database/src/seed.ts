import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../.env') });
config();
import { createHash } from 'crypto';
import {
  AREA_PROVISIONING_RULES,
  calculateAge,
  HABEAS_DATA_POLICY_VERSION,
} from '@alliance-hcm/shared';
import { createDatabaseClient } from './client';
import {
  auditLogs,
  clearanceChecklists,
  dataConsentSignatures,
  employeeDocuments,
  employees,
  onboardingOffboardingWorkflows,
  userProfiles,
} from './schema';

async function seed() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://alliance_hcm:alliance_hcm_secret@localhost:5432/alliance_hcm_db';

  const { db, pool } = createDatabaseClient(databaseUrl);

  console.log('🌱 Iniciando seed de Alliance HCM – Core TH & IT...');

  try {
    // Limpiar datos previos en orden seguro (respetando FKs)
    await db.delete(auditLogs);
    await db.delete(clearanceChecklists);
    await db.delete(employeeDocuments);
    await db.delete(dataConsentSignatures);
    await db.delete(onboardingOffboardingWorkflows);
    await db.delete(employees);
    await db.delete(userProfiles);

    // 0. Perfiles RBAC (vinculados por ID/email a Supabase Auth)
    const seededUsers = await db
      .insert(userProfiles)
      .values([
        {
          id: '11111111-1111-4111-8111-111111111101',
          email: 'th.analista@alliance.com',
          fullName: 'Valeria Quintero (Analista TH)',
          role: 'TH_ANALYST',
          operationalArea: 'ALL',
          clearanceDepartment: null,
          isActive: true,
        },
        {
          id: '11111111-1111-4111-8111-111111111102',
          email: 'th.lider@alliance.com',
          fullName: 'Carolina Mejía (Admin TH)',
          role: 'TH_ADMIN',
          operationalArea: 'ALL',
          clearanceDepartment: null,
          isActive: true,
        },
        {
          id: '11111111-1111-4111-8111-111111111103',
          email: 'lider.dsi@alliance.com',
          fullName: 'Mateo Saldarriaga (Líder DSI)',
          role: 'AREA_LEADER',
          operationalArea: 'DSI',
          clearanceDepartment: null,
          isActive: true,
        },
        {
          id: '11111111-1111-4111-8111-111111111104',
          email: 'soporte.it@alliance.com',
          fullName: 'Juan Pablo Rojas (Soporte IT)',
          role: 'IT_SUPPORT',
          operationalArea: 'ALL',
          clearanceDepartment: null,
          isActive: true,
        },
        {
          id: '11111111-1111-4111-8111-111111111105',
          email: 'finanzas@alliance.com',
          fullName: 'Diana Marcela Ortiz (Finanzas)',
          role: 'CLEARANCE_APPROVER',
          operationalArea: null,
          clearanceDepartment: 'FINANCE',
          isActive: true,
        },
        {
          id: '11111111-1111-4111-8111-111111111106',
          email: 'admin@alliance.com',
          fullName: 'Luis Gotopo (Super Admin)',
          role: 'SUPER_ADMIN',
          operationalArea: 'ALL',
          clearanceDepartment: null,
          isActive: true,
        },
      ])
      .returning();

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const expiredSla = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    // 1. Colaboradores de prueba realistas (Customer, Ventas, DSI + Pre-Onboarding + Offboarding + Inactivo para Reintegro)
    const seededEmployees = await db
      .insert(employees)
      .values([
        // 1. CUSTOMER — En aprovisionamiento IT (Ticket Helpdesk creado)
        {
          status: 'PRE_ONBOARDING',
          fullName: 'Camila Andrea Morales Restrepo',
          preferredNameCredentials: 'camila.morales',
          nationalId: '1018456721',
          idIssuePlace: 'Bogotá D.C.',
          birthDate: '1997-04-14',
          birthPlace: 'Bogotá D.C.',
          age: calculateAge('1997-04-14'),
          maritalStatus: 'SOLTERO',
          address: 'Calle 127 # 45-20 Apto 502',
          neighborhoodCity: 'Prado Veraniego, Bogotá D.C.',
          phone: '+57 310 456 7890',
          personalEmail: 'camila.morales.personal@gmail.com',
          corporateEmail: 'camila.morales@alliance.com.co',
          educationLevel: 'PROFESIONAL',
          lastAcademicTitle: 'Administración de Empresas',
          eps: 'Sura EPS',
          pensionFund: 'Porvenir',
          severanceFund: 'Porvenir',
          hasChildren: false,
          childrenCount: 0,
          hasBancolombiaAccount: true,
          shirtSize: 'S',
          emergencyContactName: 'Martha Restrepo',
          emergencyContactRelationship: 'Madre',
          emergencyContactPhone: '+57 311 223 4455',
          operationalArea: 'CUSTOMER',
          jobTitle: 'Especialista de Experiencia al Cliente',
          costCenter: 'CC-CUST-101',
          reportingManagerEmail: 'lider.customer@alliance.com.co',
          hireDate: '2026-12-01',
          customAttributes: { campaign: 'Banca Digital', modality: 'Híbrido' },
        },
        // 2. VENTAS — Pendiente de Revisión TH (Acaba de completar el Wizard de 24 campos)
        {
          status: 'PRE_ONBOARDING',
          fullName: 'Sebastián Camilo Vargas Mendoza',
          preferredNameCredentials: 'sebastian.vargas',
          nationalId: '1032489102',
          idIssuePlace: 'Medellín, Antioquia',
          birthDate: '1994-09-22',
          birthPlace: 'Medellín, Antioquia',
          age: calculateAge('1994-09-22'),
          maritalStatus: 'UNION_LIBRE',
          address: 'Carrera 43A # 14-80 Torre 2',
          neighborhoodCity: 'El Poblado, Medellín',
          phone: '+57 320 987 6543',
          personalEmail: 'sebastian.vargas.comercial@outlook.com',
          corporateEmail: null,
          educationLevel: 'PROFESIONAL',
          lastAcademicTitle: 'Mercadeo y Negocios Internacionales',
          eps: 'Sanitas EPS',
          pensionFund: 'Protección',
          severanceFund: 'Fondo Nacional del Ahorro',
          hasChildren: true,
          childrenCount: 1,
          hasBancolombiaAccount: true,
          shirtSize: 'L',
          emergencyContactName: 'Laura Gómez',
          emergencyContactRelationship: 'Esposa / Pareja',
          emergencyContactPhone: '+57 315 667 8899',
          operationalArea: 'VENTAS',
          jobTitle: 'Ejecutivo Comercial Senior',
          costCenter: 'CC-VNT-204',
          reportingManagerEmail: 'director.ventas@alliance.com.co',
          hireDate: '2026-12-01',
          customAttributes: { territory: 'Antioquia & Eje Cafetero' },
        },
        // 3. DSI — Esperando Aprobación obligatoria del Líder DSI (Regla de Negocio)
        {
          status: 'PRE_ONBOARDING',
          fullName: 'Andrés Felipe Castellanos Rincón',
          preferredNameCredentials: 'andres.castellanos',
          nationalId: '1020812345',
          idIssuePlace: 'Cali, Valle del Cauca',
          birthDate: '1992-01-30',
          birthPlace: 'Cali, Valle del Cauca',
          age: calculateAge('1992-01-30'),
          maritalStatus: 'CASADO',
          address: 'Avenida 6N # 28-45 Casa 12',
          neighborhoodCity: 'Granada, Cali',
          phone: '+57 300 512 3498',
          personalEmail: 'af.castellanos.dev@gmail.com',
          corporateEmail: 'andres.castellanos@alliance.com.co',
          educationLevel: 'ESPECIALIZACION',
          lastAcademicTitle: 'Especialista en Arquitectura de Software',
          eps: 'Compensar EPS',
          pensionFund: 'Colfondos',
          severanceFund: 'Porvenir',
          hasChildren: true,
          childrenCount: 2,
          hasBancolombiaAccount: false,
          shirtSize: 'M',
          emergencyContactName: 'Paola Andrea Rincón',
          emergencyContactRelationship: 'Esposa',
          emergencyContactPhone: '+57 318 445 6677',
          operationalArea: 'DSI',
          jobTitle: 'Ingeniero Full-Stack Senior',
          costCenter: 'CC-DSI-301',
          reportingManagerEmail: 'lider.dsi@alliance.com.co',
          hireDate: '2026-12-01',
          customAttributes: { stack: 'TypeScript / NestJS / Cloud', workstation: 'MacBook Pro M4' },
        },
        // 4. VENTAS — Colaborador en proceso de Offboarding + Paz y Salvo Multi-Área
        {
          status: 'OFFBOARDING_PENDING',
          fullName: 'Juliana Patricia Ospina Duarte',
          preferredNameCredentials: 'juliana.ospina',
          nationalId: '52987654',
          idIssuePlace: 'Bogotá D.C.',
          birthDate: '1989-11-05',
          birthPlace: 'Bucaramanga, Santander',
          age: calculateAge('1989-11-05'),
          maritalStatus: 'CASADO',
          address: 'Calle 85 # 19-30 Apto 801',
          neighborhoodCity: 'Chicó, Bogotá D.C.',
          phone: '+57 314 789 0123',
          personalEmail: 'juliana.ospina@gmail.com',
          corporateEmail: 'juliana.ospina@alliance.com.co',
          educationLevel: 'PROFESIONAL',
          lastAcademicTitle: 'Ingeniería Industrial',
          eps: 'Sura EPS',
          pensionFund: 'Protección',
          severanceFund: 'Protección',
          hasChildren: false,
          childrenCount: 0,
          hasBancolombiaAccount: true,
          shirtSize: 'M',
          emergencyContactName: 'Carlos Ospina',
          emergencyContactRelationship: 'Hermano',
          emergencyContactPhone: '+57 312 334 5566',
          operationalArea: 'VENTAS',
          jobTitle: 'Coordinadora de Cuentas Corporativas',
          costCenter: 'CC-VNT-201',
          reportingManagerEmail: 'director.ventas@alliance.com.co',
          hireDate: '2023-03-15',
          terminationDate: in48h,
          customAttributes: { exitReason: 'Renuncia voluntaria' },
        },
        // 5. CUSTOMER — Ex-colaborador INACTIVO para probar detección automática de REINTEGRO (isRehire: true)
        {
          status: 'INACTIVE',
          fullName: 'Diego Alejandro Torres Mejía',
          preferredNameCredentials: 'diego.torres',
          nationalId: '1015432198',
          idIssuePlace: 'Bogotá D.C.',
          birthDate: '1995-06-18',
          birthPlace: 'Bogotá D.C.',
          age: calculateAge('1995-06-18'),
          maritalStatus: 'SOLTERO',
          address: 'Carrera 15 # 104-33',
          neighborhoodCity: 'Santa Bárbara, Bogotá D.C.',
          phone: '+57 301 654 9870',
          personalEmail: 'diego.torres.ex@gmail.com',
          corporateEmail: 'diego.torres@alliance.com.co',
          educationLevel: 'TECNOLOGO',
          lastAcademicTitle: 'Tecnólogo en Gestión Administrativa',
          eps: 'Salud Total',
          pensionFund: 'Porvenir',
          severanceFund: 'Porvenir',
          hasChildren: false,
          childrenCount: 0,
          hasBancolombiaAccount: true,
          shirtSize: 'XL',
          emergencyContactName: 'Gloria Mejía',
          emergencyContactRelationship: 'Madre',
          emergencyContactPhone: '+57 316 998 7766',
          operationalArea: 'CUSTOMER',
          jobTitle: 'Asesor Senior Soporte',
          costCenter: 'CC-CUST-102',
          reportingManagerEmail: 'lider.customer@alliance.com.co',
          hireDate: '2022-01-10',
          terminationDate: new Date('2025-08-31T23:59:00Z'),
          customAttributes: { rehireEligible: true },
        },
      ])
      .returning();

    const [camila, sebastian, andres, juliana] = seededEmployees;

    // 2. Firmas de Habeas Data (Ley 1581)
    await db.insert(dataConsentSignatures).values(
      [camila, sebastian, andres].map((emp) => ({
        employeeId: emp.id,
        policyVersion: HABEAS_DATA_POLICY_VERSION,
        documentSha256Hash: createHash('sha256')
          .update(`${emp.nationalId}:${emp.personalEmail}:${HABEAS_DATA_POLICY_VERSION}`)
          .digest('hex'),
        signatureImageUrl: `http://localhost:9000/alliance-hcm-docs/signatures/${emp.nationalId}.png`,
        signerIp: '190.24.112.45',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0',
        otpVerifiedAt: now,
        signedAt: now,
      })),
    );

    // 3. Documentos de soporte en MinIO
    await db.insert(employeeDocuments).values([
      {
        employeeId: camila.id,
        documentType: 'NATIONAL_ID_PDF',
        fileName: 'cedula_camila_morales.pdf',
        mimeType: 'application/pdf',
        fileSize: 245120,
        s3Key: `employees/${camila.nationalId}/cedula.pdf`,
        s3Url: `http://localhost:9000/alliance-hcm-docs/employees/${camila.nationalId}/cedula.pdf`,
        verified: true,
      },
      {
        employeeId: camila.id,
        documentType: 'BANK_CERTIFICATE',
        fileName: 'certificacion_bancolombia_camila.pdf',
        mimeType: 'application/pdf',
        fileSize: 184320,
        s3Key: `employees/${camila.nationalId}/banco.pdf`,
        s3Url: `http://localhost:9000/alliance-hcm-docs/employees/${camila.nationalId}/banco.pdf`,
        verified: true,
      },
      {
        employeeId: sebastian.id,
        documentType: 'NATIONAL_ID_PDF',
        fileName: 'cedula_sebastian_vargas.pdf',
        mimeType: 'application/pdf',
        fileSize: 210400,
        s3Key: `employees/${sebastian.nationalId}/cedula.pdf`,
        s3Url: `http://localhost:9000/alliance-hcm-docs/employees/${sebastian.nationalId}/cedula.pdf`,
        verified: true,
      },
      {
        employeeId: sebastian.id,
        documentType: 'ACADEMIC_CERTIFICATE',
        fileName: 'diploma_mercadeo_sebastian.pdf',
        mimeType: 'application/pdf',
        fileSize: 512000,
        s3Key: `employees/${sebastian.nationalId}/diploma.pdf`,
        s3Url: `http://localhost:9000/alliance-hcm-docs/employees/${sebastian.nationalId}/diploma.pdf`,
        verified: true,
      },
      {
        employeeId: andres.id,
        documentType: 'NATIONAL_ID_PDF',
        fileName: 'cedula_andres_castellanos.pdf',
        mimeType: 'application/pdf',
        fileSize: 198000,
        s3Key: `employees/${andres.nationalId}/cedula.pdf`,
        s3Url: `http://localhost:9000/alliance-hcm-docs/employees/${andres.nationalId}/cedula.pdf`,
        verified: true,
      },
    ]);

    // 4. Workflows de Onboarding y Offboarding
    const insertedWorkflows = await db
      .insert(onboardingOffboardingWorkflows)
      .values([
        // Camila (CUSTOMER) — En aprovisionamiento IT
        {
          employeeId: camila.id,
          flowType: 'ONBOARDING',
          urgency: 'STANDARD',
          currentStep: 'IT_PROVISIONING',
          helpdeskTicketId: 'SDP-2026-4810',
          helpdeskTicketStatus: 'IN_PROGRESS',
          slaDeadline: in24h,
          isOutOfSla: false,
          provisioningPayload: {
            area: 'CUSTOMER',
            items: AREA_PROVISIONING_RULES.CUSTOMER.provisioningItems,
            template: AREA_PROVISIONING_RULES.CUSTOMER.helpdeskTemplate,
          },
          notes: 'Aprobado por TH. En cola de aprovisionamiento VoIP y CRM.',
        },
        // Sebastián (VENTAS) — Pendiente revisión TH (Fuera de SLA para mostrar alerta en Dashboard)
        {
          employeeId: sebastian.id,
          flowType: 'ONBOARDING',
          urgency: 'STANDARD',
          currentStep: 'TH_REVIEW',
          helpdeskTicketId: null,
          helpdeskTicketStatus: null,
          slaDeadline: expiredSla,
          isOutOfSla: true,
          provisioningPayload: {},
          notes: 'Candidato completó los 24 campos y firmó Habeas Data Ley 1581.',
        },
        // Andrés (DSI) — Bloqueado en Aprobación Líder DSI (Regla obligatoria)
        {
          employeeId: andres.id,
          flowType: 'ONBOARDING',
          urgency: 'STANDARD',
          currentStep: 'DSI_LEADER_APPROVAL',
          helpdeskTicketId: null,
          helpdeskTicketStatus: null,
          slaDeadline: in48h,
          isOutOfSla: false,
          provisioningPayload: {
            area: 'DSI',
            items: AREA_PROVISIONING_RULES.DSI.provisioningItems,
            template: AREA_PROVISIONING_RULES.DSI.helpdeskTemplate,
          },
          notes: 'Aprobado por TH. Requiere validación obligatoria del Líder DSI antes de abrir ticket Helpdesk.',
        },
        // Juliana (VENTAS) — Offboarding activo con Paz y Salvo multi-área
        {
          employeeId: juliana.id,
          flowType: 'OFFBOARDING',
          urgency: 'STANDARD',
          currentStep: 'IT_PROVISIONING',
          helpdeskTicketId: 'SDP-2026-4815',
          helpdeskTicketStatus: 'OPEN',
          slaDeadline: in48h,
          isOutOfSla: false,
          scheduledCutoffAt: in48h,
          provisioningPayload: {
            action: 'REVOKE_ALL_ACCESS',
            scheduledCutoff: '23:59',
          },
          notes: 'Retiro voluntario programado. Revocación de accesos a las 23:59 de la fecha de retiro.',
        },
      ])
      .returning();

    const offboardingWorkflow = insertedWorkflows[3];

    // 5. Paz y Salvo Digital Multi-Área para el Offboarding de Juliana
    await db.insert(clearanceChecklists).values([
      {
        workflowId: offboardingWorkflow.id,
        department: 'IT_HARDWARE_ACCESS',
        status: 'APPROVED',
        approverEmail: 'soporte.it@alliance.com.co',
        notes: 'Portátil Dell Latitude y cargador recibidos en buen estado. Revocación programada.',
        approvedAt: now,
      },
      {
        workflowId: offboardingWorkflow.id,
        department: 'FINANCE',
        status: 'PENDING',
        approverEmail: null,
        notes: 'Pendiente verificación de legalización de viáticos de noviembre.',
      },
      {
        workflowId: offboardingWorkflow.id,
        department: 'FIXED_ASSETS',
        status: 'APPROVED',
        approverEmail: 'activos.fijos@alliance.com.co',
        notes: 'Carnet corporativo y tarjeta de parqueadero entregados.',
        approvedAt: now,
      },
      {
        workflowId: offboardingWorkflow.id,
        department: 'DIRECT_MANAGER',
        status: 'PENDING',
        approverEmail: 'director.ventas@alliance.com.co',
        notes: 'Pendiente acta de entrega de cartera de clientes.',
      },
    ]);

    // 6. Audit Log inicial
    await db.insert(auditLogs).values([
      {
        actorId: 'system-seed',
        action: 'SEED_DATABASE',
        entity: 'employees',
        entityId: camila.id,
        oldValues: null,
        newValues: { seededEmployeesCount: seededEmployees.length },
      },
    ]);

    console.log(
      `✅ Seed completado: ${seededUsers.length} perfiles RBAC, ${seededEmployees.length} colaboradores, 4 workflows y 4 registros de Paz y Salvo.`,
    );
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('❌ Error ejecutando seed:', err);
  process.exit(1);
});
