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

## Paso 2: Desplegar Backend (`apps/api`) en Render
1. En Render crea un **Web Service** conectado a tu repositorio (o importa `render.yaml` como Blueprint).
2. En **Build & Start** (si lo creas manualmente como **Node**):
   - **Build Command:** `npm install && npm run build:api`
   - **Start Command:** `npm run start:api`
   *(No uses `npm run build` en Render porque ese script compila también el frontend `apps/web`).*
3. Configura las variables de entorno en Render:
   - `NODE_ENV=production` *(Importante: déjalo exactamente en `production`)*
   - `DATABASE_URL=postgresql://postgres.<project-ref>:<tu-password-url-encoded>@aws-1-us-west-2.pooler.supabase.com:5432/postgres`
   - `WEB_URL=https://tu-app.vercel.app` *(o `.netlify.app`; puedes separar múltiples URLs por coma)*
   - `JWT_SECRET=cambia-este-secreto-en-uat`
   - `HELPDESK_MOCK_ENABLED=true`
   - `SUPABASE_URL=https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-supabase-publishable-key>`
   - `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` *(permite que tu jefe pruebe los 6 roles en 1 clic durante UAT; pon `false` en producción final)*
4. Copia la URL pública generada (ej: `https://alliance-hcm-api.onrender.com`).

---

## Paso 3: Desplegar Frontend (`apps/web`) en Vercel o Netlify
1. Importa el mismo repositorio en **Vercel** (o **Netlify** usando `netlify.toml`).
2. En **Vercel**, selecciona Root Directory `apps/web` (`Install: cd ../.. && npm install`, `Build: cd ../.. && npm run build:web`). En **Netlify**, deja Base directory vacío.
3. Agrega las variables de entorno:
   - `NEXT_PUBLIC_API_URL=https://alliance-hcm-api.onrender.com/api`
   - `NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-supabase-publishable-key>`
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
