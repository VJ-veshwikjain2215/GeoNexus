package com.geonexus.health;

import java.time.Instant;

/**
 * Response body of {@code GET /api/v1/health}.
 *
 * @param status    always {@code "UP"} when the application is able to answer requests
 * @param service   logical service name
 * @param timestamp server time at which the response was produced (UTC)
 */
public record HealthResponse(String status, String service, Instant timestamp) {
}
