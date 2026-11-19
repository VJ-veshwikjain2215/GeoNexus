package com.geonexus.data;

import org.flywaydb.core.Flyway;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

/**
 * Supplies a freshly migrated PostGIS database per call.
 * <ul>
 *   <li>If {@code GEONEXUS_TEST_DB_URL} (+ {@code _USER}, {@code _PASSWORD}) is set, that server is used. The role
 *       needs CREATEDB, and PostGIS must be installed on the server. Point it at a scratch server only.</li>
 *   <li>Otherwise a {@code postgis/postgis} Testcontainers container is started (requires Docker).</li>
 * </ul>
 * Each call creates a new uniquely named database, so test classes never share state.
 */
public final class PostgisTestDatabase {

    public record Db(String url, String user, String password) {
    }

    // Keep in step with the image in the root docker-compose.yml.
    private static final String POSTGIS_IMAGE = "postgis/postgis:16-3.5";
    private static PostgreSQLContainer<?> container;

    private PostgisTestDatabase() {
    }

    public static synchronized Db createMigratedDatabase() {
        String adminUrl;
        String user;
        String password;
        String env = System.getenv("GEONEXUS_TEST_DB_URL");
        if (env != null && !env.isBlank()) {
            adminUrl = env;
            user = System.getenv().getOrDefault("GEONEXUS_TEST_DB_USER", "postgres");
            password = System.getenv().getOrDefault("GEONEXUS_TEST_DB_PASSWORD", "");
        } else {
            if (container == null) {
                container = new PostgreSQLContainer<>(
                        DockerImageName.parse(POSTGIS_IMAGE).asCompatibleSubstituteFor("postgres"));
                container.start();
                Runtime.getRuntime().addShutdownHook(new Thread(container::stop));
            }
            adminUrl = container.getJdbcUrl();
            user = container.getUsername();
            password = container.getPassword();
        }

        String dbName = "geonexus_test_" + UUID.randomUUID().toString().replace("-", "");
        try (Connection c = DriverManager.getConnection(adminUrl, user, password);
             Statement s = c.createStatement()) {
            s.execute("CREATE DATABASE " + dbName);
        } catch (SQLException e) {
            throw new IllegalStateException("could not create scratch database", e);
        }
        String url = adminUrl.replaceFirst("/[^/?]*(\\?|$)", "/" + dbName + "$1");

        Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration")
                .load()
                .migrate();
        return new Db(url, user, password);
    }
}
