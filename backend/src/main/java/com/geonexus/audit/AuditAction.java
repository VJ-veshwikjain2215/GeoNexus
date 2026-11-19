package com.geonexus.audit;

/**
 * Vocabulary of audited operations. The database only enforces the shape ({@code ^[A-Z][A-Z0-9_]{2,39}$}),
 * so adding a value here needs no migration.
 * <p>
 * GEOMETRY_* events are written by database triggers (origin = DB) and must not be duplicated by the application.
 */
public enum AuditAction {
    LOGIN_SUCCESS,
    LOGIN_FAILURE,
    ACCESS_DENIED,
    PASSWORD_CHANGED,
    USER_CREATED,
    USER_UPDATED,
    USER_DISABLED,
    ROLE_GRANTED,
    ROLE_REVOKED,
    PARCEL_CREATED,
    PARCEL_UPDATED,
    PARCEL_ARCHIVED,
    SURVEY_CREATED,
    SURVEY_STATUS_CHANGED,
    GEOMETRY_PROPOSED,
    GEOMETRY_VERIFIED,
    GEOMETRY_REJECTED,
    GEOMETRY_SUPERSEDED
}
