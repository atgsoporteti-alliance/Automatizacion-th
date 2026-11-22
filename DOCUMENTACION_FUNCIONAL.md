# Alliance HCM – Core TH & IT (Fase 1 MVP)
## Guía Funcional, Roles y Manual de Uso

---

## 1. Descripción General del Sistema

**Alliance HCM – Core TH & IT** es una plataforma web empresarial diseñada para centralizar y automatizar el ciclo de vida del colaborador desde el pre-ingreso hasta el retiro, reemplazando el uso de hojas de cálculo (Google Sheets/Excel) por una base de datos relacional transaccional con trazabilidad completa.

### Capacidades Principales
- **Expediente Digital Único (24 Campos Alliance):** Almacenamiento centralizado de datos personales, ubicación, dotación, formación académica, seguridad social, datos bancarios y contacto de emergencia.
- **Portal Aislado de Pre-Ingreso para Candidatos:** Enlace seguro temporal (Magic Link) con validación de identidad mediante código OTP y firma electrónica manuscrita certificada bajo la **Ley 1581 de 2012 (Habeas Data)**.
- **Almacenamiento Documental en la Nube:** Carga de soportes (Cédula, Diploma/Acta, Certificación Bancaria y Firma) en el bucket **`alliance`** de Supabase Storage, con **previsualización en la misma página** y **descarga directa**.
- **Motor de Reglas por Área Operativa:** Aprovisionamiento diferenciado para **Customer**, **Ventas** y **DSI** (con aprobación obligatoria del Líder DSI antes de escalar a IT).
- **Integración con Helpdesk (ManageEngine ServiceDesk Plus):** Generación automática de tickets en cola asíncrona y actualización bidireccional de estados mediante Webhooks.
- **Offboarding y Paz y Salvo Multi-Área:** Gestión de retiros programados (`STANDARD` con corte automático a las 23:59) o críticos inmediatos (`CRITICAL_IMMEDIATE`), con semáforo digital de aprobación para 4 áreas.
- **Seguridad RBAC y Auditoría Inmutable:** Control estricto de acceso por rol, enmascaramiento de datos sensibles (Data Masking) y registro automático en bitácora de auditoría (`audit_logs`).

---

## 2. Matriz de Roles y Permisos (RBAC)

El acceso al sistema está segmentado en **7 roles**:

| Rol | Alcance Principal | Qué Puede Hacer | Restricciones / Datos Protegidos |
| :--- | :--- | :--- | :--- |
| **`CANDIDATE`** | Portal Pre-Ingreso (`/pre-ingreso/[token]`) | Diligenciar los 5 pasos de pre-ingreso, adjuntar PDFs/imágenes, previsualizar sus archivos y firmar Ley 1581 con OTP. | Acceso temporal mediante enlace único. No visualiza el menú lateral ni ningún módulo interno del HCM. |
| **`TH_ANALYST`** | Consola TH (`/dashboard/th`) y Offboarding | Generar links de pre-ingreso, revisar los 24 campos, ver/descargar soportes, devolver pre-ingresos para corrección, asignar área/cargo/centro de costos, aprobar Onboarding e iniciar retiros `STANDARD`. | No puede ejecutar retiros `CRITICAL_IMMEDIATE`, cancelar por `NO_SHOW`, ni administrar usuarios del sistema. |
| **`TH_ADMIN`** | Consola TH, Offboarding y Bitácora | Todo lo de `TH_ANALYST` + ejecutar retiros `CRITICAL_IMMEDIATE`, cancelar ingresos por `NO_SHOW` y consultar `audit_logs`. | No administra roles ni usuarios en `/dashboard/admin/users`. |
| **`AREA_LEADER`** | Mi Equipo (`/dashboard/team`) y Offboarding | Ver colaboradores únicamente de su área operativa (`CUSTOMER`, `VENTAS` o `DSI`). Si es líder de **DSI**, aprueba la puerta obligatoria `DSI_LEADER_APPROVAL`. En retiros, firma el ítem `DIRECT_MANAGER`. | No puede ver colaboradores de otras áreas ni datos sensibles de TH (EPS, pensión, cesantías, cuenta Bancolombia, hijos ni estado civil). |
| **`IT_SUPPORT`** | Consola IT (`/dashboard/it`) y Offboarding | Gestionar la cola de aprovisionamiento filtrable por área, simular/sincronizar webhooks de ServiceDesk Plus y firmar el ítem `IT_HARDWARE_ACCESS` en Paz y Salvo. | Tiene bloqueado el acceso a datos sensibles de TH (EPS, pensión, cesantías, cuenta Bancolombia, hijos y estado civil). |
| **`CLEARANCE_APPROVER`** | Offboarding (`/dashboard/offboarding`) | Aprobar o reportar pendientes exclusivamente en su departamento de Paz y Salvo (`FINANCE` o `FIXED_ASSETS`). | No tiene acceso a los tableros de TH, IT ni administración. |
| **`SUPER_ADMIN`** | Acceso total (`/dashboard/admin/users`, `/dashboard/admin/audit-logs`, TH, IT, Equipo, Offboarding) | Control completo de módulos, gestión de usuarios/roles/estados y consulta de bitácora de auditoría. | Sin restricciones. |

