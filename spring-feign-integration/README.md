# Integracion REST con OpenFeign

Este proyecto es un microservicio Spring Boot independiente. Consume la API REST del microservicio `reservations` a traves del API Gateway y transforma la respuesta en un DTO estable para otros procesos del hotel.

## Evidencias para la rubrica

- Clase Cliente: `client/Cliente.java`, anotada con `@FeignClient`.
- DTOs compartidos: paquete `dto` (`ReservationDto`, `GuestDto`, `ServiceChargeDto`, `ApiResponseDto`).
- Capa de negocio: `service/StayIntegrationService.java`.
- Contrato estable: normaliza saldos ausentes para que el DTO nunca entregue valores nulos.
- Endpoint demostrable: `GET /api/integration/reservations/{id}/summary`.
- Prueba automatizada: `StayIntegrationServiceTest.java`.

## Ejecucion

```bash
docker build -t wildincas-feign .
docker run --rm -p 7110:7110 \
  -e RESERVATIONS_API_URL=http://host.docker.internal:8080/api/reservations \
  wildincas-feign
```

La peticion de demostracion reenvia el token del usuario al Gateway:

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:7110/api/integration/reservations/ID/summary
```
