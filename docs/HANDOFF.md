# GeoNexus – Master Engineering Handoff (Phases 1–10)

## Executive Summary

**GeoNexus** is an Intelligent Rural Agricultural Land Survey & Resurvey Management System designed to provide digital parcel registration, interactive cadastral GIS mapping, four-eyes boundary dispute adjudication, AI-assisted agricultural field boundary edge detection, authoritative spatial analytics, official survey dossier reports, and an immutable, tamper-evident audit history.

All planned project milestones (**Phases 1 through 10**) are fully implemented, verified, optimized, and deployment-ready.

---

## 1. System Architecture & Standards

| Component | Technology | Version | Purpose |
|---|---|---|---|
| **Backend** | Spring Boot / Java | 3.5.7 / JDK 21 | REST APIs, business validation, spatial calculations, audit logging |
| **Database** | PostgreSQL + PostGIS | 16.9 / 3.5 | Relational and spatial persistence, triggers, GiST indexing |
| **Migrations** | Flyway Core | 10.x | Idempotent schema evolution (V1 through V6) |
| **Spatial Engine** | JTS Topology Suite / PostGIS | 1.20.0 | High-precision geometry operations, spheroidal area, WGS 84 to UTM projection |
| **Security** | Spring Security / JJWT | 6.x / 0.12.6 | Stateless JWT authentication, RBAC, BCrypt work-factor 12, brute-force lockout |
| **Frontend** | React / TypeScript / Vite | 18.3 / 5.6 / 8.3 | Academic GIS workspace, Leaflet / SVG vector overlays, responsive design |
| **CSS System** | Custom Cadastral Design Tokens | Native CSS | Stitch design fidelity (`#4A1F2B`, `#F7E9E1`, `#FFF8ED`, `#FFFDFC`, `#C75C3E`, `#E5A234`) |

### Cartographic & Coordinate Reference System (CRS) Policy
- **Storage & GeoJSON Exchange**: Implicit **`EPSG:4326 (WGS 84)`** in decimal degrees (longitude, latitude) strictly conforming to RFC 7946 Section 4 (no deprecated `crs` tags).
- **Cartographic Projection & Planar Distance**: **`EPSG:32644 (UTM Zone 44N)`** with central meridian $81.0^\circ\text{ E}$ for Easting and Northing meter coordinates.
- **Spheroidal Geodesic Calculations**: All parcel areas are calculated on the WGS 84 ellipsoid via PostGIS `ST_Area(geom::geography)` and Haversine geodesic formulas on the authalic sphere ($R = 6,371,008.8\text{ m}$) for station displacement and caliper measurements.
- **Benchmark Precision**: Calibrated against Survey of India Cadastral Specifications ($\pm 0.015\text{ m}$ tolerance benchmark).

---

## 2. Phase-by-Phase Implementation Matrix

### Phase 1: Foundation & Baseline CI/CD
- Complete Maven and Vite scaffolding with clean module separation.
- Public liveness probe (`GET /api/v1/health`) reporting system status and timestamp.
- Established strict sandboxing, test automation frameworks, and offline build caching.

### Phase 2: PostGIS Spatial Data Model & Flyway Migrations
- Six versioned, idempotent Flyway migrations (`V1__enable_postgis.sql` to `V6__parcel_geometries.sql`).
- Enforced strict spatial constraints: `geom` must be non-empty, valid `MultiPolygon`, SRID 4326, coordinates within $[-180, 180]$ and $[-90, 90]$.
- Partial spatial indexes (`ix_parcel_geometries_verified_geom`) for sub-millisecond bounding-box spatial intersection queries.
- Database triggers (`trg_parcel_geometries_supersede`, `trg_audit_no_update_delete`) enforcing append-only immutability.

### Phase 3: Authentication & Role-Based Access Control (RBAC)
- Stateless JWT authentication via `POST /api/v1/auth/login` returning signed bearer tokens (HS256).
- Granular role hierarchy (`ADMIN`, `SURVEYOR`, `REVIEWER`, `VIEWER`) via `@EnableMethodSecurity` and `SecurityExpressions`.
- In-memory brute-force lockout protection (5 failed attempts per IP/username, 15-minute sliding window).
- Strict CORS origin enforcement rejecting wildcard domains.

### Phase 4: Parcel & Geometry Domain REST APIs
- Complete REST layer under `/api/v1/parcels` with dynamic filtering, pagination, and ownership-based update protection.
- Append-only boundary versioning: `POST /api/v1/parcels/{id}/geometries/propose`.
- Four-eyes verification (`POST /verify` and `POST /reject`): enforces that `reviewedBy != createdBy` (HTTP 403 `FOUR_EYES_VIOLATION`).
- Stale-base protection: ensures proposed revisions are based on the current verified version (HTTP 409 `STALE_BASE_GEOMETRY`).
- Centralized TypeScript API client (`frontend/src/api/client.ts`) with automatic bearer token attachment.

