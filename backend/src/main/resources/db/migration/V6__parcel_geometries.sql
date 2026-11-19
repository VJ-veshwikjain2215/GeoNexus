-- V6: versioned parcel boundaries.
-- SRID POLICY: every geometry is stored as EPSG:4326 (WGS 84, lon/lat, GeoJSON-native). Area is
-- derived with the geography type (spheroidal), never planar lon/lat arithmetic. See data-model.md.
--
-- HISTORY POLICY: rows are append-only. A resurvey inserts a NEW version; it never rewrites an old
-- boundary. Only lifecycle columns (status + review/supersede fields) may change, along a fixed
-- state machine, and rows can never be deleted.
CREATE TABLE parcel_geometries
(
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_id            uuid                          NOT NULL REFERENCES parcels (id),
    version_no           integer                       NOT NULL,
    geom                 geometry(MultiPolygon, 4326)  NOT NULL,
    area_sq_m            double precision GENERATED ALWAYS AS (ST_Area(geom::geography)) STORED,

    -- provenance
    source               varchar(16)                   NOT NULL,
    survey_id            uuid,
    based_on_geometry_id uuid,
    source_description   varchar(255),
    source_reference     varchar(255),
    confidence           numeric(4, 3),
    created_by           uuid                          NOT NULL REFERENCES users (id),
    created_at           timestamptz                   NOT NULL DEFAULT now(),

    -- review lifecycle
    status               varchar(16)                   NOT NULL DEFAULT 'PROPOSED',
    reviewed_by          uuid REFERENCES users (id),
    reviewed_at          timestamptz,
    review_notes         text,
    superseded_by_id     uuid,
    superseded_at        timestamptz,

    CONSTRAINT uq_parcel_geometries_version UNIQUE (parcel_id, version_no),
    CONSTRAINT uq_parcel_geometries_id_parcel UNIQUE (id, parcel_id),
    CONSTRAINT fk_geometry_survey_same_parcel FOREIGN KEY (survey_id, parcel_id)
        REFERENCES surveys (id, parcel_id),
    CONSTRAINT fk_geometry_based_on_same_parcel FOREIGN KEY (based_on_geometry_id, parcel_id)
        REFERENCES parcel_geometries (id, parcel_id),
    CONSTRAINT fk_geometry_superseded_by_same_parcel FOREIGN KEY (superseded_by_id, parcel_id)
        REFERENCES parcel_geometries (id, parcel_id),

    CONSTRAINT ck_geometry_version_positive CHECK (version_no >= 1),
    CONSTRAINT ck_geometry_source CHECK (source IN ('SURVEY', 'MANUAL_ENTRY', 'IMPORT', 'AI_DETECTED')),
    CONSTRAINT ck_geometry_status CHECK (status IN ('PROPOSED', 'VERIFIED', 'REJECTED', 'SUPERSEDED')),
    CONSTRAINT ck_geometry_srid CHECK (ST_SRID(geom) = 4326),
    CONSTRAINT ck_geometry_not_empty CHECK (NOT ST_IsEmpty(geom)),
    CONSTRAINT ck_geometry_valid CHECK (ST_IsValid(geom)),
    CONSTRAINT ck_geometry_lonlat_range CHECK (
        ST_XMin(geom) >= -180 AND ST_XMax(geom) <= 180 AND ST_YMin(geom) >= -90 AND ST_YMax(geom) <= 90),
    CONSTRAINT ck_geometry_positive_area CHECK (area_sq_m > 0),
    CONSTRAINT ck_geometry_survey_source_has_survey CHECK (source <> 'SURVEY' OR survey_id IS NOT NULL),
    CONSTRAINT ck_geometry_confidence_range CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    CONSTRAINT ck_geometry_confidence_ai_only CHECK (confidence IS NULL OR source = 'AI_DETECTED'),
    CONSTRAINT ck_geometry_not_based_on_self CHECK (based_on_geometry_id IS NULL OR based_on_geometry_id <> id),
    -- A human other than the submitter must record every decision (AI/import output is never self-approving).
    CONSTRAINT ck_geometry_decision_has_reviewer CHECK (
        status = 'PROPOSED' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
    CONSTRAINT ck_geometry_reviewer_not_submitter CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
    CONSTRAINT ck_geometry_proposed_has_no_review CHECK (
        status <> 'PROPOSED' OR (reviewed_by IS NULL AND reviewed_at IS NULL AND review_notes IS NULL)),
    CONSTRAINT ck_geometry_superseded_fields CHECK (
        (status = 'SUPERSEDED') = (superseded_by_id IS NOT NULL AND superseded_at IS NOT NULL)
        AND (status = 'SUPERSEDED' OR (superseded_by_id IS NULL AND superseded_at IS NULL)))
);

-- Spatial indexes.
CREATE INDEX ix_parcel_geometries_geom ON parcel_geometries USING GIST (geom);
CREATE INDEX ix_parcel_geometries_verified_geom ON parcel_geometries USING GIST (geom) WHERE status = 'VERIFIED';
-- Exactly one authoritative (verified, current) boundary per parcel.
CREATE UNIQUE INDEX uq_parcel_geometries_one_verified ON parcel_geometries (parcel_id) WHERE status = 'VERIFIED';
CREATE INDEX ix_parcel_geometries_pending ON parcel_geometries (parcel_id) WHERE status = 'PROPOSED';
CREATE INDEX ix_parcel_geometries_survey ON parcel_geometries (survey_id) WHERE survey_id IS NOT NULL;
CREATE INDEX ix_parcel_geometries_created_by ON parcel_geometries (created_by);

CREATE VIEW current_parcel_geometries AS
SELECT *
FROM parcel_geometries
WHERE status = 'VERIFIED';

------------------------------------------------------------------------------------------------
-- Insert guard: new rows are always PROPOSED and carry the next contiguous version number.
------------------------------------------------------------------------------------------------
CREATE FUNCTION geonexus_geometry_before_insert() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    expected_version integer;
    base_version     integer;
BEGIN
    -- Serialise concurrent version creation per parcel.
    PERFORM 1 FROM parcels WHERE id = NEW.parcel_id FOR UPDATE;

    SELECT coalesce(max(version_no), 0) + 1 INTO expected_version
    FROM parcel_geometries WHERE parcel_id = NEW.parcel_id;

    IF NEW.version_no IS NULL THEN
        NEW.version_no := expected_version;
    ELSIF NEW.version_no <> expected_version THEN
        RAISE EXCEPTION 'geometry version for parcel % must be % (got %)', NEW.parcel_id, expected_version, NEW.version_no
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.status <> 'PROPOSED' THEN
        RAISE EXCEPTION 'new geometry versions must start as PROPOSED (got %)', NEW.status
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.based_on_geometry_id IS NOT NULL THEN
        SELECT version_no INTO base_version FROM parcel_geometries WHERE id = NEW.based_on_geometry_id;
        IF base_version IS NULL OR base_version >= NEW.version_no THEN
            RAISE EXCEPTION 'based_on_geometry_id must reference an earlier version of the same parcel'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_geometry_a_before_insert
    BEFORE INSERT
    ON parcel_geometries
    FOR EACH ROW
EXECUTE FUNCTION geonexus_geometry_before_insert();

------------------------------------------------------------------------------------------------
-- Update guard: boundary and provenance are immutable; status follows a fixed state machine.
--   PROPOSED -> VERIFIED | REJECTED ;  VERIFIED -> SUPERSEDED ;  REJECTED / SUPERSEDED are terminal.
------------------------------------------------------------------------------------------------
CREATE FUNCTION geonexus_geometry_before_update() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    current_verified_id      uuid;
    current_verified_version integer;
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.parcel_id IS DISTINCT FROM OLD.parcel_id
        OR NEW.version_no IS DISTINCT FROM OLD.version_no
        OR ST_AsEWKB(NEW.geom) IS DISTINCT FROM ST_AsEWKB(OLD.geom)
        OR NEW.source IS DISTINCT FROM OLD.source
        OR NEW.survey_id IS DISTINCT FROM OLD.survey_id
        OR NEW.based_on_geometry_id IS DISTINCT FROM OLD.based_on_geometry_id
        OR NEW.source_description IS DISTINCT FROM OLD.source_description
        OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
        OR NEW.confidence IS DISTINCT FROM OLD.confidence
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'parcel geometry versions are immutable; create a new version instead'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.status = OLD.status THEN
        IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
            OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
            OR NEW.review_notes IS DISTINCT FROM OLD.review_notes
            OR NEW.superseded_by_id IS DISTINCT FROM OLD.superseded_by_id
            OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
            RAISE EXCEPTION 'review fields can only change together with a status transition'
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT ((OLD.status = 'PROPOSED' AND NEW.status IN ('VERIFIED', 'REJECTED'))
        OR (OLD.status = 'VERIFIED' AND NEW.status = 'SUPERSEDED')) THEN
        RAISE EXCEPTION 'illegal geometry status transition % -> %', OLD.status, NEW.status
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- Decision fields are frozen once recorded.
    IF OLD.status <> 'PROPOSED' AND (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
        OR NEW.review_notes IS DISTINCT FROM OLD.review_notes) THEN
        RAISE EXCEPTION 'recorded review decision cannot be altered'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.status = 'VERIFIED' THEN
        SELECT id, version_no INTO current_verified_id, current_verified_version
        FROM parcel_geometries WHERE parcel_id = NEW.parcel_id AND status = 'VERIFIED';

        -- Stale-base protection: a proposal can only replace the boundary it was drawn against.
        IF current_verified_id IS DISTINCT FROM NEW.based_on_geometry_id THEN
            RAISE EXCEPTION 'version % is based on a boundary that is no longer current; re-propose against the current version', NEW.version_no
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
        IF current_verified_version IS NOT NULL AND current_verified_version >= NEW.version_no THEN
            RAISE EXCEPTION 'cannot verify version % over newer verified version %', NEW.version_no, current_verified_version
                USING ERRCODE = 'integrity_constraint_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_geometry_a_before_update
    BEFORE UPDATE
    ON parcel_geometries
    FOR EACH ROW
EXECUTE FUNCTION geonexus_geometry_before_update();

-- When a version becomes VERIFIED, the previously verified version is retained and marked SUPERSEDED.
CREATE FUNCTION geonexus_geometry_supersede_previous() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    IF NEW.status = 'VERIFIED' AND OLD.status = 'PROPOSED' THEN
        UPDATE parcel_geometries
        SET status           = 'SUPERSEDED',
            superseded_by_id = NEW.id,
            superseded_at    = now()
        WHERE parcel_id = NEW.parcel_id
          AND status = 'VERIFIED'
          AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_geometry_b_supersede_previous
    BEFORE UPDATE
    ON parcel_geometries
    FOR EACH ROW
EXECUTE FUNCTION geonexus_geometry_supersede_previous();

------------------------------------------------------------------------------------------------
-- No deletes, no truncates.
------------------------------------------------------------------------------------------------
CREATE FUNCTION geonexus_geometry_no_delete() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'parcel geometry history cannot be deleted (% rejected)', TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER trg_geometry_no_delete
    BEFORE DELETE
    ON parcel_geometries
    FOR EACH ROW
EXECUTE FUNCTION geonexus_geometry_no_delete();

CREATE TRIGGER trg_geometry_no_truncate
    BEFORE TRUNCATE
    ON parcel_geometries
    FOR EACH STATEMENT
EXECUTE FUNCTION geonexus_geometry_no_delete();

------------------------------------------------------------------------------------------------
-- Database-level audit floor: every geometry-changing operation is recorded even if a caller
-- forgets to. Rows carry origin = 'DB'; the app should not duplicate these events.
------------------------------------------------------------------------------------------------
CREATE FUNCTION geonexus_geometry_audit() RETURNS trigger
    LANGUAGE plpgsql AS
$$
DECLARE
    actor_id   uuid;
    event      text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        event := 'GEOMETRY_PROPOSED';
        actor_id := NEW.created_by;
    ELSIF NEW.status = 'SUPERSEDED' THEN
        event := 'GEOMETRY_SUPERSEDED';
        actor_id := NULL;           -- system consequence of another version's verification
    ELSE
        event := 'GEOMETRY_' || NEW.status;
        actor_id := NEW.reviewed_by;
    END IF;

    INSERT INTO audit_records (actor_user_id, actor_username, action, entity_type, entity_id, parcel_id, origin, details)
    VALUES (actor_id,
            (SELECT username FROM users WHERE id = actor_id),
            event, 'PARCEL_GEOMETRY', NEW.id, NEW.parcel_id, 'DB',
            jsonb_build_object('versionNo', NEW.version_no,
                               'source', NEW.source,
                               'status', NEW.status,
                               'surveyId', NEW.survey_id,
                               'basedOnGeometryId', NEW.based_on_geometry_id,
                               'supersededById', NEW.superseded_by_id));
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_geometry_audit_insert
    AFTER INSERT
    ON parcel_geometries
    FOR EACH ROW
EXECUTE FUNCTION geonexus_geometry_audit();

CREATE TRIGGER trg_geometry_audit_status
    AFTER UPDATE
    ON parcel_geometries
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION geonexus_geometry_audit();