### Cuentas de Prueba Habilitadas (Entorno UAT)
En la pantalla **`/login`**, además del ingreso con correo/contraseña mediante Supabase Auth, se encuentra habilitado un selector de **Acceso Rápido por Rol** para pruebas funcionales:

- **Analista TH:** `th.analista@alliance.com`
- **Administrador / Líder TH:** `th.lider@alliance.com`
- **Líder de Área (DSI):** `lider.dsi@alliance.com`
- **Soporte IT / Helpdesk:** `soporte.it@alliance.com`
- **Aprobador Paz y Salvo (Finanzas):** `finanzas@alliance.com`
- **Super Administrador:** `admin@alliance.com`

---

## 3. Guía de Uso por Módulo

### 3.1. Generación de Enlace de Pre-Ingreso (Rol TH)
1. Ingresa a **Consola de Validación TH** (`/dashboard/th`) o haz clic en **Generar Link de Pre-Ingreso** en el menú lateral.
2. Haz clic en **Generar Nuevo Link Seguro**.
3. Copia el enlace generado (vigencia de 72 horas) y compártelo con el candidato. No requiere pre-llenar datos del candidato.

---

### 3.2. Portal de Pre-Ingreso Digital (Rol Candidato)
Al abrir el enlace recibido (`/pre-ingreso/[token]`), el sistema valida la firma JWT del acceso y presenta un asistente obligatorio de **5 pasos** con autoguardado local. No es posible avanzar de paso ni saltar pestañas si faltan campos obligatorios.

- **Paso 1 — Identificación y Datos Personales:**
  - Nombre completo, nombre preferido para credenciales, número de cédula, lugar de expedición, fecha de nacimiento (calcula la edad automáticamente; mínimo 14 años), lugar de nacimiento y estado civil.
  - **Validación en tiempo real:** Verifica si la cédula o correo ya existen en el sistema. Si corresponde a un ex-colaborador en estado `INACTIVE`, lo identifica automáticamente como **Reintegro** para conservar su expediente histórico sin duplicar registros; si está activo, bloquea el avance.
- **Paso 2 — Ubicación, Contacto y Dotación:**
  - Dirección, barrio y ciudad, celular, correo electrónico personal, indicador de hijos (si marca Sí, exige mínimo 1 hijo) y selector visual de talla de camiseta (`XS` a `XXL`).
- **Paso 3 — Formación Académica y Soportes:**
  - Nivel de escolaridad y último título académico.
  - Carga obligatoria en la nube de **Cédula de Ciudadanía** y **Diploma / Acta de Grado** (PDF o imagen hasta 10 MB).
  - Cada archivo muestra inmediatamente una **vista previa en pequeño en esa misma sección**, además de botones para **Ampliar** (modal completo) y **Descargar**.
- **Paso 4 — Seguridad Social y Banco:**
  - **EPS** *(obligatoria)*.
  - **Fondo de Pensión** y **Fondo de Cesantías** *(opcionales; pueden dejarse vacíos si no aplica)*.
  - **Cuenta Bancolombia (Sí/No):** Si marca Sí, es obligatorio adjuntar la **Certificación Bancaria**, también con vista previa en pequeño y descarga.
- **Paso 5 — Emergencia, Ley 1581 y Firma OTP:**
  - Contacto de emergencia (nombre, parentesco y celular).
  - Lectura y aceptación expresa de la Política de Tratamiento de Datos (**Ley 1581 de 2012**).
  - **Canvas de firma electrónica manuscrita** (se almacena como PNG y se sella criptográficamente con hash `SHA-256`, IP, navegador y fecha/hora).
  - **Verificación OTP:** Botón para solicitar código de 6 dígitos al correo personal *(en entorno de pruebas también acepta `123456`)*.

---

### 3.3. Revisión, Devolución y Aprobación en Consola TH (`/dashboard/th`)
1. **KPIs Superiores:** Monitoreo de Ingresos Activos, Pendientes de Aprobación, Alertas Fuera de SLA y Retiros en Paz y Salvo.
2. **Validación del Expediente:**
   - Al seleccionar un candidato en la cola, se muestran los 24 datos completos, los soportes adjuntos y la firma Ley 1581.
   - Con los botones **Ver** y **Descargar**, el analista puede previsualizar PDFs/imágenes o la firma manuscrita dentro de la misma pantalla, o descargarlos a su equipo.
3. **Devolver Pre-Ingreso para Corrección:**
   - Si el candidato cometió un error en sus datos o subió un documento ilegible, el analista escribe el motivo en el bloque **Devolver Pre-Ingreso para Corrección de Datos** y hace clic en **Devolver al Candidato y Generar Link de Corrección**.
   - El estado pasa a `CANDIDATE_PENDING` y genera un enlace seguro que, al abrirlo el candidato, muestra el aviso de corrección de TH y **pre-carga todos sus 24 campos y archivos previos** para que corrija únicamente lo necesario y vuelva a enviar.
