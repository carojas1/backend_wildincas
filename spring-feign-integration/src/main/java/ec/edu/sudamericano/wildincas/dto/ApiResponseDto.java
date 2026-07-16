package ec.edu.sudamericano.wildincas.dto;

public record ApiResponseDto<T>(boolean ok, T data, ApiErrorDto error) {
}
