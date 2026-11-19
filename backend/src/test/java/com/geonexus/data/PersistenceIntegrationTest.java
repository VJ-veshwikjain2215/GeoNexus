package com.geonexus.data;

import com.geonexus.audit.AuditAction;
import com.geonexus.audit.AuditOutcome;
import com.geonexus.audit.AuditRecord;
import com.geonexus.audit.AuditRecordRepository;
import com.geonexus.geometry.GeometryPolicy;
import com.geonexus.geometry.GeometrySource;
import com.geonexus.geometry.GeometryStatus;
import com.geonexus.geometry.ParcelGeometry;
import com.geonexus.geometry.ParcelGeometryRepository;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import com.geonexus.survey.Survey;
import com.geonexus.survey.SurveyRepository;
import com.geonexus.user.Role;
import com.geonexus.user.RoleName;
import com.geonexus.user.RoleRepository;
import com.geonexus.user.User;
import com.geonexus.user.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Round-trips the JPA mappings against a real PostGIS database with Flyway-applied migrations.
 * Boot-free on purpose (plain Spring + Hibernate), so it works with any Spring Boot version chosen in Phase 1.
 * Schema validation by Hibernate is not used: spatial column types are verified by the round-trips instead.
 * Geometry rows can never be deleted, so tests create uniquely named data and never clean up.
 */
@SpringJUnitConfig(PersistenceIntegrationTest.Config.class)
class PersistenceIntegrationTest {

    private static final GeometryFactory GF = new GeometryFactory(new PrecisionModel(), GeometryPolicy.STORAGE_SRID);

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(basePackages = "com.geonexus")
    static class Config {

        @Bean
        DataSource dataSource() {
            PostgisTestDatabase.Db db = PostgisTestDatabase.createMigratedDatabase();
            return new DriverManagerDataSource(db.url(), db.user(), db.password());
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
            emf.setDataSource(dataSource);
            emf.setPackagesToScan("com.geonexus");
            emf.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            Properties p = new Properties();
            p.setProperty("hibernate.hbm2ddl.auto", "none"); // Flyway owns the schema
            emf.setJpaProperties(p);
            return emf;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource dataSource) {
            return new JdbcTemplate(dataSource);
        }
    }

    @Autowired UserRepository users;
    @Autowired RoleRepository roles;
    @Autowired ParcelRepository parcels;
    @Autowired SurveyRepository surveys;
    @Autowired ParcelGeometryRepository geometries;
    @Autowired AuditRecordRepository audit;
    TransactionTemplate tx;
    @Autowired JdbcTemplate jdbc;
    @PersistenceContext EntityManager em;

    // TransactionTemplate is not auto-registered; build it from the transaction manager.
    @Autowired
    void initTx(PlatformTransactionManager tm) {
        this.tx = new TransactionTemplate(tm);
    }

    private static Polygon square(double dx) {
        double x = 85.3 + dx;
        double y = 23.35;
        return GF.createPolygon(new Coordinate[]{
                new Coordinate(x, y), new Coordinate(x + 0.0011, y), new Coordinate(x + 0.0011, y + 0.0009),
                new Coordinate(x, y + 0.0009), new Coordinate(x, y)});
    }

    private User newUser(String prefix, RoleName role) {
        return tx.execute(s -> {
            String suffix = UUID.randomUUID().toString().substring(0, 8);
            User u = new User(prefix + "_" + suffix, prefix + suffix + "@example.test", prefix,
                    "x".repeat(60)); // dummy value, not a real hash
            u.grantRole(roles.findByName(role).orElseThrow());
            return users.saveAndFlush(u);
        });
    }

    private Parcel newParcel(User owner) {
        return tx.execute(s -> parcels.saveAndFlush(new Parcel(
                "P-" + UUID.randomUUID().toString().substring(0, 8), "Synthetic District", "Synthetic State",
                owner, owner)));
    }

    /** Proposes the next version of a parcel under the parcel row lock, as a service would. */
    private UUID propose(UUID parcelId, UUID createdById, double dx, UUID basedOnId, UUID surveyId,
                         GeometrySource source) {
        return tx.execute(s -> {
            Parcel parcel = parcels.findByIdForUpdate(parcelId).orElseThrow();
            ParcelGeometry based = basedOnId == null ? null : geometries.findById(basedOnId).orElseThrow();
            Survey survey = surveyId == null ? null : surveys.findById(surveyId).orElseThrow();
            int next = geometries.nextVersionNo(parcelId);
            return geometries.saveAndFlush(ParcelGeometry.propose(parcel, next, square(dx), source,
                    users.getReferenceById(createdById), survey, based, "synthetic test boundary", null, null)).getId();
        });
    }

    private void verify(UUID geometryId, UUID reviewerId) {
        tx.executeWithoutResult(s -> {
            ParcelGeometry g = geometries.findById(geometryId).orElseThrow();
            g.verify(users.getReferenceById(reviewerId), "ok", Instant.now());
            geometries.flush();
        });
    }

