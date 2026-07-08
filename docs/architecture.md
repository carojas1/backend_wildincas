# Arquitectura SIMOT v2.0

## Separacion de responsabilidades

El backend esta dividido por dominio, no por pantalla:

- Auth: credenciales, sesiones y perfiles de acceso.
- Rooms: inventario de habitaciones, estados, limpieza y disponibilidad.
- Guests: huespedes, pagos, check-in y check-out.
- Operations: agenda diaria, bitacora, alertas y checklist de turno.
- Finance: caja por turnos, movimientos, ingresos, gastos y reportes.
- Employees: empleados, turnos y permisos operativos.
- Notifications: comprobantes por correo y registro local de envios.

## Componentes de microservicios

```mermaid
flowchart LR
  Frontend["Frontend React/Vite"] --> Gateway["API Gateway :8080"]
  Gateway --> Discovery["Service Discovery :7000"]
  Auth["Auth :7101"] --> Discovery
  Rooms["Rooms :7102"] --> Discovery
  Guests["Guests :7103"] --> Discovery
  Operations["Operations :7104"] --> Discovery
  Finance["Finance :7105"] --> Discovery
  Employees["Employees :7106"] --> Discovery
  Notifications["Notifications :7107"] --> Discovery
  Gateway --> Auth
  Gateway --> Rooms
  Gateway --> Guests
  Gateway --> Operations
  Gateway --> Finance
  Gateway --> Employees
  Gateway --> Notifications
```

## Flujo principal

1. Cada microservicio levanta en su propio puerto.
2. Cada microservicio se registra en `discovery` con nombre y URL.
3. El frontend llama solo al `api-gateway`.
4. El gateway resuelve el servicio en discovery y reenvia la peticion.
5. Notifications prepara comprobantes por correo; si no hay SMTP, queda registrado en modo local.

## Cronograma aplicado

El Gantt entregado cubre analisis, infraestructura, desarrollo core, modulo contable, pruebas y entrega. Esta base local deja implementadas las actividades necesarias hasta la fecha actual del entorno, 2026-07-07:

- Analisis y diseno: modulos definidos desde el PDF y capturas.
- Infraestructura: monorepo, scripts, gateway, discovery y servicios independientes.
- Desarrollo core: auth, dashboard, habitaciones, huespedes, limpieza, bitacora y checklist.
- Modulo contable: caja por turnos, movimientos, resumen financiero y comprobantes.
- Pruebas y entrega: smoke test, build frontend, auditoria npm y documentacion tecnica.

## Mejoras frente al informe original

- Backend desacoplado en microservicios, no una sola API.
- API Gateway como unico punto de entrada del frontend.
- Service Discovery para registro dinamico.
- Servicio de notificaciones para comprobantes por correo.
- Auditoria de dependencias sin vulnerabilidades conocidas.
- Prueba de humo automatizada para login, habitaciones, huespedes y comprobantes.
