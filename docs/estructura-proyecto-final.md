# Estructura integral del proyecto Wild Incas

## 1. Proposito del sistema

Wild Incas es un sistema web para administrar un hotel de siete habitaciones. Centraliza reservas, huespedes, habitaciones, limpieza, novedades, notas de venta, pagos, caja, contabilidad, empleados, roles y comprobantes por correo. Su objetivo es evitar registros dispersos, cruces de reservas, calculos manuales y perdida de trazabilidad.

## 2. Problema que resuelve

En una operacion manual la recepcion puede asignar dos veces una habitacion, olvidar un saldo, perder el historial de un huesped o no comunicar una salida a limpieza. Wild Incas mantiene una unica fuente de verdad: la reserva confirmada alimenta ocupacion, la nota de venta alimenta contabilidad, el pago alimenta caja y la salida genera automaticamente la tarea de limpieza.

## 3. Usuarios y permisos

| Rol | Responsabilidad principal |
| --- | --- |
| Administrador | Configuracion total, tarifas, empleados, roles, reportes y auditoria. |
| Gerencia | Indicadores, habitaciones, reservas y supervision operativa. |
| Recepcion | Reservas, huespedes, check-in, consumos, cobros y checkout. |
| Caja | Pagos, movimientos, apertura y cierre. |
| Contabilidad | Ingresos, gastos, indicadores y exportacion Excel. |
| Limpieza | Tareas asignadas y liberacion de habitaciones. |
| Mantenimiento | Incidencias y habitaciones fuera de servicio. |

Los permisos se validan dos veces: el frontend oculta los modulos no autorizados y el API Gateway rechaza con HTTP 403 cualquier operacion que el rol no pueda ejecutar. El administrador puede cambiar modulos sin recrear la sesion del empleado.

## 4. Arquitectura general

```text
Navegador
   |
   v
Frontend React + Vite (Vercel)
   |
   v
API Gateway (autenticacion, permisos, CORS, enrutamiento)
   |
   +--> Servicio descubridor
   +--> Auth
   +--> Rooms
   +--> Guests
   +--> Reservations
   +--> Operations
   +--> Finance
   +--> Employees
   +--> Notifications
             |
             +--> Brevo API (HTTPS)

Cada servicio --> almacen logico aislado en Supabase PostgreSQL
Spring Boot/OpenFeign --> consume Reservations por REST a traves del Gateway
```

## 5. Responsabilidad de cada microservicio

| Servicio | Puerto | Datos propios | Operaciones principales |
| --- | ---: | --- | --- |
| Discovery | 7000 | Registro temporal de servicios | Registro, heartbeat, consulta y baja. |
| Auth | 7101 | Usuarios, sesiones y permisos | Login, perfil, usuarios y control de acceso. |
| Rooms | 7102 | Habitaciones y estados | CRUD, tarifas, disponibilidad y limpieza. |
| Guests | 7103 | Perfiles e historial | CRUD, busqueda e historial del cliente. |
| Reservations | 7108 | Reservas, estadias y consumos | CRUD, cruce de fechas, check-in, cobro y checkout. |
| Operations | 7104 | Novedades y checklist | CRUD, asignacion, resolucion y agenda. |
| Finance | 7105 | Notas, pagos, caja y gastos | CRUD, saldos, movimientos, indicadores y Excel. |
| Employees | 7106 | Empleados y asistencia | CRUD, roles, modulos, entrada y salida laboral. |
| Notifications | 7107 | Cola y comprobantes | Envio idempotente, reintentos y consulta de estado. |
| API Gateway | Publico | Cache de descubrimiento | Punto de entrada, autorizacion y proxy REST. |

El codigo se encuentra en `backend/services`, el descubridor en `backend/discovery`, el Gateway en `backend/api-gateway` y la persistencia compartida en `backend/shared/cloudStore.js`.

## 6. Persistencia y propiedad de datos

Supabase contiene un almacen aislado por dominio: `simot_auth`, `simot_rooms`, `simot_guests`, `simot_reservations`, `simot_operations`, `simot_finance`, `simot_employees` y `simot_notifications`. Cada servicio solo administra su tabla. La fila `state` mantiene una instantanea atomica y las filas `coleccion:id` permiten inspeccionar cada entidad desde el editor de Supabase.

El despliegue actual usa un proyecto Supabase compartido por costo, con aislamiento logico por tabla. Para aislamiento fisico estricto, cada servicio puede recibir credenciales de un proyecto o esquema PostgreSQL propio sin cambiar el contrato REST. Durante la defensa no se debe afirmar que hoy existen ocho servidores de base de datos distintos.

## 7. Flujo completo de una estadia

1. El empleado inicia sesion y el Gateway obtiene su identidad y modulos.
2. Recepcion pulsa **Nueva estadia** y busca un huesped existente o registra uno nuevo.
3. Selecciona fechas, numero de personas y una habitacion disponible.
4. Reservations consulta Rooms y comprueba que no exista una reserva cruzada.
5. Se confirma la estadia; Notifications guarda un evento unico y envia la confirmacion.
6. Durante la estadia se pueden agregar noches o servicios como minibar o lavanderia.
7. El cobro se registra desde la estadia. Finance calcula total, pagado, saldo y cambio.
8. Cuando el saldo llega a cero se habilita **Marcar salida**.
9. El checkout genera la nota de venta final y solicita su envio por correo.
10. Rooms cambia la habitacion a **En limpieza** y Operations crea la tarea.
11. Limpieza pulsa **Completar**; la habitacion vuelve a **Disponible**.
12. Caja, contabilidad, dashboard y Excel leen exactamente los mismos movimientos.

