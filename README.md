# Alliance HCM – Core TH & IT (Fase 1 MVP)

Monorepo empresarial API-First que reemplaza las hojas de cálculo (Google Sheets/Excel) por una base de datos relacional transaccional en **PostgreSQL 16 + Drizzle ORM**, automatiza los flujos de **Onboarding** y **Offboarding**, aplica reglas condicionales por área operativa (**Customer, Ventas, DSI**), captura la firma electrónica bajo la **Ley 1581 de 2012 (Habeas Data)** y se integra bidireccionalmente con **ManageEngine ServiceDesk Plus** mediante **BullMQ + Webhooks**.

---

## Arquitectura del Monorepo

```text
alliance-hcm/
├── apps/
│   ├── api/                 # NestJS 11 + TypeScript + Swagger (/api/docs) + BullMQ + Jest
│   └── web/                 # Next.js 16 (App Router) + Tailwind CSS 4 + React Hook Form + TanStack Query
├── packages/
│   ├── database/            # PostgreSQL 16 + Drizzle ORM (6 tablas, índices únicos, seed.ts)
│   └── shared/              # Constantes, Motor de Reglas, Helpers y Schemas Zod compartidos
├── infra/
│   └── docker-compose.yml   # PostgreSQL 16, Redis 7 y MinIO (S3-compatible + bucket init)
├── .env.example
└── package.json             # npm workspaces
```

---

## Requisitos Previos

- **Node.js** `>= 20` (probado en `v24.20.0`) y **npm** `>= 10`
- **Docker** y **Docker Compose** (para PostgreSQL 16, Redis 7 y MinIO)

---

## Puesta en Marcha Local (Paso a Paso)

### 1. Configurar variables de entorno

```bash
cp .env.example .env
```

> Por defecto, `HELPDESK_MOCK_ENABLED=true` permite probar la creación y actualización de tickets de **ManageEngine ServiceDesk Plus** sin credenciales productivas.

### 2. Levantar infraestructura local (PostgreSQL 16, Redis 7 y MinIO)

```bash
npm run docker:up
```

Servicios levantados:
- **PostgreSQL 16:** `localhost:5432` (`alliance_hcm` / `alliance_hcm_secret` / `alliance_hcm_db`)
- **Redis 7 (BullMQ):** `localhost:6379`
- **MinIO S3 API:** `http://localhost:9000` (Consola web: `http://localhost:9001`, usuario `minioadmin` / `minioadmin123`, bucket `alliance-hcm-docs`)

### 3. Instalar dependencias y compilar paquetes compartidos

```bash
npm install
npm run build:packages
```

### 4. Aplicar esquema en PostgreSQL y cargar datos semilla (`seed.ts`)

```bash
npm run db:push
npm run db:seed
```

El script `seed.ts` crea datos realistas:
- **Camila Morales** (`CUSTOMER`) — En aprovisionamiento IT con ticket `SDP-2026-4810`.
- **Sebastián Vargas** (`VENTAS`) — Pendiente de revisión TH (con alerta fuera de SLA).
- **Andrés Castellanos** (`DSI`) — Bloqueado en `DSI_LEADER_APPROVAL` por regla obligatoria de DSI.
- **Juliana Ospina** (`VENTAS`) — Offboarding activo con los 4 registros de Paz y Salvo multi-área.
- **Diego Torres** (`INACTIVE`, cédula `1015432198`) — Ex-colaborador para probar detección automática de **reintegro** (`isRehire: true`).

### 5. Arrancar el Monorepo (API + Web)

```bash
npm run dev
```

Accesos locales:
- **Frontend Web:** [http://localhost:3000](http://localhost:3000)
  - Wizard Pre-Ingreso (5 pasos / 24 campos): `/pre-ingreso/demo-token`
  - Dashboard y Consola TH: `/dashboard/th`
  - Consola Operativa IT / Helpdesk: `/dashboard/it`
  - Offboarding y Paz y Salvo Digital: `/dashboard/offboarding`
- **Backend API:** [http://localhost:4000/api](http://localhost:4000/api)
- **Swagger / OpenAPI:** [http://localhost:4000/api/docs](http://localhost:4000/api/docs)

---

## Verificación de Calidad y Pruebas

```bash
# Compilar paquetes compartidos y verificar tipos en todo el monorepo (0 errores)
npm run build:packages
npm run typecheck

# Ejecutar pruebas unitarias del backend (Motor de Reglas, Anti-Duplicados/Reintegro, Offboarding)
npm run test
```
