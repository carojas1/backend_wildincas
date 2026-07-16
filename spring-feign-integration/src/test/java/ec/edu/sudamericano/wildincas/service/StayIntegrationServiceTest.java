package ec.edu.sudamericano.wildincas.service;

import ec.edu.sudamericano.wildincas.client.Cliente;
import ec.edu.sudamericano.wildincas.dto.ApiResponseDto;
import ec.edu.sudamericano.wildincas.dto.GuestDto;
import ec.edu.sudamericano.wildincas.dto.ReservationDto;
import ec.edu.sudamericano.wildincas.dto.StaySummaryDto;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StayIntegrationServiceTest {
    @Test
    void mapsFeignResponseIntoAStableDto() {
        Cliente client = mock(Cliente.class);
        GuestDto guest = new GuestDto("g1", "Ana Perez", "Cedula", "0101", "ana@example.com", "", "");
        ReservationDto reservation = new ReservationDto(
            "r1", "RES-001", "101", "2026-07-15", "2026-07-17", "confirmed", 2,
            new BigDecimal("35.00"), new BigDecimal("70.00"), new BigDecimal("20.00"),
            new BigDecimal("50.00"), guest, List.of()
        );
        when(client.findById("r1", "Bearer test")).thenReturn(new ApiResponseDto<>(true, reservation, null));

        StaySummaryDto result = new StayIntegrationService(client).loadStay("r1", "Bearer test");

        assertEquals("RES-001", result.reservationCode());
        assertEquals("Ana Perez", result.guestName());
        assertEquals(new BigDecimal("50.00"), result.pending());
    }

    @Test
    void calculatesPendingBalanceWhenReservationsDoesNotExposePayments() {
        Cliente client = mock(Cliente.class);
        ReservationDto reservation = new ReservationDto(
            "r2", "RES-002", "202", "2026-07-20", "2026-07-21", "confirmed", 1,
            new BigDecimal("35.00"), new BigDecimal("35.00"), null,
            null, null, List.of()
        );
        when(client.findById("r2", "Bearer test")).thenReturn(new ApiResponseDto<>(true, reservation, null));

        StaySummaryDto result = new StayIntegrationService(client).loadStay("r2", "Bearer test");

        assertEquals(BigDecimal.ZERO, result.paid());
        assertEquals(new BigDecimal("35.00"), result.pending());
    }
}
