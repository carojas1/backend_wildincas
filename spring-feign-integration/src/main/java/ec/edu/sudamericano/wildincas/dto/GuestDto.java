package ec.edu.sudamericano.wildincas.dto;

public record GuestDto(
    String id,
    String name,
    String documentType,
    String documentNumber,
    String email,
    String phone,
    String address
) {
}
