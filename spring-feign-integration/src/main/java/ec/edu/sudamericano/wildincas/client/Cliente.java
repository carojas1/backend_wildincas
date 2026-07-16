package ec.edu.sudamericano.wildincas.client;

import ec.edu.sudamericano.wildincas.dto.ApiResponseDto;
import ec.edu.sudamericano.wildincas.dto.ReservationDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(
    name = "reservations-client",
    url = "${hotel.reservations-url}"
)
public interface Cliente {
    @GetMapping("/reservations/{id}")
    ApiResponseDto<ReservationDto> findById(
        @PathVariable("id") String id,
        @RequestHeader("Authorization") String authorization
    );
}
