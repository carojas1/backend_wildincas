package ec.edu.sudamericano.wildincas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@EnableFeignClients
@SpringBootApplication
public class FeignIntegrationApplication {
    public static void main(String[] args) {
        SpringApplication.run(FeignIntegrationApplication.class, args);
    }
}
