# Checklist de evaluacion - Microservicios SIMOT Wild Incas

## 1. Seleccion de funcionalidades

Funcionalidades clave separadas:

- Gestion de habitaciones: inventario, tarifas, disponibilidad, limpieza y estados.
- Gestion de huespedes: check-in, check-out, pagos, historial y datos del cliente.
- Finanzas: caja, movimientos, ingresos, gastos y exportacion Excel.
- Empleados: cuentas, roles, turnos y permisos por modulo.
- Operaciones: bitacora, agenda, checklist y mantenimiento.
- Notificaciones: notas de venta, correos y comprobantes.

## 2. Diseno modular

Cada funcionalidad vive en un servicio independiente:

- `backend/services/rooms/server.js`
- `backend/services/guests/server.js`
- `backend/services/finance/server.js`
- `backend/services/employees/server.js`
- `backend/services/operations/server.js`
- `backend/services/notifications/server.js`
- `backend/services/auth/server.js`

Cada microservicio expone API REST con operaciones CRUD o acciones de negocio equivalentes.

Persistencia separada en Supabase:

- `simot_rooms`
- `simot_guests`
- `simot_finance`
- `simot_employees`
- `simot_operations`
- `simot_notifications`
- `simot_auth`

## 3. Infraestructura

Servicio descubridor:

- Archivo: `backend/discovery/server.js`
- Registra servicios con `POST /register`.
- Lista servicios con `GET /services`.
- Verifica salud con `GET /health`.

API Gateway:

- Archivo: `backend/api-gateway/server.js`
- Punto unico de entrada del frontend.
- Rutas:
  - `/api/auth`
  - `/api/rooms`
  - `/api/guests`
  - `/api/operations`
  - `/api/finance`
  - `/api/employees`
  - `/api/notifications`

## 4. Despliegue

Modo cloud actual:

- Frontend: Vercel.
- Backend: Render.
- Datos: Supabase.
- Correos: Brevo.

Modo independiente soportado:

- Cada microservicio tiene script `npm run start:<servicio>`.
- El blueprint `render.microservices.yaml` permite desplegar cada servicio como Web Service propio.

## 5. Demostracion minima para el video

1. Abrir frontend en Vercel.
2. Mostrar login.
3. Entrar a habitaciones y filtrar disponibles/ocupadas/limpieza.
4. Registrar un nuevo ingreso/check-in.
5. Mostrar que el pago aparece en Finanzas.
6. Registrar salida del huesped y mostrar la habitacion enviada a limpieza.
7. Completar limpieza y mostrar habitacion disponible.
8. Abrir `https://backend-wildincas.onrender.com/health` y mostrar servicios registrados.
9. Abrir `https://backend-wildincas.onrender.com/api/rooms/summary` y explicar que pasa por Gateway.
10. Mostrar exportacion Excel desde Finanzas.

## 6. Frase de cierre

SIMOT aplica arquitectura de microservicios porque cada modulo del hotel tiene responsabilidad propia, API REST propia, persistencia separada y despliegue independiente. El frontend no conoce los servicios internos; consume un API Gateway, y el Gateway usa el servicio descubridor para enrutar dinamicamente hacia cada microservicio.
