package com.geonexus.geometry;

/**
 * Where a boundary came from. Every source starts PROPOSED; {@link #AI_DETECTED} and {@link #IMPORT}
 * boundaries are unverified until an authorised human reviewer (not the submitter) decides.
 */
public enum GeometrySource {
    SURVEY,
    MANUAL_ENTRY,
    IMPORT,
    AI_DETECTED
}
