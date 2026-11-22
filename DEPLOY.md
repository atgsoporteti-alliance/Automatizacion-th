# Guía de Despliegue para Feedback / UAT — Alliance HCM

La arquitectura recomendada para compartir una URL pública con tu jefe en minutos (plan gratuito/hobby):
- **Base de datos + Auth:** Supabase (ya configurado: proyecto `lyvnakpcmknesqxlvawq`)
- **Backend API (`apps/api`):** Render o Railway (usando `apps/api/Dockerfile`)
- **Frontend Web (`apps/web`):** Vercel

---

## Paso 1: Subir el código a GitHub
```bash
git add .
git commit -m "feat: Alliance HCM Fase 1 MVP + RBAC Supabase"
git push origin main
```

---

## Paso 2: Desplegar Backend (`apps/api`) en Render o Railway
1. Crea un nuevo **Web Service** conectado a tu repositorio.
2. Configura **Docker** apuntando a `apps/api/Dockerfile` (Contexto de build: raíz `.`).
3. Configura las variables de entorno en Render/Railway:
   - `NODE_ENV=production`
   - `DATABASE_URL=postgresql://postgres.lyvnakpcmknesqxlvawq:[TU-PASSWORD-URL-ENCODED]@aws-1-us-west-2.pooler.supabase.com:5432/postgres`
   - `WEB_URL=https://tu-app.vercel.app` (actualízalo luego de crear Vercel)
   - `JWT_SECRET=cambia-este-secreto-en-uat`
   - `HELPDESK_MOCK_ENABLED=true`
   - `SUPABASE_URL=https://lyvnakpcmknesqxlvawq.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_86PaPJymKcDSLKX_5QVagA_7a4L6s00`
   - `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` *(permite que tu jefe pruebe los 6 roles en 1 clic durante UAT; pon `false` en producción final)*
4. Copia la URL pública generada (ej: `https://alliance-hcm-api.onrender.com`).

---

## Paso 3: Desplegar Frontend (`apps/web`) en Vercel
1. Importa el mismo repositorio en **Vercel**.
2. En **Root Directory**, selecciona `apps/web`.
3. En **Build & Development Settings**:
   - **Install Command:** `cd ../.. && npm install`
   - **Build Command:** `cd ../.. && npm run build:packages && npm run build --workspace=@alliance-hcm/web`
4. Agrega las variables de entorno en Vercel:
   - `NEXT_PUBLIC_API_URL=https://alliance-hcm-api.onrender.com/api`
   - `NEXT_PUBLIC_SUPABASE_URL=https://lyvnakpcmknesqxlvawq.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_86PaPJymKcDSLKX_5QVagA_7a4L6s00`
   - `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` *(para UAT con selector rápido de roles)*
5. Haz clic en **Deploy** y actualiza `WEB_URL` en el backend con la URL de Vercel.

---

## Opción Express (Demo inmediata desde tu PC con Cloudflare Tunnel)
Si solo quieres mostrarle hoy en una llamada sin configurar Vercel/Render todavía:
```bash
# 1. Asegúrate de tener corriendo: npm run dev
# 2. En dos terminales aparte (con cloudflared instalado):
cloudflared tunnel --url http://localhost:3000
```
