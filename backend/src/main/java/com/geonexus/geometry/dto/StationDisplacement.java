package com.geonexus.geometry.dto;

/**
 * Represents a single boundary station's coordinate displacement between
 * recorded baseline geometry and proposed resurvey geometry.
 */
public record StationDisplacement(
        String station,
        double lonExisting,
        double latExisting,
        double lonProposed,
        double latProposed,
        double shiftDistanceM
) {}
