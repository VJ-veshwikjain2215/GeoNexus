# GeoNexus – Initial Architecture

**Status:** Proposed architecture. Update this document as implementation decisions are confirmed.

## Goals

GeoNexus is intended to support agricultural parcel information management, map-based visualization, survey/resurvey workflows, boundary comparison, and geospatial analysis.

## Logical components

```text
+-------------------------------+
| React + TypeScript Frontend   |
| Map UI / Parcel UI / Reports  |
+---------------+---------------+
                |
                | HTTPS / REST / JSON
                v
+-------------------------------+
| Java + Spring Boot Backend    |
| API / Validation / Security   |
| Application Services          |
+---------------+---------------+
                |
                | JPA + spatial queries
                v
+-------------------------------+
| PostgreSQL + PostGIS          |
| Relational + spatial data     |
+-------------------------------+

Supporting processing:
- JTS / GeoTools: geometry and geospatial operations
- OpenCV: image-processing experiments
- Leaflet: frontend map rendering
- GeoJSON: exchange format for spatial features
```

## Responsibilities

### Frontend

- Render interactive maps and parcel layers.
- Provide parcel, survey, and resurvey interfaces.
- Display comparison results and analytics.
- Communicate with backend REST endpoints.

### Backend

- Expose versionable REST APIs.
- Enforce authentication, authorization, and input validation.
- Implement parcel and survey business rules.
- Coordinate persistence and geospatial operations.
- Record important changes for auditability.

### Database

- Store application entities and relationships.
- Store and query spatial geometries with PostGIS.
- Apply appropriate constraints and indexes after data models are defined.

## Spatial data principles

- Define and document the coordinate reference system (CRS) for every stored geometry.
- Validate geometry type, coordinate ranges, and topology before persistence.
- Use GeoJSON for interoperable frontend/backend geometry exchange where appropriate.
- Record geometry provenance and update history.
- Treat detected or AI-suggested boundaries as unverified until reviewed by an authorized human.

## Security and privacy

- Keep credentials outside source control.
- Enforce authorization in the backend.
- Use synthetic or properly licensed datasets.
- Avoid collecting or exposing personal and ownership information unless there is a clear, authorized requirement.

## Confirmed decisions (Phase 1)

- Backend: Spring Boot 3.5.x on Java 21 (LTS), Maven.
- REST base path: `/api/v1`.
- Frontend dev: Vite proxies `/api` to the backend, so browser calls are same-origin.
- CORS: exact configured origins only (wildcards rejected at startup), read-only methods (`GET, HEAD, OPTIONS`), no credentials.
- Schema changes come only from versioned Flyway migrations (`backend/src/main/resources/db/migration`, one history, `V1`–`V6` so far); `spring.jpa.hibernate.ddl-auto=none`.

## Confirmed decisions (Phase 2 – data model)

Full detail: [`data-model.md`](data-model.md).

- Database: PostgreSQL 16 + PostGIS; JPA entities with Hibernate Spatial and JTS in the `com.geonexus` packages `user`, `parcel`, `survey`, `geometry`, `audit`, `common`.
- Stored CRS: **EPSG:4326** only, axis order lon/lat, column type `geometry(MultiPolygon, 4326)`; GeoJSON (RFC 7946) is served unchanged with no `crs` member and no reprojection.
- Area/length use `geography` (spheroidal metres), never planar maths on lon/lat. `GeometryPolicy.requireStorable()` is the Java gate and every API phase must call it; database `CHECK`s are the last line of defence.
- Parcel boundaries are **append-only versions** (`parcel_geometries`); a resurvey adds a version, never overwrites. Status flow `PROPOSED → VERIFIED → SUPERSEDED` (or `REJECTED`), one verified boundary per parcel, four-eyes review enforced by database triggers. AI-detected geometry starts unverified like any other.
- Audit trail is append-only (`audit_records`); the database writes geometry events (`origin = 'DB'`), the application will write the rest (`origin = 'APP'`).
- Overlap between parcels is reported (`findCurrentOverlapping`), not forbidden.
- Role catalogue: ADMIN, SURVEYOR, REVIEWER, VIEWER. Users store only a password hash; authorization is not implemented yet.

### Database roles (recommended, not yet implemented)

Run Flyway with an owner/migration role and the application with a separate least-privilege role holding `SELECT/INSERT/UPDATE`
on the tables, `INSERT/SELECT` only on `audit_records`, and no `DELETE`, `TRUNCATE` or trigger-disable rights on
`parcel_geometries` / `audit_records`. The triggers stop accidental mutation; role separation stops a compromised app account
from dropping them. Today the app uses the container superuser (local development only).

## Decisions still to confirm

- Authentication provider and token model (Phase 3; the `users`/`roles` schema is ready for it).
- API versioning and error response format.
- Image storage and processing pipeline.
- Deployment topology and managed PostgreSQL/PostGIS provider.

This document describes the intended design, not proof that these components have already been implemented.
