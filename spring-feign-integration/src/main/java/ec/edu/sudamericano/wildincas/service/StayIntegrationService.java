package ec.edu.sudamericano.wildincas.service;

import ec.edu.sudamericano.wildincas.client.Cliente;
import ec.edu.sudamericano.wildincas.dto.ApiResponseDto;
import ec.edu.sudamericano.wildincas.dto.GuestDto;
import ec.edu.sudamericano.wildincas.dto.ReservationDto;
import ec.edu.sudamericano.wildincas.dto.StaySummaryDto;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class StayIntegrationService {
    private final Cliente reservationsClient;

    public StayIntegrationService(Cliente reservationsClient) {
        this.reservationsClient = reservationsClient;
    }

    public StaySummaryDto loadStay(String reservationId, String authorization) {
        ApiResponseDto<ReservationDto> response = reservationsClient.findById(reservationId, authorization);
        if (response == null || !response.ok() || response.data() == null) {
            throw new IllegalStateException("El microservicio de reservas no devolvio una estadia valida");
        }
        ReservationDto reservation = response.data();
        GuestDto guest = reservation.guest();
        BigDecimal total = valueOrZero(reservation.total());
        BigDecimal paid = valueOrZero(reservation.paid());
        BigDecimal pending = reservation.pending() == null
            ? total.subtract(paid).max(BigDecimal.ZERO)
            : reservation.pending();
        return new StaySummaryDto(
            reservation.id(),
            reservation.code(),
            guest == null ? "Consumidor final" : guest.name(),
            guest == null ? "" : guest.documentNumber(),
            reservation.roomId(),
            reservation.checkIn() + " / " + reservation.checkOut(),
            reservation.nights(),
            reservation.status(),
            total,
            paid,
            pending
        );
    }

    private BigDecimal valueOrZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
