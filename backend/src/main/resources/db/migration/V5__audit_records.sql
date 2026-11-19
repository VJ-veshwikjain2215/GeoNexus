-- V5: append-only audit trail. Rows can be inserted but never updated, deleted or truncated.
CREATE TABLE audit_records
(
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    actor_user_id  uuid REFERENCES users (id),   -- NULL for anonymous events (e.g. failed login)
    actor_username varchar(64),                  -- snapshot, survives later account changes
    action         varchar(40) NOT NULL,         -- e.g. GEOMETRY_VERIFIED; vocabulary lives in AuditAction
    outcome        varchar(16) NOT NULL DEFAULT 'SUCCESS',
    entity_type    varchar(32) NOT NULL,         -- USER, PARCEL, SURVEY, PARCEL_GEOMETRY, ...
    entity_id      uuid,
    parcel_id      uuid REFERENCES parcels (id), -- denormalised for per-parcel history queries
    origin         varchar(8)  NOT NULL DEFAULT 'APP',
    request_id     varchar(64),
    client_ip      varchar(45),                 -- textual IPv4/IPv6 (kept as text for portable JPA mapping)
    details        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT ck_audit_action_format CHECK (action ~ '^[A-Z][A-Z0-9_]{2,39}$'),
    CONSTRAINT ck_audit_entity_type_format CHECK (entity_type ~ '^[A-Z][A-Z0-9_]{1,31}$'),
    CONSTRAINT ck_audit_outcome CHECK (outcome IN ('SUCCESS', 'DENIED', 'FAILURE')),
    CONSTRAINT ck_audit_origin CHECK (origin IN ('APP', 'DB')),
    CONSTRAINT ck_audit_details_object CHECK (jsonb_typeof(details) = 'object')
);
CREATE INDEX ix_audit_entity ON audit_records (entity_type, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_parcel ON audit_records (parcel_id, occurred_at DESC) WHERE parcel_id IS NOT NULL;
CREATE INDEX ix_audit_actor ON audit_records (actor_user_id, occurred_at DESC) WHERE actor_user_id IS NOT NULL;
CREATE INDEX ix_audit_action_time ON audit_records (action, occurred_at DESC);

CREATE FUNCTION geonexus_audit_append_only() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    RAISE EXCEPTION 'audit_records is append-only (% rejected)', TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE TRIGGER trg_audit_no_update_delete
    BEFORE UPDATE OR DELETE
    ON audit_records
    FOR EACH ROW
EXECUTE FUNCTION geonexus_audit_append_only();

CREATE TRIGGER trg_audit_no_truncate
    BEFORE TRUNCATE
    ON audit_records
    FOR EACH STATEMENT
EXECUTE FUNCTION geonexus_audit_append_only();
