package com.geonexus.security.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/** Bound from {@code geonexus.security.*}. The JWT secret has no default on purpose. */
@Validated
@ConfigurationProperties(prefix = "geonexus.security")
public record SecurityProperties(
        @NotNull @Valid Jwt jwt,
        @NotNull @Valid @DefaultValue Cors cors,
        @NotNull @Valid @DefaultValue Login login) {

    public record Jwt(
            @NotBlank String secret,
            @NotBlank @DefaultValue("geonexus") String issuer,
            @NotBlank @DefaultValue("geonexus-api") String audience,
            @NotNull @DefaultValue("PT30M") Duration accessTokenTtl) {

        @Override
        public String toString() {
            return "Jwt[secret=<redacted>, issuer=" + issuer + ", audience=" + audience
                    + ", accessTokenTtl=" + accessTokenTtl + "]";
        }
    }

    public record Cors(
            @NotEmpty @DefaultValue("http://localhost:5173") List<String> allowedOrigins,
            @Min(0) @DefaultValue("3600") long maxAgeSeconds) {
    }

    public record Login(
            @Min(1) @DefaultValue("5") int maxFailedAttempts,
            @NotNull @DefaultValue("PT15M") Duration lockoutWindow) {
    }
}
