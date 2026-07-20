# Cumplimiento integral del cronograma Gantt

Fuente: `gantt_hostal_erp (2).xlsx`, hoja **Gantt ERP Hostal**. El archivo cubre
del 10 de abril al 16 de julio y contiene 30 actividades. El encabezado del
Excel dice 2025, mientras el proyecto y los despliegues corresponden a 2026;
antes de entregar se debe corregir solamente ese rotulo en el Excel si el
periodo academico oficial es 2026.

## Fase 1. Analisis y Diseno

| # | Fechas | Actividad | Responsable | Estado y evidencia |
| ---: | --- | --- | --- | --- |
| 1 | 10-16 abr | Relevamiento de requerimientos | Christian | Cumplido: requisitos funcionales y no funcionales en `proyecto-final-overleaf.tex`. |
| 2 | 10-14 abr | Entrevistas con el hostal | Jose | Cumplido: catalogo real de siete habitaciones, servicios y necesidades operativas. Adjuntar acta o captura como anexo. |
| 3 | 12-19 abr | Diseno BD (modelo ER) | Rogier | Cumplido tecnicamente: `docs/supabase-schema.sql` y almacenes `simot_*`. Adjuntar diagrama ER como figura. |
| 4 | 16-21 abr | Definicion de modulos y API | Christian + Roger | Cumplido: `docs/architecture.md`, servicios independientes y contratos REST. |
| 5 | 15-22 abr | Wireframes UI/UX | Jose | Cumplido: interfaz React, vistas de login, dashboard, reservas, caja y administracion. Adjuntar capturas. |
| 6 | 23-25 abr | Revision y aprobacion del diseno | Equipo | Cumplido: diseno final desplegado en Vercel y recorrido validado. |

## Fase 2. Infraestructura

| # | Fechas | Actividad | Responsable | Estado y evidencia |
| ---: | --- | --- | --- | --- |
| 7 | 25-28 abr | Setup entorno de desarrollo | Rogier | Cumplido: `package.json`, variables `.env.example`, scripts y estructura de repositorios. |
| 8 | 27 abr-1 may | Configuracion del servidor / BD | Rogier | Cumplido: Render, Supabase y `docs/deployment.md`. |
| 9 | 26-30 abr | Scaffolding Angular (Frontend) | Jose | Cumplido con cambio aprobado: se uso React + Vite por compatibilidad con Vercel y menor complejidad. Documentar la decision. |
| 10 | 26-30 abr | Scaffolding API REST (Backend) | Christian | Cumplido: Node/Express en `backend/services`. |
| 11 | 1-4 may | CI/CD pipeline basico | Christian + Rogier | Cumplido: push a `main` activa despliegue automatico en Render y Vercel. |

## Fase 3. Desarrollo Core

| # | Fechas | Actividad | Responsable | Estado y evidencia |
| ---: | --- | --- | --- | --- |
| 12 | 5-14 may | Usuarios efimeros + Auth | Christian | Cumplido: Auth, sesiones, usuarios y RBAC. |
| 13 | 5-14 may | Gestion de habitaciones | Rogier | Cumplido: CRUD, tarifas, estados, servicios y siete habitaciones reales. |
| 14 | 5-14 may | Dashboard / mapa de habitaciones | Jose | Cumplido: indicadores, ocupacion, pendientes y acciones rapidas. |
| 15 | 15-24 may | Check-in / Check-out | Christian + Jose | Cumplido: Reservations separa cobro, check-in y salida. |
| 16 | 15-22 may | Limpieza y mantenimiento | Rogier | Cumplido: checkout crea tarea; completar libera habitacion. |
| 17 | 18-27 may | Bitacora de novedades | Jose | Cumplido: autor, fecha, categoria, prioridad, responsable y resolucion. |
| 18 | 23-29 may | Checklist inicio de turno | Christian | Cumplido: checklist asociado a caja/operacion. |

## Fase 4. Modulo Contable

| # | Fechas | Actividad | Responsable | Estado y evidencia |
| ---: | --- | --- | --- | --- |
| 19 | 30 may-3 jun | Diseno apertura/cierre de caja | Christian + Rogier | Cumplido: flujo 24/7 con fondo, entradas, salidas, esperado, contado y diferencia. |
| 20 | 4-13 jun | Backend logica contable | Rogier | Cumplido: `backend/services/finance/server.js`. |
| 21 | 4-13 jun | Frontend panel caja chica | Jose | Cumplido: apertura, movimientos, cierre e historial. |
| 22 | 4-13 jun | Reportes por turno / exportacion | Christian | Cumplido: rango de fechas, indicadores y Excel multiseleccion. |
| 23 | 14-18 jun | Integracion Auth con Contable | Christian + Rogier | Cumplido: Gateway exige modulos `cash`, `billing` o `income`. |

## Fase 5. Pruebas y Entrega

| # | Fechas | Actividad | Responsable | Estado y evidencia |
| ---: | --- | --- | --- | --- |
| 24 | 19-26 jun | Pruebas de integracion backend | Rogier | Cumplido: `backend/tests/smoke.test.js` y pruebas del proyecto Feign. |
| 25 | 19-26 jun | Pruebas UI/UX frontend | Jose | Cumplido: build de produccion y validacion visual de flujos principales. |
| 26 | 27 jun-3 jul | Correccion de bugs | Equipo | Cumplido: historial Git y correcciones de CORS, persistencia, correo, roles y salida. |
| 27 | 1-7 jul | Documentacion tecnica | Christian | Cumplido: `docs/architecture.md`, `deployment.md`, documento Overleaf y matriz. |
| 28 | 1-7 jul | Manual de usuario / pasantes | Jose | Cumplido: `docs/manual-usuario.md`. |
| 29 | 5-9 jul | Deploy de produccion | Rogier | Cumplido: Vercel, Render, Supabase y Brevo. |
| 30 | 14-16 jul | Presentacion final | Equipo | Preparado: `docs/guion-defensa-final.md`, demostracion y matriz de evaluacion. |

## Control final de cumplimiento

| Fase | Actividades | Resultado final |
| --- | ---: | --- |
| Analisis y Diseno | 6 | Requisitos, datos, modulos, APIs y UX definidos. |
| Infraestructura | 5 | Repositorios, nube, persistencia y despliegue automatico. |
| Desarrollo Core | 7 | Operacion hotelera completa. |
| Modulo Contable | 5 | Caja, notas de venta, pagos, indicadores y Excel. |
| Pruebas y Entrega | 7 | Pruebas, correcciones, documentacion, manual, deploy y defensa. |
| **Total** | **30** | **Cronograma cubierto hasta la entrega final.** |

## Evidencias que todavia deben anexarse al documento academico

1. Acta o captura de entrevista con el hostal.
2. Diagrama ER exportado como imagen.
3. Diagrama de casos de uso.
4. Capturas finales de cada modulo.
5. Captura de `/health` con los servicios registrados.
6. Captura de Supabase con las tablas `simot_*`.
7. Captura de Brevo con un correo transaccional entregado.
8. Captura de las pruebas ejecutadas.
9. Enlace publico del video.
10. Historial de commits por integrante.

