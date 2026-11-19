# GeoNexus – Setup, checks and configuration

GeoNexus is an independent **academic** project. It is not an official cadastral or government system, and nothing it
shows is a certified or legally valid land boundary. **No authentication exists yet** (Phase 3): do not expose this build to
a network or store real land data in it.

## Prerequisites

- JDK 21 or newer (the backend targets Java 21; see "Java version")
- Maven 3.9+
- Node.js 22 LTS (20.19+ also works) and npm 10+
- Docker with the Compose plugin (PostgreSQL 16 + PostGIS)

## Setup

```bash
cp .env.example .env            # set a unique DB_PASSWORD; never commit .env
docker compose up -d db
docker compose ps               # wait until the db service is "healthy"
```

### Backend

```bash
cd backend
mvn spring-boot:run
curl -i http://localhost:8080/api/v1/health
# {"status":"UP","service":"geonexus-backend","timestamp":"..."}
```

The backend reads `DB_*`, `SERVER_PORT` and `GEONEXUS_CORS_ALLOWED_ORIGINS` from real environment variables and also from
`../.env` if present (real environment variables win). There are no default credentials: without `DB_USERNAME` and
`DB_PASSWORD` it will not start. The database must be running first.

On startup **Flyway applies the migrations** in `backend/src/main/resources/db/migration` (`V1`–`V6`) to an empty database.
Check with:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"'
```

The health endpoint is a **liveness** check only; it does not report database status.

### Frontend

```bash
cd frontend
npm ci
npm run dev                     # http://localhost:5173
```

Vite proxies `/api/*` to `VITE_DEV_API_PROXY_TARGET` (default `http://localhost:8080`), so browser calls are same-origin.

## Checks

```bash
# Backend: unit + MockMvc tests, plus the database tests (Docker required, see below)
cd backend && mvn -B verify

# Fast SQL-only validation of the migrations (psql only; scratch database, never real data)
cd backend && PGHOST=localhost PGPORT=5432 PGUSER=<superuser> ./scripts/validate-sql.sh

# Frontend
cd frontend && npm run lint && npm run typecheck && npm test && npm run build
```

### Database tests

`MigrationAssertionsTest` and `PersistenceIntegrationTest` need a real PostGIS server. By default they start a throw-away
`postgis/postgis:16-3.5` container with Testcontainers (needs Docker). Without Docker, point them at a **scratch** PostGIS
server whose role has `CREATEDB` (each test class creates and migrates its own uniquely named database):

```bash
export GEONEXUS_TEST_DB_URL=jdbc:postgresql://localhost:5432/postgres
export GEONEXUS_TEST_DB_USER=...      # never commit these values
export GEONEXUS_TEST_DB_PASSWORD=...
```

`GeometryPolicyTest`, `WebConfigTest` and `HealthControllerTest` need no database.

## Configuration reference (single contract: `.env.example`)

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | backend, compose | `localhost`, `5432`, `geonexus` | |
| `DB_USERNAME`, `DB_PASSWORD` | backend, compose | none (required) | no defaults by design |
| `SERVER_PORT` | backend | `8080` | |
| `GEONEXUS_CORS_ALLOWED_ORIGINS` | backend | `http://localhost:5173` | exact origins; `*` is rejected at startup |
| `VITE_API_BASE_URL` | frontend | `/api/v1` | |
| `VITE_DEV_API_PROXY_TARGET` | Vite dev server | `http://localhost:8080` | dev only |
| `GEONEXUS_TEST_DB_URL`, `_USER`, `_PASSWORD` | backend tests only | unset (use Testcontainers) | optional; scratch server only |

Flyway settings (`spring.flyway.*`) and `spring.jpa.hibernate.ddl-auto=none` live in `backend/src/main/resources/application.yml`
and have no environment overrides.

## Java version

The backend targets **Java 21 (LTS)** (`java.version` in `backend/pom.xml`). Spring Boot 3.5 also supports newer JDKs; to move
to 25, change the property and re-run the backend tests on that JDK.

## Known limitations

- The database role used by the app is the PostgreSQL superuser created by the container (`POSTGRES_USER`). See "Database
  roles" in `architecture.md` for the intended owner/runtime split (later work).
- `docker-compose.yml` is for local development only. No backend/frontend container images exist yet.
- Dependency versions are pinned (`pom.xml` via the Spring Boot 3.5.7 parent plus `jts.version` and `testcontainers.version`;
  `package.json` exact versions plus `package-lock.json`).
- `.gitignore` ignores `*.jar`, so no Maven wrapper jar can be committed; a local Maven install is required.