Cobrar y marcar salida son acciones separadas. Una estadia no puede finalizar con saldo pendiente, salvo autorizacion administrativa registrada.

## 8. Habitaciones del establecimiento

| Habitaciones | Piso | Tipo | Capacidad |
| --- | ---: | --- | ---: |
| 1, 2 y 3 | 1 | Matrimonial | 2 |
| 5 | 2 | Matrimonial | 2 |
| 4 y 6 | 2 | Doble cama | 2 |
| 7 | 3 | Grupal/compartida | 6 |

La distribucion correcta es: habitaciones 1, 2 y 3 en el primer piso; 4, 5 y 6 en el segundo; 7 en el tercero. Todas incluyen bano privado, agua caliente, wifi, Smart TV y kit de aseo. El administrador puede modificar precio, capacidad, descripcion, servicios y estado.

## 9. Caja, notas de venta y contabilidad

El hotel opera 24/7. La caja registra responsable, fondo inicial, ingresos, gastos, forma de pago, efectivo esperado, efectivo contado y diferencia. Los turnos sirven para trazabilidad, no para impedir ventas fuera de una franja horaria.

El comprobante comercial se presenta como **Nota de venta**, no como factura tributaria. Incluye numero unico, cliente, documento, habitacion, fechas, noches, consumos, subtotal, pagos, saldo y metodo. Una nota final no se reconstruye con datos temporales de pantalla: se genera a partir del registro guardado.

La exportacion Excel permite elegir fechas e incluye resumen, reservas, notas, pagos, saldos, gastos, ocupacion, consumos, empleados y turnos. Los indicadores principales son ocupacion, ingresos, utilidad operativa, ADR, RevPAR, cancelaciones, duracion media y habitaciones mas solicitadas.

## 10. Correos confiables

Notifications usa la API transaccional de Brevo por HTTPS. Cada correo tiene una clave idempotente para evitar duplicados. Si Brevo falla, la reserva, pago o salida permanece guardada; el comprobante queda en cola con estado pendiente y puede reintentarse. Los correos cubren confirmacion, modificacion, cancelacion, check-in, pago, checkout y bienvenida de empleado.

## 11. Comunicacion REST y Feign Client

El proyecto `spring-feign-integration` demuestra consumo REST entre microservicios. `client/Cliente.java` declara `@FeignClient`; los objetos de intercambio estan en `dto`; `StayIntegrationService` combina la informacion y `StayIntegrationController` publica `GET /api/integration/reservations/{id}/summary`. La prueba `StayIntegrationServiceTest` valida la transformacion.

## 12. Despliegue

- Frontend: Vercel.
- Backend actual: una instancia Render Free ejecuta todos los procesos mediante `backend/start.js`.
- Persistencia: Supabase PostgreSQL.
- Correo: Brevo API.
- Despliegue independiente: `render.microservices.yaml` y scripts `npm run start:<servicio>`.

El modo consolidado reduce costos y permite demostrar la arquitectura. El modo objetivo crea un servicio Render por microservicio, cada uno con URL, variables, escalado y despliegue independiente.

## 13. Pruebas y evidencias

| Prueba | Comando o evidencia |
| --- | --- |
| Smoke del backend | `npm test` |
| Compilacion frontend | `npm run build` en el repositorio frontend |
| Prueba Feign | `mvn test` en `spring-feign-integration` |
| Gateway/Discovery | `GET /health` del backend publico |
| Persistencia | Tablas `simot_*` en Supabase |
| Correo | Historial de Notifications y log transaccional de Brevo |
| Produccion | Vercel y Render con la rama `main` |

## 14. Demostracion recomendada

1. Mostrar login y bienvenida personalizada.
2. Abrir `/health` y senalar todos los servicios registrados.
3. Crear una estadia para un huesped nuevo.
4. Mostrar que la habitacion deja de estar disponible.
5. Registrar pago y revisar caja/contabilidad.
6. Marcar salida y mostrar la tarea en limpieza.
7. Completar limpieza y comprobar que la habitacion vuelve a disponible.
8. Abrir la nota de venta y el estado del correo.
9. Exportar Excel por rango de fechas.
10. Cambiar permisos de un empleado y comprobar el bloqueo del Gateway.
11. Mostrar `Cliente.java`, los DTO y la prueba Feign.

## 15. Limitaciones y siguiente evolucion

- El plan gratuito de Render puede dormir el servicio y causar una primera respuesta lenta.
- El despliegue productivo actual esta consolidado; la separacion fisica requiere varias instancias.
- Supabase esta aislado por tablas dentro de un proyecto; una version empresarial puede usar un proyecto o esquema por servicio.
- La nota de venta no sustituye una factura electronica autorizada por el SRI.
- Las siguientes mejoras son auditoria inmutable, almacenamiento de PDF, respaldo programado, observabilidad central y pruebas end-to-end.

## 16. Relacion con el cronograma

El cronograma completo tiene 30 actividades distribuidas en Analisis y Diseno,
Infraestructura, Desarrollo Core, Modulo Contable y Pruebas y Entrega. La
trazabilidad actividad por actividad, sus fechas y su evidencia se encuentra en
`docs/cumplimiento-cronograma.md`. El manual solicitado en la actividad 28 esta
en `docs/manual-usuario.md`.
