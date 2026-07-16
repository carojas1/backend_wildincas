package ec.edu.sudamericano.wildincas.dto;

import java.math.BigDecimal;

public record ServiceChargeDto(
    String id,
    String category,
    String description,
    Integer quantity,
    BigDecimal unitPrice,
    BigDecimal total
) {
}
