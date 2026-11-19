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
- Schema changes will come only from versioned migrations (Flyway, later phase); `spring.jpa.hibernate.ddl-auto=none`.

## Decisions still to confirm

- Authentication provider and role model.
- Exact parcel, survey, and resurvey data model.
- Geometry storage conventions and CRS.
- API versioning and error response format.
- Image storage and processing pipeline.
- Deployment topology and managed PostgreSQL/PostGIS provider.

This document describes the intended design, not proof that these components have already been implemented.
