# GeoNexus – Handoff (Phase 4)

## Current state

Phase 4 (**Parcel & Geometry Domain APIs**) is fully implemented across the backend and frontend:
1. Complete REST API layer for parcels and versioned geometries under `/api/v1/parcels`.
2. RFC 7946-compliant GeoJSON Feature and FeatureCollection input and output without `crs` member (EPSG:4326 implicit).
3. Append-only geometry lifecycle: proposal submission, four-eyes verification, and rejection with mandatory audit trail.
4. Centralized frontend API client (`src/api/client.ts`) integrated with `src/App.tsx`, preserving exact Stitch design visual fidelity.

---

## Completed in Phase 4

### 1. Parcel Domain & APIs
- **DTOs & Parameters**: `CreateParcelRequest`, `UpdateParcelRequest`, `ParcelSummaryResponse`, `ParcelDetailResponse`, `ParcelProperties`, `ParcelFilterParams`, `PagedResponse<T>`.
- **Dynamic Filtering & Search**: `ParcelSpecifications` supports filtering by `status`, `district`, `state`, `ownerId`, and case-insensitive wildcard search over parcel code, name, village, and district.
- **Service Layer**: `ParcelService` enforces unique parcel code format, ownership assignment, DRAFT/ACTIVE status flows, and writes application audit records (`PARCEL_CREATED`, `PARCEL_UPDATED`, `PARCEL_ARCHIVED`).
- **REST Endpoints (`ParcelController`)**:
  - `GET /api/v1/parcels` — Paginated listing with filtering and search (Role: `ANY_ROLE`).
  - `GET /api/v1/parcels/geojson` — FeatureCollection of verified parcel boundaries (Role: `ANY_ROLE`).
  - `GET /api/v1/parcels/{id}` — Full parcel dossier with current verified geometry and pending count (Role: `ANY_ROLE`).
  - `GET /api/v1/parcels/{id}/geojson` — RFC 7946 GeoJSON Feature for the parcel's verified boundary (Role: `ANY_ROLE`).
  - `POST /api/v1/parcels` — Create parcel with optional initial boundary proposal (Role: `SURVEY_WRITE`: `SURVEYOR`, `ADMIN`).
  - `PUT /api/v1/parcels/{id}` — Update mutable parcel attributes with optimistic row versioning (Role: `SURVEY_WRITE`).

### 2. Geometry Lifecycle & Spatial APIs
- **DTOs**: `ProposeGeometryRequest`, `ReviewDecisionRequest`, `RejectGeometryRequest`, `GeometryResponse`.
- **RFC 7946 GeoJSON Processing**: `GeoJsonConverter` converts bidirectionally between JTS `MultiPolygon` and GeoJSON `Polygon`/`MultiPolygon`, rounding coordinates to 7 decimal places (~1 cm). Enforces SRID 4326, finite coordinates, lon `[-180, 180]`, lat `[-90, 90]`, 2D-only, and OGC topology via `GeometryPolicy.requireStorable()`.
- **Append-Only Versioning & Resurvey Workflow**:
  - `POST /api/v1/parcels/{parcelId}/geometries/propose` — Proposes version $N+1$ holding a row lock (`findByIdForUpdate`). Validates survey reference if `source == SURVEY` and AI confidence.
  - `GET /api/v1/parcels/{parcelId}/geometries` — Full boundary history, newest version first.
  - `GET /api/v1/parcels/{parcelId}/geometries/current` — Single current verified boundary.
  - `GET /api/v1/parcels/{parcelId}/geometries/{geometryId}` — Specific boundary version details.
- **Four-Eyes Verification & Stale-Base Protection**:
  - `POST /api/v1/parcels/{parcelId}/geometries/{geometryId}/verify` (Role: `REVIEW`: `REVIEWER`, `ADMIN`).
    - Enforces that `reviewedBy != createdBy`. Violations throw `FourEyesViolationException` (HTTP 403 `FOUR_EYES_VIOLATION`).
    - Validates that `basedOnGeometryId` matches the currently verified version. Stale proposals throw `StaleBaseGeometryException` (HTTP 409 `STALE_BASE_GEOMETRY`).
    - Database triggers automatically supersede previously verified boundaries and record database audit rows (`origin = 'DB'`).
  - `POST /api/v1/parcels/{parcelId}/geometries/{geometryId}/reject` (Role: `REVIEW`).
    - Requires mandatory rejection rationale. Enforces four-eyes reviewer check.

### 3. Centralized Exception Handling
- Added `GlobalExceptionHandler` mapping for:
  - `InvalidGeometryException` → HTTP 400 `INVALID_GEOMETRY`.
  - `ResourceNotFoundException` → HTTP 404 `NOT_FOUND`.
  - `ConflictException` → HTTP 409 `CONFLICT`.
  - `FourEyesViolationException` → HTTP 403 `FOUR_EYES_VIOLATION`.
  - `StaleBaseGeometryException` → HTTP 409 `STALE_BASE_GEOMETRY`.

### 4. Frontend Integration (`frontend/`)
- **Centralized API Client**: Created `src/api/client.ts` with strongly typed methods for `authApi`, `parcelApi`, and `geometryApi`, automatic `Authorization: Bearer <token>` injection, and `tokenStore`.
- **Live UI Connection**: Updated `src/App.tsx`:
  - `Dashboard` and `Parcels` views fetch live parcel records via `parcelApi.list()`, with seamless fallback to Stitch demonstration mockups when the backend is offline.
  - Added "Register New Parcel" modal trigger calling `parcelApi.create()`.
  - `ParcelView` loads live parcel details and versioned boundary audit events.
  - `BoundaryView` review determination triggers call live `geometryApi.verify()` and `geometryApi.reject()` endpoints with real-time feedback banners.
  - Maintained exact visual fidelity with the Stitch designs (`#4A1F2B`, `#F7E9E1`, `#FFF8ED`, `#FFFDFC`, `#C75C3E`, `#E5A234`, Newsreader, Hanken Grotesk, JetBrains Mono).