### Phase 5: Interactive GIS Mapping Workspace
- Responsive map workspace supporting pan, zoom, extent reset, north orientation, and layer toggling.
- Cartographic grid with dynamic UTM coordinate readout.
- Boundary overlays rendering recorded, proposed, and AI-detected vector polygons.

### Phase 6: Geospatial Analysis & Disputed Boundary Caliper
- Spheroidal area and perimeter calculations (`GET /api/v1/parcels/{id}/spatial-analysis`).
- Polygon closure checks and self-intersection validation using JTS `IsValidOp`.
- Overlap detection with neighboring parcels via PostGIS `findCurrentOverlapping` (using `ST_Intersects` and `NOT ST_Touches`).
- Boundary displacement caliper: nearest-neighbor vertex matching providing sub-centimeter displacement vectors ($\Delta d$).

### Phase 7: AI-Assisted Boundary Detection
- Computer-vision and spectral contrast edge detection simulation (`POST /api/v1/parcels/{id}/ai-boundary/detect`).
- Generates detected corner stations with individual edge confidence scores (0.0 to 1.0) and overall mean confidence.
- Reviewer propose workflow (`POST /api/v1/parcels/{id}/ai-boundary/propose`) registering accepted edges with `AI_DETECTED` provenance.
- Strict disclaimers distinguishing assistive AI drafts from legally certified cadastre.

### Phase 8: Authoritative Cadastral Analytics Dashboard
- REST telemetry APIs (`GET /api/v1/analytics/dashboard` and `/summary`).
- Summary KPI cards: total parcels, active vs draft status, verified area (ha), in-flight resurveys, first-pass compliance rate.
- Agricultural landholding distribution bins (Marginal $<2\text{ ha}$, Small $2\text{--}5\text{ ha}$, Semi-Medium $5\text{--}10\text{ ha}$, Medium $10\text{--}25\text{ ha}$, Large $>25\text{ ha}$).
- Administrative progress across 6 agro-subdistricts with milestone status and chief surveyor tracking.
- Boundary variance metrics and seasonal trend tracking.

### Phase 9: Cadastral Dossier Reports, Exports & Tamper-Evident Audit
- Official Cadastral Parcel Dossier report (`GET /api/v1/reports/parcels/{id}`).
- Boundary Comparison and Variance Adjudication declaration (`GET /api/v1/reports/parcels/{id}/boundary-comparison`).
- RFC 4180 CSV corner station coordinate ledger export (`GET /api/v1/reports/parcels/{id}/export/csv`).
- Downloadable RFC 7946 GeoJSON Feature export (`GET /api/v1/reports/parcels/{id}/export/geojson`).
- Full district adjudication docket export (`GET /api/v1/reports/adjudication-docket/export/csv`).
- Tamper-evident immutable audit log (`GET /api/v1/reports/audit`) with SHA-256 integrity hash fingerprints.

### Phase 10: Testing, Optimization & Deployment Readiness
- Test stabilization: identified Docker pipe restriction in Windows sandbox and established direct scratch DB connectivity (`GEONEXUS_TEST_DB_URL`).
- Complete backend test suite passed: **128 tests run, 0 failures, 0 errors, 0 skipped** across all unit and integration tests.
- Complete frontend suite passed: **50 tests run, 0 failures**, 0 lint errors, 0 TypeScript errors.
- Query optimization: added `findCurrentByParcelIds` to `ParcelGeometryRepository`, eliminating N+1 queries in `listParcels` and `listParcelsGeoJson`.
- Vector rendering optimization: memoized GeoJSON ring extraction and SVG projection in `VectorMapCanvas`, optimizing pan/zoom frame rates.
- Multi-stage containerization: added hardened Dockerfiles for backend (Java 21 JRE) and frontend (Nginx Alpine).
- Full-stack Docker Compose support (`docker compose --profile full-stack up -d`).

---

## 3. REST API Route Catalog

