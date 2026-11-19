package com.geonexus.data;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;

/** Applies V1..V6 to a real PostGIS database and runs the behavioural SQL assertions. */
class MigrationAssertionsTest {

    private static PostgisTestDatabase.Db db;

    @BeforeAll
    static void migrate() {
        db = PostgisTestDatabase.createMigratedDatabase();
    }

    @Test
    void allMigrationsApplyAndValidate() {
        Flyway flyway = Flyway.configure().dataSource(db.url(), db.user(), db.password())
                .locations("classpath:db/migration").load();

        assertThat(flyway.info().applied()).hasSize(6);
        flyway.validate();
    }

    @Test
    void geometryColumnIsDeclaredAs4326MultiPolygon() throws Exception {
        try (Connection c = DriverManager.getConnection(db.url(), db.user(), db.password());
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT type, srid FROM geometry_columns "
                     + "WHERE f_table_name = 'parcel_geometries' AND f_geometry_column = 'geom'")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getString("type")).isEqualTo("MULTIPOLYGON");
            assertThat(rs.getInt("srid")).isEqualTo(4326);
        }
    }

    @Test
    void historyAuditAndConstraintRulesHold() throws Exception {
        String script;
        try (InputStream in = getClass().getResourceAsStream("/sql/schema_assertions.sql")) {
            assertThat(in).isNotNull();
            script = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        Properties props = new Properties();
        props.setProperty("user", db.user());
        props.setProperty("password", db.password());
        props.setProperty("preferQueryMode", "simple"); // send the script as plain text, dollar quoting intact
        try (Connection c = DriverManager.getConnection(db.url(), props); Statement s = c.createStatement()) {
            s.execute(script); // any failed assertion raises and fails the test
        }
    }
}