    @Test
    void usersAndRolesRoundTripAndLookupIsCaseInsensitive() {
        User u = newUser("alice", RoleName.SURVEYOR);

        User found = users.findWithRolesByUsernameIgnoreCase(u.getUsername().toUpperCase()).orElseThrow();

        assertThat(found.getId()).isEqualTo(u.getId());
        assertThat(found.hasRole(RoleName.SURVEYOR)).isTrue();
        assertThat(found.hasRole(RoleName.ADMIN)).isFalse();
        assertThat(users.existsByEmailIgnoreCase(u.getEmail().toUpperCase())).isTrue();
        assertThat(found.toString()).doesNotContain("xxxx");
        assertThat(roles.findAll()).extracting(Role::getName)
                .containsExactlyInAnyOrder(RoleName.ADMIN, RoleName.SURVEYOR, RoleName.REVIEWER, RoleName.VIEWER);
    }

    @Test
    void parcelOwnershipScopedLookup() {
        User owner = newUser("owner", RoleName.SURVEYOR);
        User other = newUser("other", RoleName.SURVEYOR);
        Parcel p = newParcel(owner);

        assertThat(parcels.findByIdAndOwnerId(p.getId(), owner.getId())).isPresent();
        assertThat(parcels.findByIdAndOwnerId(p.getId(), other.getId())).isEmpty();
        assertThat(parcels.findByOwnerId(owner.getId(), PageRequest.of(0, 10)).getTotalElements()).isEqualTo(1);
    }

    @Test
    void geometryRoundTripKeepsSridAndDatabaseComputesSphericalArea() {
        User surveyor = newUser("surveyor", RoleName.SURVEYOR);
        Parcel parcel = newParcel(surveyor);
        UUID gid = propose(parcel.getId(), surveyor.getId(), 0, null, null, GeometrySource.MANUAL_ENTRY);

        ParcelGeometry loaded = tx.execute(s -> {
            ParcelGeometry g = geometries.findById(gid).orElseThrow();
            em.refresh(g); // pick up generated columns
            return g;
        });

        assertThat(loaded.getVersionNo()).isEqualTo(1);
        assertThat(loaded.getStatus()).isEqualTo(GeometryStatus.PROPOSED);
        assertThat(loaded.getGeom().getSRID()).isEqualTo(4326);
        assertThat(loaded.getGeom().equalsExact(GeometryPolicy.requireStorable(square(0)))).isTrue();
        // ~0.0011 deg x 0.0009 deg near 23.35N is roughly 112 m x 100 m; planar degrees would give ~1e-6.
        assertThat(loaded.getAreaSqM()).isBetween(9_000.0, 14_000.0);
    }

    @Test
    void resurveyCreatesNewVersionAndPreservesPriorBoundary() {
        User surveyor = newUser("surveyor", RoleName.SURVEYOR);
        User reviewer = newUser("reviewer", RoleName.REVIEWER);
        Parcel parcel = newParcel(surveyor);

        UUID initialSurveyId = tx.execute(s -> surveys.saveAndFlush(
                Survey.initial(parcels.getReferenceById(parcel.getId()), surveyor, surveyor)).getId());
        UUID v1 = propose(parcel.getId(), surveyor.getId(), 0, null, initialSurveyId, GeometrySource.SURVEY);
        verify(v1, reviewer.getId());

        UUID resurveyId = tx.execute(s -> surveys.saveAndFlush(Survey.resurvey(
                parcels.getReferenceById(parcel.getId()), surveys.getReferenceById(initialSurveyId),
                surveyor, surveyor)).getId());
        UUID v2 = propose(parcel.getId(), surveyor.getId(), 0.0003, v1, resurveyId, GeometrySource.SURVEY);

        // Proposed resurvey does not displace the verified boundary.
        assertThat(geometries.findCurrent(parcel.getId()).orElseThrow().getId()).isEqualTo(v1);

        verify(v2, reviewer.getId());

        List<ParcelGeometry> history = geometries.findHistory(parcel.getId());
        assertThat(history).extracting(ParcelGeometry::getVersionNo).containsExactly(2, 1);
        assertThat(geometries.findCurrent(parcel.getId()).orElseThrow().getId()).isEqualTo(v2);

        tx.executeWithoutResult(s -> {
            ParcelGeometry old = geometries.findById(v1).orElseThrow();
            assertThat(old.getStatus()).isEqualTo(GeometryStatus.SUPERSEDED);
            assertThat(old.getSupersededBy().getId()).isEqualTo(v2);
            assertThat(old.getGeom().equalsExact(GeometryPolicy.requireStorable(square(0)))).isTrue();
            assertThat(geometries.findById(v2).orElseThrow().getBasedOn().getId()).isEqualTo(v1);
        });
    }

