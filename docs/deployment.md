# Despliegue SIMOT Wild Incas

## Backend en Render

Crear un **Web Service** desde el repositorio `backend_wildincas`.

Valores:

- Name: `backend-wildincas`
- Runtime: `Node`
- Branch: `main`
- Build Command: `npm install`
- Start Command: `npm start`
- Instance type: Starter o Free si esta disponible.

Variables de entorno:

```text
NODE_ENV=production
DISCOVERY_PORT=7000
AUTH_PORT=7101
ROOMS_PORT=7102
GUESTS_PORT=7103
OPERATIONS_PORT=7104
FINANCE_PORT=7105
EMPLOYEES_PORT=7106
NOTIFICATIONS_PORT=7107
MAIL_HOST=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=TU_LOGIN_SMTP_DE_BREVO
MAIL_PASS=TU_SMTP_KEY_DE_BREVO
MAIL_FROM=Wild Incas <correo_verificado_en_brevo@tudominio.com>
APP_PUBLIC_URL=https://TU_FRONTEND.vercel.app
GATEWAY_PUBLIC_URL=https://TU_BACKEND.onrender.com
SUPABASE_URL=https://rfzqwfczhubbprdohamb.supabase.co
SUPABASE_PUBLISHABLE_KEY=TU_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=TU_SECRET_KEY
SUPABASE_JWKS_URL=https://rfzqwfczhubbprdohamb.supabase.co/auth/v1/.well-known/jwks.json
```

Render define `PORT` automaticamente. El API Gateway lo usa cuando existe.

## Brevo

En Brevo usa correo transaccional SMTP:

1. Ir a SMTP & API.
2. Copiar el **SMTP login** en `MAIL_USER`.
3. Crear/copiar una **SMTP key** en `MAIL_PASS`.
4. Usar `smtp-relay.brevo.com` y puerto `587`.
5. Verificar el correo/remitente que pondras en `MAIL_FROM`.

Importante: `MAIL_PASS` debe ser la clave SMTP, no tu contrasena de Brevo ni una API key.

## Flujos de correo implementados

- Nota de venta / comprobante al huesped.
- Bienvenida de empleado con usuario y contrasena temporal.
- Prueba de Brevo desde el modulo Usuarios.

## Frontend en Vercel

En Vercel, el frontend debe apuntar al backend publicado:

```text
VITE_API_URL=https://TU_BACKEND.onrender.com/api
```

Despues de cambiar esta variable, redeploy.

## Supabase Cloud

Antes de usar Render con Supabase, entra a Supabase SQL Editor y ejecuta:

```sql
create table if not exists public.simot_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.simot_state enable row level security;
```

El backend guarda ahi habitaciones, huespedes, caja, usuarios, empleados, novedades y comprobantes.
