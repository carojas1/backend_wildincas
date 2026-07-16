package ec.edu.sudamericano.wildincas.web;

import ec.edu.sudamericano.wildincas.dto.StaySummaryDto;
import ec.edu.sudamericano.wildincas.service.StayIntegrationService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/integration")
public class StayIntegrationController {
    private final StayIntegrationService integrationService;

    public StayIntegrationController(StayIntegrationService integrationService) {
        this.integrationService = integrationService;
    }

    @GetMapping("/reservations/{id}/summary")
    public ResponseEntity<StaySummaryDto> reservationSummary(
        @PathVariable String id,
        @RequestHeader("Authorization") String authorization
    ) {
        return ResponseEntity.ok(integrationService.loadStay(id, authorization));
    }
}
