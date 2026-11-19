package com.geonexus.geometry;

/**
 * Lifecycle of a boundary version.
 * <pre>
 * PROPOSED -> VERIFIED -> SUPERSEDED
 *     \-----> REJECTED
 * </pre>
 * Exactly one VERIFIED version per parcel is "current". The state machine is enforced by the database.
 */
public enum GeometryStatus {
    PROPOSED,
    VERIFIED,
    REJECTED,
    SUPERSEDED
}
