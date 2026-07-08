# Backend Wild Incas - SIMOT v2.0

Backend de microservicios para el sistema hotelero Wild Incas.

## Ejecutar

```bash
npm install
npm run dev
```

- Gateway: http://127.0.0.1:8080
- Discovery: http://127.0.0.1:7000/services

## Servicios

- `discovery`: servicio descubridor con heartbeat y estado `healthy/stale`.
- `api-gateway`: unica entrada HTTP para el frontend.
- `auth`: usuarios, roles, sesiones y permisos por modulo.
- `rooms`: habitaciones, precios, estados, limpieza y observaciones.
- `guests`: huespedes, pagos, check-in y check-out.
- `operations`: agenda, bitacora, incidencias y checklist.
- `finance`: caja por turnos, movimientos, metodos de pago y exportacion Excel.
- `employees`: empleados, turnos y modulos asignados.
- `notifications`: comprobantes, bienvenida de empleados y SMTP Brevo.

## Despliegue por microservicio

Cada servicio tiene script independiente:

```bash
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

El archivo `render.microservices.yaml` muestra como separarlos en Render con `DISCOVERY_URL` y `SERVICE_URL`.

## Variables

Copiar `.env.example` y configurar SMTP para envio real de comprobantes.

Guia de despliegue y Brevo: `docs/deployment.md`.
