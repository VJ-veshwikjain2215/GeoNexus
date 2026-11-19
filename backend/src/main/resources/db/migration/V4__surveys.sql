-- V4: survey / resurvey workflow records.
CREATE TABLE surveys
(
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parcel_id          uuid        NOT NULL REFERENCES parcels (id),
    survey_type        varchar(16) NOT NULL,
    status             varchar(16) NOT NULL DEFAULT 'PLANNED',
    method             varchar(24) NOT NULL DEFAULT 'GNSS',
    survey_date        date,
    -- A resurvey points at the survey it revisits; same-parcel is enforced by the composite FK below.
    previous_survey_id uuid,
    surveyor_id        uuid        NOT NULL REFERENCES users (id),
    reviewer_id        uuid REFERENCES users (id),
    submitted_at       timestamptz,
    reviewed_at        timestamptz,
    review_notes       text,
    notes              text,
    created_by         uuid        NOT NULL REFERENCES users (id),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    row_version        bigint      NOT NULL DEFAULT 0,
    CONSTRAINT uq_surveys_id_parcel UNIQUE (id, parcel_id),
    CONSTRAINT fk_surveys_previous_same_parcel FOREIGN KEY (previous_survey_id, parcel_id)
        REFERENCES surveys (id, parcel_id),
    CONSTRAINT ck_surveys_type CHECK (survey_type IN ('INITIAL', 'RESURVEY')),
    CONSTRAINT ck_surveys_status CHECK (status IN
        ('PLANNED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT ck_surveys_method CHECK (method IN ('GNSS', 'TOTAL_STATION', 'DRONE', 'IMAGERY_TRACE', 'IMPORTED_RECORD')),
    CONSTRAINT ck_surveys_initial_no_previous CHECK (survey_type <> 'INITIAL' OR previous_survey_id IS NULL),
    CONSTRAINT ck_surveys_resurvey_has_previous CHECK (survey_type <> 'RESURVEY' OR previous_survey_id IS NOT NULL),
    CONSTRAINT ck_surveys_not_self_previous CHECK (previous_survey_id IS NULL OR previous_survey_id <> id),
    CONSTRAINT ck_surveys_four_eyes CHECK (reviewer_id IS NULL OR reviewer_id <> surveyor_id),
    CONSTRAINT ck_surveys_submitted_has_timestamp CHECK
        (status NOT IN ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED') OR submitted_at IS NOT NULL),
    CONSTRAINT ck_surveys_decision_has_reviewer CHECK
        (status NOT IN ('APPROVED', 'REJECTED') OR (reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX ix_surveys_parcel ON surveys (parcel_id, created_at DESC);
CREATE INDEX ix_surveys_surveyor ON surveys (surveyor_id);
CREATE INDEX ix_surveys_reviewer ON surveys (reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX ix_surveys_open_status ON surveys (status) WHERE status IN ('SUBMITTED', 'UNDER_REVIEW');

CREATE TRIGGER trg_surveys_updated_at
    BEFORE UPDATE
    ON surveys
    FOR EACH ROW
EXECUTE FUNCTION geonexus_touch_updated_at();
