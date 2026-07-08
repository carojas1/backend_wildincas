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

- Auth y roles
- Habitaciones
- Huespedes
- Operaciones y bitacora
- Caja, movimientos y exportacion Excel
- Empleados
- Notificaciones y comprobantes

## Variables

Copiar `.env.example` y configurar SMTP para envio real de comprobantes.

Guia de despliegue y Brevo: `docs/deployment.md`.
