# Manual de usuario Wild Incas

## 1. Ingreso

1. Abra la URL de Vercel.
2. Escriba usuario y contrasena.
3. Pulse **Ingresar**.
4. El sistema muestra un saludo con el nombre y solamente los modulos permitidos.

Cuenta administrativa de demostracion: usuario `apolo`. La contrasena debe
mantenerse fuera de documentos publicos y entregarse por un medio privado.

## 2. Dashboard

Muestra ocupacion, habitaciones disponibles, salidas pendientes, ingresos,
tareas de limpieza y acciones rapidas. Desde aqui puede iniciar una nueva
estadia sin buscar primero otro modulo.

## 3. Nueva estadia o reserva

1. Pulse **Nueva estadia**.
2. Busque al huesped por nombre, documento, correo o telefono.
3. Si no existe, registre nombre, cedula/RUC, telefono, correo y direccion.
4. Seleccione entrada, salida, personas y habitacion disponible.
5. Revise tarifa, noches y total.
6. Confirme la reserva o registre el ingreso inmediato.

El sistema impide elegir una habitacion ocupada en las mismas fechas.

## 4. Gestionar una estadia

En **Reservas** puede buscar por codigo, huesped, documento o habitacion. El
detalle permite editar fechas, agregar noches o consumos, registrar pagos y
consultar el historial. Los iconos tienen ayuda al pasar el cursor.

## 5. Cobrar

1. Abra la estadia y pulse **Cobrar**.
2. Seleccione efectivo, tarjeta, transferencia o deposito.
3. Ingrese el monto pagado.
4. Para efectivo, ingrese el valor recibido; el cambio se calcula solo.
5. Guarde el pago.

El movimiento aparece en nota de venta, caja y contabilidad. Un pago parcial
mantiene visible el saldo.

## 6. Marcar salida

La salida es una accion distinta al cobro. Cuando el saldo es cero:

1. Pulse **Marcar salida**.
2. Confirme los datos finales.
3. El sistema cierra la estadia y genera la nota de venta final.
4. La habitacion pasa a **En limpieza**.

## 7. Limpieza

Abra **Limpieza**, seleccione una tarea y pulse **Completar**. Registre una
observacion si existe dano o mantenimiento. Al completar una limpieza normal,
la habitacion vuelve a **Disponible**.

## 8. Habitaciones

El administrador puede crear, editar o desactivar habitaciones, modificar
precio, capacidad, piso, tipo, servicios y observaciones. Los filtros muestran
disponibles, ocupadas, en limpieza, mantenimiento o fuera de servicio.

## 9. Huespedes

Permite crear y editar perfiles, buscar clientes y abrir el historial de
reservas, habitaciones, consumos, pagos, saldos y salidas. Un huesped existente
puede tener varias estadias sin duplicar su perfil.

## 10. Bitacora

Pulse **Nueva novedad**, describa lo ocurrido, categoria, prioridad, habitacion
y responsable. El registro guarda quien lo creo y a que hora. Cuando se atienda,
pulse **Completar** y escriba la solucion.

## 11. Caja 24/7

Abra caja con responsable y fondo inicial. Registre ingresos o gastos manuales
solo cuando no provengan de una estadia. Al cerrar, escriba el efectivo contado;
el sistema compara contra el esperado y guarda la diferencia. Los turnos dan
trazabilidad, pero no impiden atender llegadas a cualquier hora.

## 12. Contabilidad y Excel

Seleccione fecha inicial y final. Revise ingresos, gastos, utilidad, ocupacion,
ADR y RevPAR. Exporte el Excel y elija las hojas requeridas: resumen, reservas,
notas, pagos, pendientes, gastos, ocupacion, consumos, empleados o turnos.

## 13. Empleados y accesos

El administrador crea un empleado con correo, usuario y contrasena temporal.
Puede aplicar una plantilla de rol y luego activar o quitar modulos individuales.
Los cambios se reflejan al actualizar la sesion. El empleado registra entrada y
salida laboral desde su perfil.

## 14. Correos y notas de venta

La aplicacion muestra el estado enviado, pendiente o fallido. Si falla Brevo,
la reserva o pago no se pierde. El administrador puede reintentar el comprobante
sin generar duplicados.

## 15. Solucion de problemas

- Primera carga lenta: Render Free puede estar despertando; espere y actualice.
- Acceso denegado: solicite al administrador el modulo correspondiente.
- Correo pendiente: revise remitente verificado, API key e IP autorizada en Brevo.
- Datos no visibles: confirme la tabla `simot_*`, credenciales de Render y RLS.
- Habitacion no disponible: revise fechas, estado y reservas activas.

