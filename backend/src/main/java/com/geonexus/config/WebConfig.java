package com.geonexus.config;

import java.util.Arrays;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Deliberate, restrictive CORS policy for the REST API.
 * <ul>
 *   <li>Only explicitly configured origins are allowed; {@code *} is rejected at startup.</li>
 *   <li>Only read-only methods are allowed in Phase 1. Later phases must widen this on purpose.</li>
 *   <li>Credentials are not allowed.</li>
 * </ul>
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    public WebConfig(@Value("${geonexus.cors.allowed-origins}") String[] allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins)
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toArray(String[]::new);

        if (this.allowedOrigins.length == 0) {
            throw new IllegalStateException("geonexus.cors.allowed-origins must list at least one origin");
        }
        for (String origin : this.allowedOrigins) {
            if (origin.contains("*")) {
                throw new IllegalStateException(
                        "Wildcard CORS origins are not permitted; list exact origins in geonexus.cors.allowed-origins");
            }
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/v1/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "HEAD", "OPTIONS")
                .allowedHeaders("Accept", "Content-Type")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
