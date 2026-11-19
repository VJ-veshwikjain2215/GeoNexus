# GeoNexus data model (Phase 2)

**Status:** implemented as Flyway migrations `V1`–`V6` plus JPA entities under `com.geonexus`.
The SQL is validated on PostgreSQL 16 + PostGIS 3.4 (see [Verification](#7-verification)); the Docker Compose service and
the Testcontainers tests use `postgis/postgis:16-3.5`.
GeoNexus is an academic application; nothing stored here is a certified cadastral record or legal boundary.

## 1. CRS / SRID policy

| Aspect | Rule |
|---|---|
| Stored CRS | **EPSG:4326** (WGS 84 geographic, degrees). The only SRID accepted or stored. |
| Axis order | Always **x = longitude, y = latitude** (PostGIS, JTS and GeoJSON all agree). |
| Column type | `geometry(MultiPolygon, 4326)`. Polygons are normalised to MultiPolygon on write. XY only (no Z/M). |
| Exchange format | GeoJSON per RFC 7946 is WGS 84 by definition, so stored geometry is served unchanged. APIs must neither accept nor emit a `crs` member and must reject any SRID other than 4326. No reprojection happens anywhere. |
| Area / length | **Never planar maths on lon/lat.** Area is `ST_Area(geom::geography)` (spheroidal, square metres) in the generated column `parcel_geometries.area_sq_m`. Any future distance/length must use `geography` the same way. |
| Validity | `ST_IsValid` on lon/lat (OGC topology: closed rings, no self-intersection, holes inside the shell) – planar *topology* tests are correct on lon/lat; planar *measurement* is not. |
| Range | lon ∈ [-180, 180], lat ∈ [-90, 90]; geometries may not span the antimeridian or poles (unsupported; split into a MultiPolygon). |
| Where enforced | 1) `GeometryPolicy.requireStorable()` in Java (type, explicit SRID, finite 2-D coordinates, range, `IsValidOp`). 2) Database `CHECK` constraints + typmod as the last line of defence. |
| Global/UI settings | None. The SRID is a property of the stored column, not an application-wide or UI setting. Leaflet's display projection is a rendering concern and never touches storage. |

Why not a projected CRS? A single projected CRS cannot serve a multi-state dataset without distortion, and a
projected zone would be a second source of truth beside GeoJSON. Spheroidal `geography` gives metre-level area with
one CRS. If survey-grade results are ever required, add them in a *new* migration with an explicit, documented
EPSG code – do not change the policy above.

Input handling rules for later API phases: parse GeoJSON → set SRID 4326 explicitly → `GeometryPolicy.requireStorable`.
An unset SRID is rejected rather than assumed. Suggested coordinate rounding at the API boundary: 7 decimals (~1 cm).

## 2. Entity overview

```
roles ─< user_roles >─ users ──< parcels (owner_user_id, created_by, updated_by)
                          │          │
                          │          ├──< surveys (surveyor_id, reviewer_id, previous_survey_id → surveys)
                          │          │        │
                          │          └──< parcel_geometries (survey_id, based_on, superseded_by, created_by, reviewed_by)
                          └──< audit_records (actor_user_id, parcel_id)
```

| Table | Purpose | Key constraints |
|---|---|---|
| `roles` | Seeded catalogue: ADMIN, SURVEYOR, REVIEWER, VIEWER | name unique, `^[A-Z][A-Z_]*$` |
| `users` | Accounts (hash only) | case-insensitive unique username/email; hash length ≥ 20; `enabled`, lockout fields |
| `user_roles` | User ↔ role | PK (user_id, role_id); `granted_by` |
| `parcels` | Parcel registry, **no geometry** | unique `parcel_code`; status DRAFT/ACTIVE/ARCHIVED; `owner_user_id` NOT NULL; `row_version` (optimistic lock) |
| `surveys` | Survey/resurvey workflow | type INITIAL/RESURVEY; resurvey **must** reference `previous_survey_id` (same parcel, composite FK); surveyor ≠ reviewer; APPROVED/REJECTED need reviewer + timestamp |
| `parcel_geometries` | Append-only boundary versions | see §3 |
| `audit_records` | Append-only audit trail | see §5 |

Ownership: `parcels.owner_user_id` is the account responsible for the record (used for server-side authorization,
e.g. `ParcelRepository.findByIdAndOwnerId`). It is **not** legal title; no landholder personal data is modelled.

Timestamps: `created_at`/`updated_at` are `timestamptz` (UTC). JPA callbacks set them; a trigger keeps `updated_at`
correct for non-JPA writes. Reviewer fields: `surveys.reviewer_id/reviewed_at/review_notes`,
`parcel_geometries.reviewed_by/reviewed_at/review_notes`. Provenance fields: `source`, `survey_id`,
`based_on_geometry_id`, `source_description`, `source_reference`, `confidence`, `created_by`, `created_at`.

## 3. Geometry history (the core rule)

> A resurvey creates a **new** `parcel_geometries` row. A prior boundary is never overwritten or deleted.

Enforced in the database (not just in Java):

* **Immutable content.** A `BEFORE UPDATE` trigger rejects any change to `geom`, `parcel_id`, `version_no`,
  `source`, `survey_id`, `based_on_geometry_id`, provenance text, `confidence`, `created_by`, `created_at`.
