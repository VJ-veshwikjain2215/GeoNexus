package com.geonexus.security.config;

import java.util.List;
import java.util.regex.Pattern;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/** Builds an explicit-allow-list CORS policy. Wildcards and malformed origins fail application startup. */
public final class CorsConfigurationSourceFactory {

    private static final Pattern ORIGIN = Pattern.compile("^https?://[A-Za-z0-9.-]+(:\\d{1,5})?$");

    private CorsConfigurationSourceFactory() {
    }

    public static CorsConfigurationSource create(SecurityProperties.Cors props) {
        List<String> origins = props.allowedOrigins().stream().map(String::trim).toList();
        for (String origin : origins) {
            if (!ORIGIN.matcher(origin).matches()) {
                throw new IllegalStateException(
                        "geonexus.security.cors.allowed-origins entries must be exact origins like "
                                + "https://host[:port] (no wildcards, no paths). Invalid entry: '" + origin + "'");
            }
        }
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(origins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        cfg.setAllowCredentials(false); // bearer tokens in a header; no cookies are used
        cfg.setMaxAge(props.maxAgeSeconds());
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cfg);
        return source;
    }
}
