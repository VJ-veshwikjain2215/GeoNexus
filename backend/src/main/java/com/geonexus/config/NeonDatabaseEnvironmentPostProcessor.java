package com.geonexus.config;

import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Automatically wires Neon PostgreSQL environment variables into Spring Boot.
 *
 * Neon provides:
 * - DATABASE_URL (pooled endpoint via PgBouncer, optimal for runtime HikariCP connection pooling)
 * - DATABASE_URL_UNPOOLED (direct endpoint, required for Flyway DDL schema migrations)
 *
 * This processor parses the connection URLs and configures Spring DataSource and Flyway accordingly.
 */
@Order(Ordered.LOWEST_PRECEDENCE)
public class NeonDatabaseEnvironmentPostProcessor implements EnvironmentPostProcessor {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> props = new HashMap<>();

        String databaseUrl = environment.getProperty("DATABASE_URL");
        if (databaseUrl != null && !databaseUrl.isBlank() && !databaseUrl.startsWith("jdbc:")) {
            parseAndApply(databaseUrl, "spring.datasource.", props);
        }

        String databaseUrlUnpooled = environment.getProperty("DATABASE_URL_UNPOOLED");
        if (databaseUrlUnpooled != null && !databaseUrlUnpooled.isBlank() && !databaseUrlUnpooled.startsWith("jdbc:")) {
            parseAndApply(databaseUrlUnpooled, "spring.flyway.", props);
        }

        if (!props.isEmpty()) {
            environment.getPropertySources().addFirst(new MapPropertySource("neonDatabaseProperties", props));
        }
    }

    private void parseAndApply(String rawUrl, String prefix, Map<String, Object> props) {
        try {
            String normalized = rawUrl.trim();
            if (normalized.startsWith("postgresql://")) {
                normalized = "http://" + normalized.substring("postgresql://".length());
            } else if (normalized.startsWith("postgres://")) {
                normalized = "http://" + normalized.substring("postgres://".length());
            }

            URI uri = new URI(normalized);
            String userInfo = uri.getUserInfo();
            String host = uri.getHost();
            int port = uri.getPort() > 0 ? uri.getPort() : 5432;
            String path = uri.getPath();
            String db = (path != null && path.length() > 1) ? path.substring(1) : "neondb";
            String query = uri.getQuery();

            StringBuilder jdbcUrl = new StringBuilder("jdbc:postgresql://")
                    .append(host)
                    .append(":")
                    .append(port)
                    .append("/")
                    .append(db);

            if (query != null && !query.isBlank()) {
                jdbcUrl.append("?").append(query);
            } else {
                jdbcUrl.append("?sslmode=require");
            }

            props.put(prefix + "url", jdbcUrl.toString());

            if (userInfo != null && !userInfo.isBlank()) {
                int colon = userInfo.indexOf(':');
                if (colon >= 0) {
                    props.put(prefix + "username", userInfo.substring(0, colon));
                    props.put(prefix + "password", userInfo.substring(colon + 1));
                } else {
                    props.put(prefix + "username", userInfo);
                }
            }
        } catch (Exception ignored) {
            // Fall back to standard Spring properties
        }
    }
}
