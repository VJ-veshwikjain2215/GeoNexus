package com.geonexus.health;

import java.time.Instant;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public liveness endpoint. It reports only that the application process is serving requests;
 * it deliberately exposes no configuration, version, database, or environment details.
 */
@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    private final String serviceName;

    public HealthController(@Value("${spring.application.name}") String serviceName) {
        this.serviceName = serviceName;
    }

    @GetMapping
    public ResponseEntity<HealthResponse> health() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(new HealthResponse("UP", serviceName, Instant.now()));
    }
}
