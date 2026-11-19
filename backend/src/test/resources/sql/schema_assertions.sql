-- Standalone behavioural assertions for V1..V6. Run AFTER the migrations, against a scratch database:
--   psql -v ON_ERROR_STOP=1 -d <db> -f schema_assertions.sql
-- Everything runs in one transaction that is rolled back, so the database is left untouched.
-- A failed assertion raises an exception and aborts the script with a non-zero exit code.
BEGIN;

CREATE FUNCTION pg_temp.expect_error(stmt text, fragment text) RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION WHEN OTHERS THEN
        IF position(lower(fragment) IN lower(SQLERRM)) = 0 THEN
            RAISE EXCEPTION 'expected error containing "%" but got "%" for: %', fragment, SQLERRM, stmt;
        END IF;
        RETURN;
    END;
    RAISE EXCEPTION 'expected failure ("%") but statement succeeded: %', fragment, stmt;
END;
$$;

CREATE FUNCTION pg_temp.assert_eq(label text, actual text, expected text) RETURNS void LANGUAGE plpgsql AS
$$
BEGIN
    IF actual IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'ASSERT % failed: expected [%] got [%]', label, expected, actual;
    END IF;
    RAISE NOTICE 'ok - %', label;
END;
$$;

-- Fixtures (fake hashes only; this is not a credential).
INSERT INTO users (id, username, email, display_name, password_hash) VALUES
 ('00000000-0000-0000-0000-000000000001', 'surveyor1', 's1@example.test', 'Surveyor One', repeat('x', 60)),
 ('00000000-0000-0000-0000-000000000002', 'reviewer1', 'r1@example.test', 'Reviewer One', repeat('x', 60));
INSERT INTO user_roles (user_id, role_id) VALUES
 ('00000000-0000-0000-0000-000000000001', 2), ('00000000-0000-0000-0000-000000000002', 3);
INSERT INTO parcels (id, parcel_code, district, state, owner_user_id, created_by) VALUES
 ('10000000-0000-0000-0000-000000000001', 'TEST-001', 'Synthetic District', 'Synthetic State',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

-- ~100 m x 100 m square near 85.3E 23.35N (synthetic location).
CREATE FUNCTION pg_temp.sq(dx double precision) RETURNS geometry LANGUAGE sql AS
$$ SELECT ST_Multi(ST_MakeEnvelope(85.3 + dx, 23.35, 85.3011 + dx, 23.3509, 4326)) $$;

-- 1. roles & users --------------------------------------------------------------------------
SELECT pg_temp.assert_eq('four roles seeded', (SELECT count(*)::text FROM roles), '4');
SELECT pg_temp.expect_error($$INSERT INTO users (username, email, display_name, password_hash)
    VALUES ('SURVEYOR1', 'other@example.test', 'dup', repeat('x', 60))$$, 'uq_users_username_lower');
SELECT pg_temp.expect_error($$INSERT INTO users (username, email, display_name, password_hash)
    VALUES ('weak', 'w@example.test', 'weak', 'plain')$$, 'ck_users_password_hash_not_blank');

-- 2. surveys ---------------------------------------------------------------------------------
INSERT INTO surveys (id, parcel_id, survey_type, surveyor_id, created_by) VALUES
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'INITIAL',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error($$INSERT INTO surveys (parcel_id, survey_type, surveyor_id, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', 'RESURVEY', '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000001')$$, 'ck_surveys_resurvey_has_previous');
SELECT pg_temp.expect_error($$UPDATE surveys SET status = 'APPROVED' WHERE id = '20000000-0000-0000-0000-000000000001'$$,
    'ck_surveys_decision_has_reviewer');
SELECT pg_temp.expect_error($$UPDATE surveys SET reviewer_id = surveyor_id WHERE id = '20000000-0000-0000-0000-000000000001'$$,
    'ck_surveys_four_eyes');
INSERT INTO surveys (id, parcel_id, survey_type, previous_survey_id, surveyor_id, created_by) VALUES
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'RESURVEY',
  '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');

-- 3. geometry versions ------------------------------------------------------------------------
INSERT INTO parcel_geometries (id, parcel_id, source, survey_id, geom, created_by) VALUES
 ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'SURVEY',
  '20000000-0000-0000-0000-000000000001', pg_temp.sq(0), '00000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq('version_no auto-assigned to 1',
    (SELECT version_no::text FROM parcel_geometries WHERE id = '30000000-0000-0000-0000-000000000001'), '1');
SELECT pg_temp.assert_eq('area computed on geography (~10,000 sq m, not degrees)',
    (SELECT (area_sq_m BETWEEN 9000 AND 12000)::text FROM parcel_geometries WHERE id = '30000000-0000-0000-0000-000000000001'),
    'true');

-- invalid / out-of-policy geometry is rejected by the database as a last line of defence
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, source, geom, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', 'MANUAL_ENTRY',
            ST_Multi(ST_GeomFromText('POLYGON((0 0,2 0,2 2,0 2,0 0),(1 1,3 1,3 3,1 3,1 1))', 4326)),
            '00000000-0000-0000-0000-000000000001')$$, 'ck_geometry_valid');                -- hole crosses shell
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, source, geom, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', 'MANUAL_ENTRY',
            ST_Multi(ST_GeomFromText('POLYGON((0 0, 1 0, 1 1, 0 0))', 3857)),
            '00000000-0000-0000-0000-000000000001')$$, 'srid');                                -- wrong SRID
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, source, geom, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', 'MANUAL_ENTRY',
            ST_Multi(ST_MakeEnvelope(179, 10, 181, 11, 4326)),
            '00000000-0000-0000-0000-000000000001')$$, 'ck_geometry_lonlat_range');            -- lon > 180
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, source, geom, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', 'MANUAL_ENTRY',
            ST_GeomFromText('POINT(85.3 23.35)', 4326), '00000000-0000-0000-0000-000000000001')$$, 'geometry');
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, source, geom, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', 'SURVEY', pg_temp.sq(0.01),
            '00000000-0000-0000-0000-000000000001')$$, 'ck_geometry_survey_source_has_survey');
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, source, geom, created_by, status)
    VALUES ('10000000-0000-0000-0000-000000000001', 'MANUAL_ENTRY', pg_temp.sq(0.01),
            '00000000-0000-0000-0000-000000000001', 'VERIFIED')$$, 'must start as PROPOSED');
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, version_no, source, geom, created_by)
    VALUES ('10000000-0000-0000-0000-000000000001', 7, 'MANUAL_ENTRY', pg_temp.sq(0.01),
            '00000000-0000-0000-0000-000000000001')$$, 'must be 2');
