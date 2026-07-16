package ec.edu.sudamericano.wildincas.dto;

import java.math.BigDecimal;

public record StaySummaryDto(
    String reservationId,
    String reservationCode,
    String guestName,
    String guestDocument,
    String roomId,
    String period,
    Integer nights,
    String status,
    BigDecimal total,
    BigDecimal paid,
    BigDecimal pending
) {
}
