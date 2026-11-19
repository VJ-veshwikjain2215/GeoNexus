# GeoNexus – Handoff

**Current state:** Phase 1 (application foundation) and Phase 2 (data layer) are integrated into one repository.
**Not started:** Phase 3 (authentication/authorization) and every later phase.
**Not fully verified:** the Java build and the Flyway/JPA runtime could not be run in the integration session (see below).

## What is in the repository

- `backend/` – Spring Boot 3.5.7 / Java 21 / Maven, base package `com.geonexus`.
  - Phase 1: `GET /api/v1/health`, env-driven datasource, restrictive read-only CORS, safe error settings, MockMvc tests.
  - Phase 2: Flyway migrations `V1`–`V6` (PostGIS, users/roles, parcels, surveys, audit, parcel geometries), JPA entities and
    repositories (`user`, `parcel`, `survey`, `geometry`, `audit`, `common`), `GeometryPolicy` (CRS/SRID rules), database and
    unit tests, `scripts/validate-sql.sh`.
- `frontend/` – React 19 / TypeScript / Vite / Tailwind shell with a backend-status panel (unchanged from Phase 1).
- `docker-compose.yml` – PostgreSQL 16 + PostGIS 3.5, loopback-only port.
- `.env.example` – the single environment contract (Phase 2 added only optional, commented `GEONEXUS_TEST_DB_*` test variables).
- `docs/` – `architecture.md`, `data-model.md` (schema + CRS policy), `setup.md` (run/check/config), this file.

## Integration decisions

| Topic | Decision |
|---|---|
| Source layout | Phase 1 `backend/`, `frontend/`, `docker-compose.yml` placed at the repo root; Phase 2 files merged into `backend/` with no overwrites (collision check found none). Workstream folders and their `INTEGRATION.md` files are not carried over. |
| Package names | Both use `com.geonexus`; Phase 2 packages do not overlap Phase 1 (`config`, `health`). No `@EntityScan`/`@EnableJpaRepositories` needed. |
| Flyway history | One history in `backend/src/main/resources/db/migration`. Phase 1 had no migrations, so Phase 2 keeps `V1`–`V6` unrenumbered. |
| Dependencies | Added to the existing `pom.xml`: `hibernate-spatial`, `flyway-core`, `flyway-database-postgresql` (all Boot-managed), `jts-core` 1.20.0 (`jts.version`), Testcontainers `postgresql` + `junit-jupiter` (test, `testcontainers.version` 1.21.3 pinned for the 1.x API the tests use). Spring Boot parent stays defined once (3.5.7). |
| Database config | Phase 1 `application.yml` already had `ddl-auto: none` and `open-in-view: false`; added `spring.flyway.enabled=true` and `locations`. Datasource variables unchanged (`DB_*`). |
| PostGIS version | Compose uses `16-3.5`; Phase 2 tests used `16-3.4`. Test image changed to `16-3.5` so tests and local runtime match. Phase 2's SQL was validated on PostGIS 3.4 (3.4.2 by its authors, 3.4.3 here). |
| Environment variables | One contract. No renames were needed. |
| Docs | Phase 1's package README (`docs/phase-1-foundation.md`) was folded into `docs/setup.md` (no duplicate config docs); Phase 2's `data-model.md` kept as `docs/data-model.md` with stale references fixed; `dependency-additions.md` merged into `pom.xml` and dropped. |
| Base repository | The upload also contained `GeoNexus-main.zip` (baseline) and `GeoNexus-phase1-integrated.zip` (baseline + Phase 1). The latter's `backend/`, `frontend/`, `docker-compose.yml` and `.env.example` were checked byte-identical to the Phase 1 workstream, so its root was used as the base; root docs were then updated for Phase 2. |

## Verification results (integration session)

| Check | Result |
|---|---|
| `npm ci`, `npm run lint`, `npm run typecheck` | passed |
| `npm test` (Vitest, 5 tests) | passed |
| `npm run build` | passed |
| Migrations `V1`–`V6` applied in order with `psql` to an empty database (PostgreSQL 16.10 + PostGIS 3.4.3) | passed |
| `schema_assertions.sql` via `scripts/validate-sql.sh` (positive assertions and must-fail checks) | passed |
| `geometry_columns` for `parcel_geometries` | `4326 / MULTIPOLYGON` |
| Migration file numbering | one file each for V1–V6, no duplicates |
| Backend Java (36 files, main + test) parsed with `javac` | 0 syntax errors (syntax only; symbols not resolved) |

**NOT run (environment limits, not known defects):**

| Check | Why |
|---|---|
| `mvn -B verify` (compile, `GeometryPolicyTest`, MockMvc tests, `MigrationAssertionsTest`, `PersistenceIntegrationTest`) | No Maven Central access, so no dependencies could be resolved; Maven could not be installed from the Ubuntu mirror either |
| Flyway execution and `flyway_schema_history` (expect 6 successful rows) | Same; SQL was run through `psql`, not Flyway |
| `mvn spring-boot:run` against a migrated database | Same |
| `docker compose up -d db`, image `postgis/postgis:16-3.5` | No Docker daemon |
| Testcontainers-based tests | No Docker |

Open risks to check on first Java compile: Spring Boot `3.5.7` resolving; `hibernate-spatial` and `jts-core` 1.20.0 being
the matching pair (`mvn dependency:tree`); Hibernate JSON/spatial annotations in the entities; Testcontainers 1.x API; the
simple-query-mode assertion script in `MigrationAssertionsTest` (fall back to `validate-sql.sh` in CI if problematic).

**Run this on a machine with Maven Central and Docker before relying on the integration:**

```bash
cp .env.example .env            # set a unique DB_PASSWORD
docker compose up -d db
(cd backend && mvn -B verify)
(cd backend && mvn spring-boot:run)   # then: SELECT * FROM flyway_schema_history;  -> 6 rows
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
```

## Known issues / risks

- No authentication or authorization yet (health is public by design). Do not expose to a network or load real land data.
- The app connects as the container superuser; the owner/runtime role split in `docs/architecture.md` is not implemented, and a superuser can disable the immutability triggers.
- Backend startup requires a running, PostGIS-enabled database; V1 runs `CREATE EXTENSION IF NOT EXISTS postgis` (on managed PostgreSQL enable it once as admin).
- CORS allows only `GET, HEAD, OPTIONS`; widen deliberately when write endpoints arrive.
- Overlap between parcels is reported, not forbidden. Four-eyes review means demo data needs at least two users. No seed users exist.
- Applied migrations are immutable: every schema change is a new `V7+` file.
- Java 21 is targeted although the original README mentioned 25.
- `.gitignore` ignores `*.jar`, so no Maven wrapper jar can be committed.

## Next phase (not started here)

Phase 3: Spring Security with BCrypt/Argon2 hashing into `users.password_hash`, JWT, role-based authorization, application
audit events (`origin = 'APP'`), and widening CORS only as needed. Later API phases must call `GeometryPolicy.requireStorable`
for every submitted geometry.
