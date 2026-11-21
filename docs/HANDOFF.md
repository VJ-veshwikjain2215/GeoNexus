# GeoNexus – Handoff

## Current state

Phases 1–3 are integrated: Spring Boot and React foundations, PostgreSQL/PostGIS Flyway
migrations and entities, plus JWT authentication and role-based security. The frontend now
contains the implemented Stitch-informed academic GIS workspace for dashboard, map, parcel,
and boundary-review demonstration screens. It intentionally uses static demonstration data until
the parcel API is implemented.

## Completed

- `backend/`: Spring Boot 3.5.7 / Java 21, health endpoint, PostGIS model and migrations `V1`–`V6`.
- Security: BCrypt password verification, JWT issue/validation, protected API default, explicit CORS,
  DTO validation, safe API error handlers, login rate limiter, and Phase 3 tests.
- `frontend/`: React/TypeScript/Vite UI based on the completed Stitch design. It uses academic-review
  language, does not imply legal certification, and presents GeoJSON storage as EPSG:4326 consistently.
- Spatial policy: stored GeoJSON is EPSG:4326. Area, distance, and perimeter must be measured in a
  suitable projected CRS or PostGIS geography, never directly in longitude/latitude degrees.

## Corrections made in this handoff

- Replaced the Phase 1 starter screen with responsive dashboard, map workspace, parcel dossier, and
  boundary-comparison views.
- Corrected the Stitch reference's inconsistent `EPSG:32632` usage and its official/certified language.
- Updated stale README and handoff claims that incorrectly said Phase 3 was not implemented.
- Removed the extracted Stitch source from the deliverable; it is a visual reference, not production code.

## Verification

- Frontend dependencies were restored with `npm ci` and npm reported no known vulnerabilities.
- Frontend lint/typecheck/test/build could not complete in this environment because installed packages were
  incomplete after extraction (`vite`, `eslint`, and some type files are absent despite npm reporting success).
  Run `npm ci` then the four frontend checks on a normal developer machine before relying on the UI.
- `mvn verify` could not run here because Maven is forced to use a protected `C:\\Users\\LOQ\\.m2` cache. The Java
  code must be compiled and tested on a normal development machine with Maven Central and Docker available.

## Required local verification

```bash
cp .env.example .env
# Set DB_PASSWORD and a Base64 JWT secret (at least 32 random bytes).
docker compose up -d db
(cd backend && mvn -B verify)
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
```

## Important open risks

- There are no parcel REST endpoints yet. The new UI is deliberately demonstrative and must not be presented as
  a live cadastral system.
- The security event listener logs events but does not persist them to `audit_records`; Phase 4 should decide
  whether login events belong in the persistent audit trail.
- Login throttling is in-memory and must be replaced with shared storage before multiple backend instances.
- Database runtime still uses the Compose account rather than a distinct least-privilege application role.

## Next phase

Phase 4: implement protected Parcel CRUD under `/api/v1/parcels`, DTOs, GeoJSON Feature/FeatureCollection
input/output, ownership rules, pagination/filtering, append-only geometry updates, endpoint documentation,
and tests. Do not start spatial analysis or map integration until Phase 4 is complete.