---

## Changed & Added Files

### Backend:
- `backend/src/main/java/com/geonexus/parcel/ParcelRepository.java` (extended with `JpaSpecificationExecutor<Parcel>`)
- `backend/src/main/java/com/geonexus/parcel/ParcelSpecifications.java` (dynamic filtering/search)
- `backend/src/main/java/com/geonexus/parcel/ParcelService.java` (parcel business logic, audit logging)
- `backend/src/main/java/com/geonexus/parcel/ParcelController.java` (REST controller `/api/v1/parcels`)
- `backend/src/main/java/com/geonexus/parcel/dto/` (`CreateParcelRequest`, `UpdateParcelRequest`, `ParcelSummaryResponse`, `ParcelDetailResponse`, `ParcelProperties`, `ParcelFilterParams`)
- `backend/src/main/java/com/geonexus/geometry/ParcelGeometryService.java` (geometry lifecycle, four-eyes, stale-base)
- `backend/src/main/java/com/geonexus/geometry/GeometryController.java` (REST controller `/api/v1/parcels/{id}/geometries`)
- `backend/src/main/java/com/geonexus/geometry/FourEyesViolationException.java`
- `backend/src/main/java/com/geonexus/geometry/StaleBaseGeometryException.java`
- `backend/src/main/java/com/geonexus/geometry/dto/` (`ProposeGeometryRequest`, `ReviewDecisionRequest`, `RejectGeometryRequest`, `GeometryResponse`)
- `backend/src/main/java/com/geonexus/geometry/geojson/` (`GeoJsonGeometry`, `GeoJsonFeature`, `GeoJsonFeatureCollection`, `GeoJsonConverter`)
- `backend/src/main/java/com/geonexus/common/dto/PagedResponse.java`
- `backend/src/main/java/com/geonexus/common/error/ResourceNotFoundException.java`
- `backend/src/main/java/com/geonexus/common/error/ConflictException.java`
- `backend/src/main/java/com/geonexus/common/error/GlobalExceptionHandler.java` (added `InvalidGeometryException` handler)
- `backend/src/main/java/com/geonexus/security/dto/UserSummary.java` (added `from(User)` factory)
- `backend/src/test/java/com/geonexus/geometry/GeoJsonConverterTest.java` (RFC 7946 conversion & validation tests)
- `backend/src/test/java/com/geonexus/parcel/ParcelServiceTest.java` (service pagination, create, update, conflict tests)
- `backend/src/test/java/com/geonexus/geometry/ParcelGeometryServiceTest.java` (four-eyes, stale-base, propose, verify, reject tests)
- `backend/src/test/java/com/geonexus/parcel/ParcelControllerTest.java` (MockMvc RBAC & endpoint tests)
- `backend/src/test/java/com/geonexus/geometry/GeometryControllerTest.java` (MockMvc geometry endpoint & four-eyes tests)

### Frontend:
- `frontend/src/api/client.ts` (centralized API client)
- `frontend/src/api/client.test.ts` (API client unit tests)
- `frontend/src/App.tsx` (Stitch UI connected to API client with modal & live review actions)
- `frontend/src/App.test.tsx` (updated component & navigation tests)

---

## Verification & Test Results

### 1. Frontend Checks:
Executed inside `GeoNexus/frontend`:
- `npm run lint`: **PASSED** (0 errors, 0 warnings).
- `npm run typecheck`: **PASSED** (`tsc -b --noEmit` clean, 0 type errors).
- `npm test`: **PASSED** (13 passing tests across `client.test.ts` and `App.test.tsx`, including dynamic SVG rendering, empty state, and error handling).
- `npm run build`: **PASSED** (Production client build succeeded, 0 errors).

### 2. Backend Checks:
Configured Surefire in `pom.xml` with `-javaagent:${settings.localRepository}/org/mockito/mockito-core/5.17.0/mockito-core-5.17.0.jar` to prevent JVM self-attachment blocks. Executed offline via Maven:
- **Total tests executed**: **61 tests run, 0 failures, 0 errors** (Total execution time: ~7.5s).
  - `GeoJsonConverterTest`: 4/4 passed (0.075s)
  - `GeometryControllerTest`: 5/5 passed (1.653s)
  - `GeometryPolicyTest`: 14/14 passed (0.025s)
  - `ParcelGeometryServiceTest`: 5/5 passed (0.229s)
  - `ParcelControllerTest`: 6/6 passed (0.188s)
  - `ParcelServiceTest`: 7/7 passed (0.059s, includes owner update authorization & admin bypass tests)
  - `HealthControllerTest`: 6/6 passed (1.956s)
  - `WebConfigTest`: 3/3 passed (0.038s)
  - `CorsConfigurationSourceFactoryTest`: 3/3 passed (0.827s)
  - `JwtServiceTest`: 6/6 passed (0.091s)
  - `LoginAttemptServiceTest`: 2/2 passed (0.003s)
- **Unverified / Integration**: `PersistenceIntegrationTest` and `AuthApiIntegrationTest` require a running Docker daemon / PostgreSQL database.

---

## Next Phase

**Phase 5: Interactive Leaflet GIS Mapping & Geospatial Analysis**
- Install and configure Leaflet / React-Leaflet with OpenStreetMap tiles.
- Replace SVG vector preview with an interactive map canvas rendering real GeoJSON from `/api/v1/parcels/geojson`.
- Implement spatial operations (overlap detection, area calculation checks, and boundary displacement caliper measurements).