    @Test
    void databaseRefusesToOverwriteOrDeleteABoundaryEvenWithRawSql() {
        User surveyor = newUser("surveyor", RoleName.SURVEYOR);
        Parcel parcel = newParcel(surveyor);
        UUID g = propose(parcel.getId(), surveyor.getId(), 0, null, null, GeometrySource.MANUAL_ENTRY);

        assertThatThrownBy(() -> jdbc.update(
                "UPDATE parcel_geometries SET geom = ST_Translate(geom, 0.01, 0) WHERE id = ?", g))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("immutable");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM parcel_geometries WHERE id = ?", g))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("cannot be deleted");
    }

    @Test
    void submitterCannotApproveOwnBoundary() {
        User surveyor = newUser("surveyor", RoleName.SURVEYOR);
        Parcel parcel = newParcel(surveyor);
        UUID g = propose(parcel.getId(), surveyor.getId(), 0, null, null, GeometrySource.AI_DETECTED);

        assertThatThrownBy(() -> tx.executeWithoutResult(s -> geometries.findById(g).orElseThrow()
                .verify(users.getReferenceById(surveyor.getId()), "self", Instant.now())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> jdbc.update(
                "UPDATE parcel_geometries SET status='VERIFIED', reviewed_by = created_by, reviewed_at = now() WHERE id = ?", g))
                .isInstanceOf(DataAccessException.class);
        assertThat(geometries.findCurrent(parcel.getId())).isEmpty();
    }

    @Test
    void geometryChangesAreAuditedByTheDatabase() {
        User surveyor = newUser("surveyor", RoleName.SURVEYOR);
        User reviewer = newUser("reviewer", RoleName.REVIEWER);
        Parcel parcel = newParcel(surveyor);
        UUID g = propose(parcel.getId(), surveyor.getId(), 0, null, null, GeometrySource.MANUAL_ENTRY);
        verify(g, reviewer.getId());

        List<AuditRecord> records = audit.findByParcelIdOrderByOccurredAtDesc(parcel.getId(), PageRequest.of(0, 10))
                .getContent();

        assertThat(records).extracting(AuditRecord::getAction)
                .containsExactlyInAnyOrder(AuditAction.GEOMETRY_PROPOSED, AuditAction.GEOMETRY_VERIFIED);
        assertThat(records).allSatisfy(r -> assertThat(r.getOrigin().name()).isEqualTo("DB"));
    }

    @Test
    void auditTrailIsAppendOnly() {
        User admin = newUser("admin", RoleName.ADMIN);
        AuditRecord saved = tx.execute(s -> audit.save(AuditRecord.of(AuditAction.LOGIN_FAILURE, AuditOutcome.FAILURE,
                "USER", admin.getId(), null, null, admin.getUsername(), "req-1", "203.0.113.7",
                Map.of("reason", "bad credentials"))));
        assertThat(saved.getId()).isNotNull();

        assertThat(audit.findByActionOrderByOccurredAtDesc(AuditAction.LOGIN_FAILURE, PageRequest.of(0, 5))
                .getContent()).anySatisfy(r -> assertThat(r.getDetails()).containsEntry("reason", "bad credentials"));
        assertThatThrownBy(() -> jdbc.update("UPDATE audit_records SET outcome = 'SUCCESS' WHERE id = ?", saved.getId()))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM audit_records WHERE id = ?", saved.getId()))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("append-only");
    }

    @Test
    void spatialQueriesFindVerifiedBoundariesAndIgnoreTouchingNeighbours() {
        User surveyor = newUser("surveyor", RoleName.SURVEYOR);
        User reviewer = newUser("reviewer", RoleName.REVIEWER);
        // Far-away block so other tests' data cannot interfere: use a dedicated dx offset.
        Parcel a = newParcel(surveyor);
        Parcel b = newParcel(surveyor);
        UUID ga = propose(a.getId(), surveyor.getId(), 1.0, null, null, GeometrySource.MANUAL_ENTRY);
        verify(ga, reviewer.getId());
        // b overlaps a by half its width, and is only proposed -> not part of "current".
        UUID gb = propose(b.getId(), surveyor.getId(), 1.0005, null, null, GeometrySource.MANUAL_ENTRY);

        String probeOverlapping = GeometryPolicy.requireStorable(square(1.0005)).toText();
        String probeFar = GeometryPolicy.requireStorable(square(2.0)).toText();

        assertThat(geometries.findCurrentIntersecting(probeOverlapping)).extracting(ParcelGeometry::getId)
                .containsExactly(ga);
        assertThat(geometries.findCurrentIntersecting(probeFar)).isEmpty();
        assertThat(geometries.findCurrentOverlapping(probeOverlapping, b.getId())).extracting(ParcelGeometry::getId)
                .containsExactly(ga);
        assertThat(geometries.findCurrentOverlapping(probeOverlapping, a.getId())).isEmpty();
        assertThat(geometries.findPending(b.getId())).extracting(ParcelGeometry::getId).containsExactly(gb);
    }
}
