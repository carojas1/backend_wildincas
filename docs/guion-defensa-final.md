# Guion de defensa final (15 a 18 minutos)

## 0:00-1:00 - Presentacion

**Mostrar:** portada con nombre del proyecto, integrantes, carrera y fecha.

**Decir:**

> Presentamos Wild Incas, un sistema web de gestion hotelera para centralizar reservas, habitaciones, huespedes, cobros, caja, contabilidad, personal y comunicaciones. El proyecto aplica arquitectura de microservicios, servicio descubridor, API Gateway y consumo REST mediante OpenFeign.

## 1:00-2:30 - Problema y justificacion

**Mostrar:** problema y flujo manual.

**Decir:**

> El problema principal es la fragmentacion de la informacion. Una reserva anotada por separado puede producir cruces de habitaciones, saldos incorrectos y falta de coordinacion con limpieza. La solucion crea una sola trazabilidad desde la llegada hasta la salida y el reporte contable.

## 2:30-3:30 - Objetivos y publico

**Decir:**

> El objetivo general fue desarrollar un sistema hotelero integral y seguro. Como objetivos especificos se definieron evitar reservas cruzadas, automatizar el ciclo de la estadia, controlar pagos y caja, gestionar permisos y producir comprobantes y reportes. Los usuarios son administracion, gerencia, recepcion, caja, contabilidad, limpieza y mantenimiento.

## 3:30-6:00 - Arquitectura

**Mostrar:** diagrama y carpetas del backend.

**Decir:**

> Separamos responsabilidades en Auth, Rooms, Guests, Reservations, Operations, Finance, Employees y Notifications. Cada servicio expone una API REST y administra su propio almacen logico. El API Gateway es el unico punto de entrada: valida el token, verifica permisos y consulta al servicio descubridor para localizar el destino.

> El descubridor recibe el registro y heartbeat de cada servicio. En el despliegue gratuito los procesos comparten una instancia Render, pero siguen siendo procesos, puertos, contratos y scripts independientes. El archivo render.microservices.yaml permite desplegarlos por separado.

**Mostrar en navegador:** `https://backend-wildincas.onrender.com/health`.

## 6:00-8:00 - Feign Client

**Mostrar:** `Cliente.java`, `ReservationDto`, `GuestDto`, `StayIntegrationService` y el test.

**Decir:**

> Para demostrar consumo REST entre microservicios creamos un proyecto Spring Boot. La interfaz Cliente usa la anotacion FeignClient para consultar Reservations mediante el Gateway. Los DTO estructuran solamente la informacion necesaria y evitan acoplar la aplicacion Java al modelo interno del servicio Node. La capa de negocio transforma la respuesta en StaySummaryDto y una prueba automatizada verifica el resultado.

## 8:00-12:30 - Demostracion funcional

1. Iniciar sesion y mostrar bienvenida y modulos permitidos.
2. Crear una nueva estadia con huesped, documento, fechas y habitacion.
3. Mostrar que la disponibilidad cambia y que no se admiten fechas cruzadas.
4. Agregar un consumo o noche adicional.
5. Registrar un pago y mostrar total, recibido, cambio y saldo.
6. Abrir caja/contabilidad y comprobar el movimiento.
7. Marcar salida una vez pagado el total.
8. Abrir Limpieza y completar la tarea de la habitacion.
9. Verificar que vuelve a Disponible.
10. Abrir la nota de venta y el estado de envio del correo.

**Decir durante el flujo:**

> Cobrar y marcar salida son operaciones distintas. El pago modifica caja y saldo; la salida cierra la estadia, genera el comprobante final y envia la habitacion a limpieza. Al completar la tarea, Rooms vuelve a habilitarla.

## 12:30-14:00 - Datos, seguridad y reportes

**Mostrar:** tablas `simot_*`, permisos y exportacion.

**Decir:**

> Supabase mantiene un almacen por dominio y filas individuales para auditoria visual. Los permisos no dependen solo de la interfaz: el Gateway devuelve 403 ante accesos no autorizados. Contabilidad usa los mismos pagos y gastos guardados y permite exportar un Excel por fechas, evitando duplicar calculos.

## 14:00-15:30 - Pruebas y resultados

**Decir:**

> Ejecutamos pruebas smoke del backend, compilacion de produccion del frontend, pruebas unitarias de la integracion Feign y validaciones manuales en Vercel, Render, Supabase y Brevo. Como resultado, el sistema integra el ciclo operativo del hotel y conserva trazabilidad entre modulos.

## 15:30-17:00 - Limitaciones y conclusiones

**Decir:**

> La instancia gratuita de Render puede tardar en despertar. Ademas, los almacenes estan aislados por tabla dentro de un proyecto Supabase compartido y la nota de venta no reemplaza facturacion electronica del SRI. Como trabajo futuro proponemos despliegue fisico por servicio, auditoria inmutable, PDF almacenado, observabilidad y pruebas end-to-end.

> Concluimos que la separacion por microservicios reduce el acoplamiento, el Gateway centraliza seguridad, el descubridor evita direcciones fijas y Feign permite compartir informacion mediante contratos DTO estables.

## Preguntas frecuentes del tribunal

**Por que no usar un backend unico?**  
Porque reservas, finanzas y notificaciones cambian y escalan por razones distintas. Separarlas limita el impacto de fallos y permite despliegue independiente.

**Usaron Eureka?**  
No. Implementamos el mismo patron con un descubridor HTTP propio. La consigna presenta Eureka como ejemplo, no como unica tecnologia posible.

**Cada microservicio tiene su base?**  
Cada servicio es propietario de una tabla/almacen aislado. Por presupuesto comparten un proyecto Supabase; la separacion fisica es la siguiente etapa y no cambia las APIs.

**Que aporta Feign?**  
Declara el cliente REST como una interfaz, reduce codigo repetitivo y usa DTO para mantener un contrato claro entre servicios.

**Que pasa si Brevo falla?**  
La operacion principal queda guardada. Notifications conserva el comprobante pendiente con clave idempotente y permite reintentar sin duplicarlo.

