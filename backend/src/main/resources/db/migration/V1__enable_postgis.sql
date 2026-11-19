-- V1: spatial extension and shared helpers.
-- Requires a role allowed to CREATE EXTENSION (or a pre-provisioned PostGIS database,
-- e.g. the postgis/postgis image). See data-model.md.
CREATE EXTENSION IF NOT EXISTS postgis;

-- Keeps updated_at correct even for writes that bypass JPA (psql, batch jobs).
CREATE FUNCTION geonexus_touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql AS
$$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
