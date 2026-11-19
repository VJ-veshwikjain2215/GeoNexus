# GeoNexus – Phase 1: Application Foundation

This folder is a self-contained **foundation package**. After integration it is moved into the repository root
(see [`INTEGRATION.md`](INTEGRATION.md)). Until then, run everything from inside this folder.

GeoNexus is an independent **academic** project. It is not an official cadastral or government system, and nothing it
shows is a certified or legally valid land boundary.

## What Phase 1 contains

| Part | Contents |
|---|---|
| `backend/` | Spring Boot 3.5 + Maven app (`com.geonexus`), env-based PostgreSQL config, public `GET /api/v1/health`, restrictive CORS, safe error settings, MockMvc tests |
| `frontend/` | React 19 + TypeScript + Vite + Tailwind CSS shell that calls the health endpoint, Vitest tests, ESLint |
| `docker-compose.yml` | PostgreSQL 16 with PostGIS 3.5, loopback-only port, healthcheck |
| `.env.example` | Placeholder configuration (no real credentials) |

### Explicitly not included (later phases)

Entities, Flyway migrations, authentication/JWT/authorization, parcel APIs, GeoJSON handling, the CRS/SRID policy and
spatial validation, Leaflet maps, boundary comparison, audit log, OpenAPI documentation, AI features. The health endpoint is
public on purpose; **no security is implemented yet**, so do not expose this build to a network or store real land data in it.

## Prerequisites

- JDK 21 or newer (the build targets Java 21; see "Java version" below)
- Maven 3.9+
- Node.js 22 LTS (20.19+ also works) and npm 10+
- Docker with the Compose plugin

## Setup

```bash
cd workstreams/phase-1-foundation      # or the repository root after integration
cp .env.example .env
# Edit .env: set a unique DB_PASSWORD (never commit .env).
```

### 1. Database

```bash
docker compose up -d db
docker compose ps                       # wait until the db service is "healthy"
```

Optional PostGIS check (the image enables the extension in the `DB_NAME` database on first start):

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT postgis_version();"'
```

### 2. Backend

```bash
cd backend
mvn spring-boot:run
```

The backend reads `DB_*`, `SERVER_PORT` and `GEONEXUS_CORS_ALLOWED_ORIGINS` from real environment variables, and also from
`../.env` if present (real environment variables win). There are no default credentials: without `DB_USERNAME` and
`DB_PASSWORD` it will not start. The database must be running first, because the JPA layer connects at startup.

```bash
curl -i http://localhost:8080/api/v1/health
# {"status":"UP","service":"geonexus-backend","timestamp":"..."}
```

The health endpoint is a **liveness** check only; it does not report database status.

### 3. Frontend

```bash
cd frontend
npm ci
npm run dev                             # http://localhost:5173
```

In development, Vite proxies `/api/*` to `VITE_DEV_API_PROXY_TARGET` (default `http://localhost:8080`), so the browser makes
same-origin calls. The page shows whether the backend is reachable.

## Checks

```bash
# Backend (needs Maven Central access)
cd backend && mvn -B verify

# Frontend
cd frontend
npm run lint
npm run typecheck
npm test
npm run build
```

## Configuration reference

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | backend, compose | `localhost`, `5432`, `geonexus` | |
| `DB_USERNAME`, `DB_PASSWORD` | backend, compose | none (required) | no defaults by design |
| `SERVER_PORT` | backend | `8080` | |
| `GEONEXUS_CORS_ALLOWED_ORIGINS` | backend | `http://localhost:5173` | exact origins; `*` is rejected at startup |
| `VITE_API_BASE_URL` | frontend | `/api/v1` | |
| `VITE_DEV_API_PROXY_TARGET` | Vite dev server | `http://localhost:8080` | dev only |

## Java version

The root README mentions Java 25. This foundation targets **Java 21 (LTS)** (`java.version` in `backend/pom.xml`) because it
is what was available to verify against. Spring Boot 3.5 also supports newer JDKs; to move to 25, change the property and
re-run the backend tests on that JDK.

## Known limitations

- The database role used by the app is also the PostgreSQL superuser created by the container (`POSTGRES_USER`). Separating
  a migration/owner role from a least-privilege runtime role is a later-phase task.
- `docker-compose.yml` is for local development only. No backend/frontend container images exist yet.
- Dependency versions are pinned (`pom.xml` via the Spring Boot 3.5.7 parent; `package.json` exact versions plus
  `package-lock.json`). The backend could not be built in the authoring sandbox; see `INTEGRATION.md`.