* **No delete / truncate.** Triggers reject both. Parcels/surveys/users referenced by history cannot be deleted either (plain FKs).
* **Contiguous versions.** `(parcel_id, version_no)` is unique; an insert trigger locks the parcel row and requires
  `version_no = max + 1` (or assigns it when NULL).
* **Always starts PROPOSED.** Inserting directly as VERIFIED is rejected. AI-detected and imported boundaries therefore
  start unverified like everything else.
* **State machine** (anything else is rejected):

  ```
  PROPOSED ──> VERIFIED ──> SUPERSEDED
      └──────> REJECTED
  ```
* **One current boundary.** Partial unique index `uq_parcel_geometries_one_verified` (one `VERIFIED` row per parcel).
  The view `current_parcel_geometries` exposes it.
* **Supersession.** Verifying a version automatically marks the previously verified one `SUPERSEDED`
  (`superseded_by_id`, `superseded_at`) and keeps it forever.
* **Stale-base protection.** A version can only be verified if `based_on_geometry_id` equals the currently verified
  version (or is NULL when none exists). Two proposals drawn against v1 cannot both win; the second must be re-proposed.
* **Human review, four-eyes.** `VERIFIED`/`REJECTED` require `reviewed_by` + `reviewed_at`, and `reviewed_by <> created_by`.
  Users are the only reviewers – there is no AI principal.
* **Spatial constraints.** `ST_IsValid`, not empty, SRID 4326, lon/lat range, area > 0, MultiPolygon typmod.
  `source = 'SURVEY'` requires a `survey_id` of the same parcel.
* **Spatial indexes.** GiST on `geom`, plus a partial GiST on `geom WHERE status = 'VERIFIED'` for map queries.

Not enforced (deliberately): overlap between parcels. Legitimate disputes and resurveys produce overlaps, so
`ParcelGeometryRepository.findCurrentOverlapping` reports them for human review instead.

Typical resurvey flow (the service layer arrives in a later phase):

1. `ParcelRepository.findByIdForUpdate(parcelId)` (row lock).
2. `nextVersionNo` → `ParcelGeometry.propose(..., basedOn = current verified, survey = resurvey)` → save.
3. A different user with the REVIEWER role calls `verify(...)` or `reject(...)`; old version flips to SUPERSEDED automatically.
4. Entities loaded before step 3 are stale; reload them.

## 4. Source and status vocabularies

* `source`: `SURVEY`, `MANUAL_ENTRY`, `IMPORT`, `AI_DETECTED` (`confidence` 0..1 only for AI_DETECTED).
* `surveys.status`: PLANNED, IN_PROGRESS, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, CANCELLED.
* `surveys.method`: GNSS, TOTAL_STATION, DRONE, IMAGERY_TRACE, IMPORTED_RECORD.

Adding a value means a new migration that replaces the corresponding `CHECK`, plus the Java enum.
(`audit_records.action` is only format-checked, so new actions need no migration.)

## 5. Audit trail

* `audit_records` is append-only: triggers reject UPDATE, DELETE and TRUNCATE; `AuditRecordRepository` extends
  `Repository` (not `JpaRepository`) and exposes `save` + finders only; the entity is `@Immutable`.
* **Database floor for geometry:** triggers write `GEOMETRY_PROPOSED / VERIFIED / REJECTED / SUPERSEDED` rows with
  `origin = 'DB'` for every geometry change, so the trail exists even if a caller forgets. The application must *not*
  duplicate these.
* **Application events** (`origin = 'APP'`): login success/failure, access denied, user/role changes, parcel and survey
  changes. These are the responsibility of the later auth/service phases. Never store secrets, tokens, password material or
  full coordinates in `details`.
* Actor ids reference `users`; `actor_username` is a snapshot. `client_ip` is text (IPv4/IPv6).
* Limitation: a database superuser/owner can still disable triggers. Restrict the application role (see "Database roles" in `docs/architecture.md`).

## 6. Security-relevant notes

* No credentials, demo users or real land data are in the migrations. `password_hash` holds only a BCrypt/Argon2 hash created by the auth layer.
* Authorization is **not** implemented here; repositories expose id+owner and id+parcel scoped lookups so services can enforce it.
* Use synthetic data only.

## 7. Verification

Run with PostgreSQL 16 + PostGIS 3.4 (psql only):

* `backend/scripts/validate-sql.sh` applies V1–V6 to a scratch database and runs `src/test/resources/sql/schema_assertions.sql`
  (13 positive assertions + 27 must-fail checks: invalid/bow-tie/hole geometry, wrong SRID, out-of-range lon, non-polygon,
  self-approval, stale base, overwrite/delete/truncate attempts, audit tamper attempts, GiST index presence).
* Java tests (`MigrationAssertionsTest`, `PersistenceIntegrationTest`, `GeometryPolicyTest`) require Maven + Docker or a
  scratch PostGIS server (`GEONEXUS_TEST_DB_*`, see `docs/setup.md`).

## 8. Change process

Applied migrations are immutable (Flyway checksums). Every schema change is a new `V7+` migration. Keep this document
and `GeometryPolicy` in step with any change to the SRID policy.
