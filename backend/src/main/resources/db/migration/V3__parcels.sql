-- V3: parcel registry. Geometry lives in parcel_geometries (V5) so boundaries are versioned.
-- Parcels hold no personal holder data; ownership here means the application account
-- responsible for the record (access control), not legal title.
CREATE TABLE parcels
(
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_code        varchar(64)  NOT NULL,
    name               varchar(160),
    village            varchar(120),
    district           varchar(120) NOT NULL,
    state              varchar(120) NOT NULL,
    land_use           varchar(32)  NOT NULL DEFAULT 'AGRICULTURAL',
    status             varchar(16)  NOT NULL DEFAULT 'DRAFT',
    owner_user_id      uuid         NOT NULL REFERENCES users (id),
    external_reference varchar(120),
    notes              text,
    created_by         uuid         NOT NULL REFERENCES users (id),
    updated_by         uuid REFERENCES users (id),
    created_at         timestamptz  NOT NULL DEFAULT now(),
    updated_at         timestamptz  NOT NULL DEFAULT now(),
    row_version        bigint       NOT NULL DEFAULT 0, -- optimistic locking
    CONSTRAINT uq_parcels_code UNIQUE (parcel_code),
    CONSTRAINT ck_parcels_code_format CHECK (parcel_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
    CONSTRAINT ck_parcels_status CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    CONSTRAINT ck_parcels_land_use CHECK (land_use IN ('AGRICULTURAL', 'FALLOW', 'ORCHARD', 'PASTURE', 'OTHER'))
);
CREATE INDEX ix_parcels_owner ON parcels (owner_user_id);
CREATE INDEX ix_parcels_district_status ON parcels (district, status);

CREATE TRIGGER trg_parcels_updated_at
    BEFORE UPDATE
    ON parcels
    FOR EACH ROW
EXECUTE FUNCTION geonexus_touch_updated_at();
