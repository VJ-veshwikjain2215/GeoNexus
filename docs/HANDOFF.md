# GeoNexus – Handoff

**Current phase:** Phase 1 – application foundation. Integrated into the repository root; **not yet fully verified** (see below).

## Completed

- Spring Boot backend skeleton (`backend/`) with `GET /api/v1/health`, env-driven datasource, restrictive CORS, safe error settings and tests.
- React/TypeScript/Vite/Tailwind shell (`frontend/`) with a health-status panel and tests.
- PostGIS Docker Compose file (`docker-compose.yml`), loopback-only DB port.
- Merged `.env.example` (see `docs/phase-1-foundation.md` for the configuration reference).
- Phase 1 package docs, kept as `docs/phase-1-foundation.md`.

## Verification status

### Authoring sandbox (from the Phase 1 package, not re-run)

| Check | Result |
|---|---|
| `npm run lint` | passed |
| `npm run typecheck` | passed |
| `npm test` (Vitest, 5 tests) | passed |
| `npm run build` | passed |
| Vite dev proxy → stand-in `/api/v1/health` | HTTP 200 through `localhost:5173` |
| `pom.xml`, `application.yml`, `docker-compose.yml` parse | well-formed |
| Backend Java sources (6 files) | syntax-parsed with `javac` API, 0 errors |

### Integration session (INTEGRATION.md section 5)

The integration session had **no access to Maven Central or the npm registry** (egress policy denied
`repo.maven.apache.org`; `registry.npmjs.org` did not resolve) and **no Docker daemon**. Results:

| Step | Result |
|---|---|
| `docker compose up -d db` | **NOT RUN** – no Docker daemon in the session |
| `docker compose config` | passed (db port bound to `127.0.0.1`, required vars enforced) |
| `mvn -B verify` | **NOT RUN / FAILED TO START** – parent POM `spring-boot-starter-parent:3.5.7` could not be downloaded (network denied) |
| `npm ci` | **FAILED** – registry unreachable; lint, typecheck, test and build therefore **NOT RUN** |
| `pom.xml`, `application.yml`, `docker-compose.yml` well-formedness | passed |

None of these failures indicates a defect in the code; they are environment limits. **Nothing was fixed or changed in the
Phase 1 code.** Whether Spring Boot `3.5.7` resolves, whether the MockMvc tests pass, and whether the
`postgis/postgis:16-3.5` image works remain unconfirmed.

**Run this on a machine with network access and Docker before relying on the foundation:**

```bash
cp .env.example .env        # then set a unique DB_PASSWORD
docker compose up -d db
(cd backend && mvn -B verify)
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
```

If Maven reports that `3.5.7` is missing, move to the newest Spring Boot 3.5.x.

## Known issues / risks

- No authentication yet (health is public by design).
- App DB user is the container superuser.
- Backend startup requires a running database.
- `README.md` previously said Java 25; the backend targets Java 21 (`java.version` in `backend/pom.xml`).
- CORS allows only `GET, HEAD, OPTIONS` until write endpoints exist; widen deliberately.
- `.gitignore` ignores `*.jar`, so no Maven wrapper jar can be committed; a local Maven install is required.
- Do not expose this build to a network or store real land data in it.

## Suggested next task

Confirm against the project's phase plan (Phase 2 is not defined by the Phase 1 package): introduce Flyway and the first versioned
migration (keep `spring.jpa.hibernate.ddl-auto=none`), document and enforce the CRS/SRID policy, and add Spring Security with
BCrypt/Argon2 + JWT and role-based authorization, each in its own reviewed change. Do not start boundary-detection or AI work
before the parcel and review workflow exists.

**No later phase has been started.**
