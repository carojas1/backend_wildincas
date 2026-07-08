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

## Despliegue independiente por microservicio

Para cumplir arquitectura de microservicios en produccion, usa un servicio Render por componente:

1. Crear primero `wildincas-discovery`.
2. Crear despues Auth, Rooms, Guests, Operations, Finance, Employees y Notifications.
3. En cada microservicio configurar `DISCOVERY_URL=https://wildincas-discovery.onrender.com`.
4. En cada microservicio configurar `SERVICE_URL` con su URL publica.
5. Crear por ultimo `wildincas-gateway` y configurar `DISCOVERY_URL`.
6. En Vercel usar el gateway: `VITE_API_URL=https://wildincas-gateway.onrender.com/api`.

Scripts de arranque:

```text
npm run start:discovery
npm run start:gateway
npm run start:auth
npm run start:rooms
npm run start:guests
npm run start:operations
npm run start:finance
npm run start:employees
npm run start:notifications
```

`render.microservices.yaml` contiene un blueprint de referencia. En una cuenta gratis puede mantenerse el modo demo `npm start`, pero para la defensa se explica que cada servicio puede desplegarse y escalar de forma independiente con esos scripts.

Variables comunes para servicios con datos:

```text
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_JWKS_URL=...
```

Variables solo para Notifications:

```text
MAIL_HOST=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=...
MAIL_PASS=...
MAIL_FROM=...
APP_PUBLIC_URL=...
```

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
