# Guion para video explicativo

Duracion recomendada: 4 a 6 minutos.

## 1. Presentacion

Hola, este proyecto se llama SIMOT Wild Incas. Es un sistema hotelero para administrar habitaciones, huespedes, caja, empleados, limpieza, bitacora y comprobantes por correo.

El objetivo fue aplicar arquitectura de microservicios, separando responsabilidades, permitiendo despliegue independiente y usando componentes como servicio descubridor y API Gateway.

## 2. Funcionalidades separadas

Separamos el sistema en microservicios por dominio:

- Auth: gestiona usuarios y acceso.
- Rooms: gestiona habitaciones, precios, estados y limpieza.
- Guests: gestiona huespedes, check-in, check-out y pagos.
- Finance: gestiona caja, movimientos y reportes.
- Employees: gestiona empleados, turnos y permisos.
- Operations: gestiona bitacora, checklist, agenda y mantenimiento.
- Notifications: gestiona notas de venta y correos.

Esta separacion es coherente porque en un hotel real recepcion, limpieza, caja y administracion tienen responsabilidades diferentes.

## 3. Estructura tecnica

Cada microservicio es una API REST independiente. El frontend no llama directamente a cada servicio, sino al API Gateway.

El API Gateway recibe rutas como:

- `/api/rooms`
- `/api/guests`
- `/api/finance`
- `/api/employees`
- `/api/notifications`

Luego el Gateway consulta al servicio descubridor para saber en que URL esta cada microservicio.

## 4. Persistencia

Cada microservicio tiene su propia persistencia cloud en Supabase:

- Rooms usa `simot_rooms`.
- Guests usa `simot_guests`.
- Finance usa `simot_finance`.
- Employees usa `simot_employees`.
- Operations usa `simot_operations`.
- Notifications usa `simot_notifications`.
- Auth usa `simot_auth`.

Esto permite separar los datos por responsabilidad y evitar que un modulo dependa directamente de la base de otro.

## 5. Demostracion funcional

Primero abrimos el sistema en Vercel e iniciamos sesion.

Luego mostramos el modulo de habitaciones. Aqui se puede ver si una habitacion esta disponible, ocupada, reservada o en limpieza. Tambien se puede crear o editar una habitacion con su tarifa.

Despues vamos a huespedes y registramos un nuevo ingreso. Seleccionamos una habitacion disponible, llenamos los datos del cliente, el correo, el metodo de pago y el valor recibido. El sistema calcula el cambio y registra el pago.

Ese pago pasa al microservicio de finanzas, donde aparece como movimiento de ingreso. Desde finanzas tambien se puede abrir caja, registrar gastos o transferencias y exportar el reporte Excel.

Cuando el huesped sale, marcamos salida. La habitacion cambia automaticamente a limpieza. En el modulo de limpieza se completa la tarea y la habitacion vuelve a estar disponible.

En bitacora se registra una novedad con responsable, hora, categoria y accion requerida. Cuando se resuelve, queda marcada como completada.

## 6. Demostracion de arquitectura

Ahora abrimos el endpoint:

`https://backend-wildincas.onrender.com/health`

Aqui se observa el API Gateway y la lista de microservicios registrados en el servicio descubridor.

Tambien podemos abrir:

`https://backend-wildincas.onrender.com/api/rooms/summary`

Esta ruta no entra directo a Rooms. Primero entra al Gateway, el Gateway consulta Discovery y luego redirige la peticion al microservicio Rooms.

## 7. Despliegue

El frontend esta desplegado en Vercel. El backend esta desplegado en Render. Supabase se usa para persistencia cloud y Brevo para correos transaccionales.

El proyecto soporta despliegue independiente porque cada microservicio tiene su propio script `npm run start:<servicio>`. Tambien existe un blueprint `render.microservices.yaml` para desplegarlos por separado en Render.

## 8. Cierre

En conclusion, SIMOT aplica microservicios porque separa responsabilidades, usa APIs REST independientes, mantiene datos separados por servicio, registra servicios en Discovery y centraliza el acceso mediante API Gateway.
