package ec.edu.sudamericano.wildincas.dto;

import java.math.BigDecimal;
import java.util.List;

public record ReservationDto(
    String id,
    String code,
    String roomId,
    String checkIn,
    String checkOut,
    String status,
    Integer nights,
    BigDecimal roomRate,
    BigDecimal total,
    BigDecimal paid,
    BigDecimal pending,
    GuestDto guest,
    List<ServiceChargeDto> charges
) {
}
