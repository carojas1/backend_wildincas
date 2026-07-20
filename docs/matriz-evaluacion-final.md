# Matriz de evaluacion y evidencias

## Rubrica del proyecto de fin de ciclo

| Criterio | Puntos | Evidencia concreta |
| --- | ---: | --- |
| Solucion e innovacion | 10 | Flujo unico desde reserva hasta limpieza, correo, caja y Excel. |
| Cumplimiento de objetivos | 10 | Objetivos medibles en `proyecto-final-overleaf.tex`, demostrados en el recorrido completo. |
| Integracion de conocimientos | 10 | React, REST, Node/Express, Spring Boot, OpenFeign, PostgreSQL, RBAC y nube. |
| Funcionalidad | 15 | Reservas sin cruce, pagos, checkout, limpieza, roles, correo y reportes. |
| Calidad y tecnologias | 10 | Separacion por dominio, API Gateway, descubrimiento, DTO, persistencia aislada y manejo de errores. |
| Pruebas | 5 | Smoke backend, build frontend, pruebas Spring y validacion en nube. |
| Presentacion oral | 10 | Guion de 15 minutos en `guion-defensa-final.md`. |
| Trabajo en equipo | 5 | Explicar responsabilidades y evidencias de commits por integrante. |
| Documento | 10 | Estructura LaTeX completa, lenguaje tecnico, tablas y referencias. |
| Contenido tecnico | 15 | Arquitectura, requisitos, base de datos, REST, Feign, seguridad, pruebas y despliegue. |

## Rubrica especifica de microservicios

| Requisito | Estado | Donde demostrarlo |
| --- | --- | --- |
| Dos funcionalidades separadas | Cumplido | Rooms, Reservations, Finance y Employees son dominios independientes. |
| CRUD por microservicio | Cumplido | Rutas REST en `backend/services/*/server.js`. |
| Propiedad de datos | Cumplido con aislamiento logico | Tablas `simot_*`; explicar la limitacion del proyecto Supabase compartido. |
| Servicio descubridor | Cumplido | `backend/discovery/server.js` y respuesta `/health`. |
| API Gateway | Cumplido | `backend/api-gateway/server.js`; autenticacion, permisos y proxy. |
| Despliegue independiente | Preparado | `render.microservices.yaml` y scripts `start:<servicio>`. Produccion actual consolidada por costo. |
| Clase Cliente | Cumplido | `spring-feign-integration/.../client/Cliente.java`. |
| DTOs | Cumplido | Paquete `spring-feign-integration/.../dto`. |
| Consumo REST con Feign | Cumplido | `StayIntegrationService` y endpoint `/api/integration/reservations/{id}/summary`. |
| Prueba de Feign | Cumplido | `StayIntegrationServiceTest.java`. |

## Evidencias que deben aparecer en el video

1. Diagrama general de frontend, Gateway, Discovery, servicios y Supabase.
2. Navegador en `/health` con servicios registrados.
3. Codigo del mapa de rutas y autorizacion del Gateway.
4. Una operacion CRUD real desde la interfaz.
5. Tabla correspondiente en Supabase despues de guardar.
6. Flujo reserva, pago, salida y limpieza.
7. `Cliente.java`, al menos dos DTO y el test de integracion.
8. Estado del correo en la aplicacion o Brevo.
9. Exportacion Excel por rango.
10. Conclusiones y limitaciones reales.

## Frases que no deben usarse

- No decir que Eureka fue implementado si el proyecto utiliza un descubridor propio HTTP.
- No decir que cada servicio tiene hoy un servidor PostgreSQL fisico distinto.
- No decir que Render tiene ocho servicios independientes si se muestra una unica instancia Free.
- No llamar factura electronica SRI a una nota de venta interna.
- No afirmar que un correo fue entregado solo porque se guardo la solicitud; mostrar el estado de Brevo.

## Forma correcta de explicarlo

> Implementamos el patron Service Discovery con un registro HTTP propio, equivalente en responsabilidad a Eureka. Cada microservicio envia heartbeats y el API Gateway resuelve su ubicacion antes de reenviar la peticion.

> Cada dominio es propietario de un almacen logico independiente en Supabase. El despliegue academico actual comparte un proyecto por costo, mientras el Blueprint permite asignar credenciales y despliegue independientes en una evolucion productiva.

> En Render Free ejecutamos los procesos en una sola instancia para la demostracion. La independencia se conserva en proyectos, puertos, contratos, scripts de arranque y configuracion de despliegue.