4. **Asignación de Área y Disparo a IT:**
   - Selecciona la campaña/área operativa (**Customer**, **Ventas** o **DSI**), cargo, centro de costos, jefe directo y fecha de ingreso.
   - El sistema previsualiza automáticamente los accesos/equipos que se aprovisionarán según el Motor de Reglas:
     - **Customer (SLA 24h):** Correo corporativo, Usuario CRM Atención, Extensión VoIP + Diadema USB y Permisos Base de Conocimiento. *(Abre ticket en Helpdesk inmediatamente).*
     - **Ventas (SLA 24h):** Correo corporativo, Licencia CRM Comercial (Pipeline), Línea Telefónica Comercial y Herramientas de Prospección. *(Abre ticket en Helpdesk inmediatamente).*
     - **DSI (SLA 48h):** Correo corporativo, Repositorios Git, Perfil VPN (MFA), Licencias Dev & Cloud y Hardware de Alto Rendimiento. *(Por regla obligatoria, el flujo queda en **`DSI_LEADER_APPROVAL`** hasta que el Líder de DSI apruebe antes de crear el ticket en Helpdesk).*
5. **Cancelación por No-Show (Día 1):**
   - Exclusivo para `TH_ADMIN` y `SUPER_ADMIN`: si el colaborador no se presenta el primer día, revoca el flujo (`CANCELLED_NO_SHOW`), marca al colaborador como `NO_SHOW` y cancela automáticamente el ticket asociado en Helpdesk.

---

### 3.4. Consola Operativa IT / Helpdesk (`/dashboard/it`)
- Muestra la cola de solicitudes de aprovisionamiento y revocación filtrable por **Customer**, **Ventas** y **DSI**.
- Presenta una **línea de tiempo visual** por cada caso (`Revisión TH` → `Aprobación Líder DSI` → `Ticket Helpdesk Creado` → `Aprovisionamiento IT` → `Completado`).
- Incluye controles para simular la respuesta de webhook de **ManageEngine ServiceDesk Plus** (`IN_PROGRESS` y `RESOLVED`); al marcarse como `RESOLVED`, el workflow se completa y el colaborador pasa a estado `ACTIVE`.

---

### 3.5. Mi Equipo y Puerta DSI (`/dashboard/team`)
- Vista diseñada para los **Líderes de Área (`AREA_LEADER`)**.
- Lista únicamente a los colaboradores de su área operativa (sin mostrar información sensible de TH).
- Si el usuario es líder de **DSI**, habilita la bandeja de aprobación para desbloquear ingresos pendientes en `DSI_LEADER_APPROVAL` y disparar el ticket hacia IT.

---

### 3.6. Gestión de Offboarding y Paz y Salvo Digital (`/dashboard/offboarding`)
1. **Inicio de Retiro:**
   - **`STANDARD`:** Programa la baja para las `23:59` de la fecha de retiro seleccionada (ejecutada automáticamente mediante tarea programada diaria).
   - **`CRITICAL_IMMEDIATE`** *(exclusivo `TH_ADMIN` y `SUPER_ADMIN`)*: Dispara de inmediato la revocación de sesiones/accesos y crea un ticket urgente en Helpdesk.
2. **Semáforo Multi-Área de Paz y Salvo:**
   - Al iniciar cualquier retiro, se generan automáticamente 4 registros independientes en `clearance_checklists`:
     1. **IT — Hardware y Revocación de Accesos** (`IT_HARDWARE_ACCESS`, firmado por `IT_SUPPORT`)
     2. **Finanzas — Nómina, Anticipos y Viáticos** (`FINANCE`, firmado por `CLEARANCE_APPROVER` de Finanzas)
     3. **Activo Fijo — Inventario y Dotación** (`FIXED_ASSETS`, firmado por `CLEARANCE_APPROVER` de Activo Fijo)
     4. **Jefe Directo — Entrega de Cargo** (`DIRECT_MANAGER`, firmado por `AREA_LEADER` del área correspondiente)
   - Cada área puede **Aprobar** o **Reportar Pendiente** con observaciones. Cuando los 4 ítems están aprobados, el workflow finaliza (`COMPLETED`) y el colaborador pasa automáticamente a estado `INACTIVE`.

---

### 3.7. Administración y Auditoría
- **Usuarios y Roles (`/dashboard/admin/users` — exclusivo `SUPER_ADMIN`):** Permite cambiar el rol RBAC de cada cuenta, asignar su área operativa o departamento de Paz y Salvo y activar/desactivar el acceso al sistema.
- **Bitácora de Auditoría (`/dashboard/admin/audit-logs` — `SUPER_ADMIN` y `TH_ADMIN`):** Consulta inmutable de todas las acciones ejecutadas en la plataforma, con filtros por actor y tipo de acción.