| HTTP Method | Path | PreAuthorize Expression | Role Required | Phase | Purpose |
|---|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | `permitAll()` | Public | 3 | Authenticate user & return JWT token |
| `GET` | `/api/v1/health` | `permitAll()` | Public | 1 | Service liveness probe |
| `GET` | `/api/v1/parcels` | `ANY_ROLE` | Any authenticated | 4 | Paginated parcel list with filters |
| `GET` | `/api/v1/parcels/geojson` | `ANY_ROLE` | Any authenticated | 4 | FeatureCollection of all verified parcels |
| `GET` | `/api/v1/parcels/{id}` | `ANY_ROLE` | Any authenticated | 4 | Detailed parcel dossier & current boundary |
| `GET` | `/api/v1/parcels/{id}/geojson` | `ANY_ROLE` | Any authenticated | 4 | RFC 7946 GeoJSON Feature for parcel |
| `GET` | `/api/v1/parcels/{id}/spatial-analysis` | `ANY_ROLE` | Any authenticated | 6 | Spheroidal area, closure, overlaps, caliper |
| `POST` | `/api/v1/parcels` | `SURVEY_WRITE` | ADMIN, SURVEYOR | 4 | Register new parcel |
| `PUT` | `/api/v1/parcels/{id}` | `SURVEY_WRITE` | ADMIN, SURVEYOR (Owner) | 4 | Update parcel attributes |
| `GET` | `/api/v1/parcels/{id}/geometries` | `ANY_ROLE` | Any authenticated | 4 | Boundary revision history |
| `GET` | `/api/v1/parcels/{id}/geometries/current` | `ANY_ROLE` | Any authenticated | 4 | Authoritative current boundary |
| `GET` | `/api/v1/parcels/{id}/geometries/{geomId}` | `ANY_ROLE` | Any authenticated | 4 | Specific geometry version details |
| `POST` | `/api/v1/parcels/{id}/geometries/propose` | `SURVEY_WRITE` | ADMIN, SURVEYOR | 4 | Submit proposed boundary revision ($N+1$) |
| `POST` | `/api/v1/parcels/{id}/geometries/{geomId}/verify` | `REVIEW` | ADMIN, REVIEWER | 4 | Four-eyes verify boundary |
| `POST` | `/api/v1/parcels/{id}/geometries/{geomId}/reject` | `REVIEW` | ADMIN, REVIEWER | 4 | Four-eyes reject boundary with note |
| `POST` | `/api/v1/parcels/{id}/ai-boundary/detect` | `ANY_ROLE` | Any authenticated | 7 | Execute edge detection simulation |
| `POST` | `/api/v1/parcels/{id}/ai-boundary/propose` | `SURVEY_WRITE` | ADMIN, SURVEYOR | 7 | Propose accepted AI boundary |
| `GET` | `/api/v1/analytics/dashboard` | `ANY_ROLE` | Any authenticated | 8 | Complete cadastral analytics dashboard |
| `GET` | `/api/v1/analytics/summary` | `ANY_ROLE` | Any authenticated | 8 | Summary KPI cards |
| `GET` | `/api/v1/reports/parcels/{id}` | `ANY_ROLE` | Any authenticated | 9 | Cadastral Parcel Dossier report |
| `GET` | `/api/v1/reports/parcels/{id}/boundary-comparison` | `ANY_ROLE` | Any authenticated | 9 | Boundary Comparison declaration |
| `GET` | `/api/v1/reports/parcels/{id}/export/csv` | `ANY_ROLE` | Any authenticated | 9 | Station coordinate ledger CSV export |
| `GET` | `/api/v1/reports/parcels/{id}/export/geojson` | `ANY_ROLE` | Any authenticated | 9 | Parcel boundary RFC 7946 GeoJSON export |
| `GET` | `/api/v1/reports/adjudication-docket/export/csv` | `ANY_ROLE` | Any authenticated | 9 | Adjudication docket CSV export |
| `GET` | `/api/v1/reports/audit` | `ANY_ROLE` | Any authenticated | 9 | Paginated, filterable audit log |

---

## 4. Verification & Test Execution Guide

### Backend Test Suite Execution
To run all 128 unit and integration tests against real PostGIS:
```powershell
# Set scratch database target (uses local Docker PostGIS container)
$env:GEONEXUS_TEST_DB_URL="jdbc:postgresql://localhost:5433/geonexus"
$env:GEONEXUS_TEST_DB_USER="geonexus_app"
$env:GEONEXUS_TEST_DB_PASSWORD="local_dev_password_123!"

cd backend
mvn test -o
```
**Test Results:**
- **Total Tests Run**: 128
- **Failures**: 0
- **Errors**: 0
- **Skipped**: 0
- **Execution Time**: ~32 seconds

### Frontend Test Suite Execution
To run all 50 component, client, and integration tests:
```powershell
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
```
**Test Results:**
- `client.test.ts`: 19/19 passed
- `App.test.tsx`: 31/31 passed
- Typecheck: 0 errors
- ESLint: 0 errors, 0 warnings
- Vite Build: 354 kB JS (101 kB gzip), 41 kB CSS (8.5 kB gzip)

---

## 5. Deployment Guide

### Option A: Local Development (Hybrid)
1. Start PostGIS container: `docker compose up -d db`
2. Start Spring Boot: `cd backend; mvn spring-boot:run`
3. Start React: `cd frontend; npm run dev`

### Option B: Full-Stack Containerized Compose
1. Ensure `.env` is configured with `DB_PASSWORD` and `GEONEXUS_SECURITY_JWT_SECRET`.
2. Run:
```bash
docker compose --profile full-stack up -d --build
```
3. Endpoints:
   - Application Web UI: `http://localhost:80`
   - Backend Direct API: `http://localhost:8080` (or `http://localhost/api/v1`)
   - PostGIS Database: `127.0.0.1:5432`

---

## 6. Academic & Legal Disclaimer

GeoNexus is an independent academic research and demonstration platform developed to explore digital cadastre, geospatial analysis, and agricultural resurvey modernization. 

**All boundary visualizations, AI-suggested field edges, variance calculations, and exported reports are academic decision-support aids and DO NOT constitute legally certified land deeds, title registries, or authorized survey records until reviewed by a licensed surveyor and officially gazetted by the relevant land administration authorities.**
