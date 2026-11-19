package com.geonexus.security;

/**
 * Central role matrix for method security. Later phases annotate service/controller methods with
 * {@code @PreAuthorize(SecurityExpressions.X)} instead of hand-writing role strings.
 *
 * <pre>
 * ADMIN : everything
 * SURVEYOR      : read + create/update survey and parcel data
 * REVIEWER      : read + review/approve or reject submitted geometry
 * VIEWER        : read only
 * </pre>
 */
public final class SecurityExpressions {

    /** Any authenticated user holding at least one application role. */
    public static final String ANY_ROLE =
            "hasAnyRole('ADMIN','SURVEYOR','REVIEWER','VIEWER')";

    /** Create or modify survey/parcel data. */
    public static final String SURVEY_WRITE = "hasAnyRole('ADMIN','SURVEYOR')";

    /** Review (approve/reject) unverified geometry. */
    public static final String REVIEW = "hasAnyRole('ADMIN','REVIEWER')";

    /** Administrative operations such as user management. */
    public static final String ADMIN_ONLY = "hasRole('ADMIN')";

    private SecurityExpressions() {
    }
}