SELECT pg_temp.expect_error($$INSERT INTO parcel_geometries (parcel_id, source, geom, created_by, confidence)
    VALUES ('10000000-0000-0000-0000-000000000001', 'MANUAL_ENTRY', pg_temp.sq(0.01),
            '00000000-0000-0000-0000-000000000001', 0.9)$$, 'ck_geometry_confidence_ai_only');

-- audit floor: proposal was recorded by the DB
SELECT pg_temp.assert_eq('proposal audited',
    (SELECT count(*)::text FROM audit_records WHERE action = 'GEOMETRY_PROPOSED' AND origin = 'DB'), '1');

-- 4. review workflow -------------------------------------------------------------------------
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET status = 'VERIFIED', reviewed_by = created_by, reviewed_at = now()
    WHERE id = '30000000-0000-0000-0000-000000000001'$$, 'ck_geometry_reviewer_not_submitter');   -- self-approval
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET status = 'VERIFIED'
    WHERE id = '30000000-0000-0000-0000-000000000001'$$, 'ck_geometry_decision_has_reviewer');
UPDATE parcel_geometries SET status = 'VERIFIED', reviewed_by = '00000000-0000-0000-0000-000000000002', reviewed_at = now()
 WHERE id = '30000000-0000-0000-0000-000000000001';

-- 5. RESURVEY: new version, old boundary preserved ---------------------------------------------
INSERT INTO parcel_geometries (id, parcel_id, source, survey_id, based_on_geometry_id, geom, created_by) VALUES
 ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'SURVEY',
  '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', pg_temp.sq(0.0002),
  '00000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_eq('resurvey is version 2',
    (SELECT version_no::text FROM parcel_geometries WHERE id = '30000000-0000-0000-0000-000000000002'), '2');
SELECT pg_temp.assert_eq('v1 still the single verified boundary until v2 is reviewed',
    (SELECT id::text FROM current_parcel_geometries WHERE parcel_id = '10000000-0000-0000-0000-000000000001'),
    '30000000-0000-0000-0000-000000000001');

-- a verified boundary can never be edited or deleted, nor can an unreviewed one
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET geom = pg_temp.sq(0.5)
    WHERE id = '30000000-0000-0000-0000-000000000001'$$, 'immutable');
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET geom = pg_temp.sq(0.5)
    WHERE id = '30000000-0000-0000-0000-000000000002'$$, 'immutable');
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET version_no = 9
    WHERE id = '30000000-0000-0000-0000-000000000002'$$, 'immutable');
SELECT pg_temp.expect_error($$DELETE FROM parcel_geometries WHERE id = '30000000-0000-0000-0000-000000000001'$$, 'cannot be deleted');
SELECT pg_temp.expect_error($$TRUNCATE parcel_geometries CASCADE$$, 'cannot be deleted');
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET status = 'PROPOSED'
    WHERE id = '30000000-0000-0000-0000-000000000001'$$, 'illegal geometry status transition');

UPDATE parcel_geometries SET status = 'VERIFIED', reviewed_by = '00000000-0000-0000-0000-000000000002', reviewed_at = now()
 WHERE id = '30000000-0000-0000-0000-000000000002';

SELECT pg_temp.assert_eq('v2 now current',
    (SELECT id::text FROM current_parcel_geometries WHERE parcel_id = '10000000-0000-0000-0000-000000000001'),
    '30000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq('v1 retained and SUPERSEDED, pointing at v2',
    (SELECT status || ':' || superseded_by_id FROM parcel_geometries WHERE id = '30000000-0000-0000-0000-000000000001'),
    'SUPERSEDED:30000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_eq('v1 boundary bytes unchanged',
    (SELECT ST_Equals(geom, pg_temp.sq(0))::text FROM parcel_geometries WHERE id = '30000000-0000-0000-0000-000000000001'),
    'true');
SELECT pg_temp.assert_eq('two versions in history',
    (SELECT count(*)::text FROM parcel_geometries WHERE parcel_id = '10000000-0000-0000-0000-000000000001'), '2');
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET status = 'REJECTED', reviewed_by = '00000000-0000-0000-0000-000000000002',
    reviewed_at = now() WHERE id = '30000000-0000-0000-0000-000000000001'$$, 'illegal geometry status transition');

-- stale base: v3 and v4 both drawn against v2; once v3 wins, v4 cannot be verified
INSERT INTO parcel_geometries (id, parcel_id, source, based_on_geometry_id, geom, created_by) VALUES
 ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'AI_DETECTED',
  '30000000-0000-0000-0000-000000000002', pg_temp.sq(0.0004), '00000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'IMPORT',
  '30000000-0000-0000-0000-000000000002', pg_temp.sq(0.0006), '00000000-0000-0000-0000-000000000001');
UPDATE parcel_geometries SET status = 'VERIFIED', reviewed_by = '00000000-0000-0000-0000-000000000002', reviewed_at = now()
 WHERE id = '30000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_error($$UPDATE parcel_geometries SET status = 'VERIFIED',
    reviewed_by = '00000000-0000-0000-0000-000000000002', reviewed_at = now()
    WHERE id = '30000000-0000-0000-0000-000000000004'$$, 'no longer current');
UPDATE parcel_geometries SET status = 'REJECTED', reviewed_by = '00000000-0000-0000-0000-000000000002', reviewed_at = now(),
       review_notes = 'superseded by a newer verified boundary'
 WHERE id = '30000000-0000-0000-0000-000000000004';

SELECT pg_temp.assert_eq('exactly one verified boundary',
    (SELECT count(*)::text FROM parcel_geometries WHERE parcel_id = '10000000-0000-0000-0000-000000000001' AND status = 'VERIFIED'), '1');

-- 6. audit trail -----------------------------------------------------------------------------
SELECT pg_temp.assert_eq('geometry events audited by the DB',
    (SELECT count(*)::text FROM audit_records WHERE entity_type = 'PARCEL_GEOMETRY' AND origin = 'DB'), '10');   -- 4 proposed, 3 verified, 2 superseded, 1 rejected
SELECT pg_temp.expect_error($$UPDATE audit_records SET action = 'TAMPERED'$$, 'append-only');
SELECT pg_temp.expect_error($$DELETE FROM audit_records$$, 'append-only');
SELECT pg_temp.expect_error($$TRUNCATE audit_records$$, 'append-only');

-- 7. spatial index is usable --------------------------------------------------------------------
SELECT pg_temp.assert_eq('GiST indexes exist',
    (SELECT count(*)::text FROM pg_indexes WHERE tablename = 'parcel_geometries' AND indexdef ILIKE '%USING gist%'), '2');

ROLLBACK;
