package com.geonexus.report.dto;

import java.io.Serializable;

/**
 * Displacement vector between recorded baseline and proposed resurvey station.
 */
public record StationDisplacementRecord(
        String station,
        double lonBaseline,
        double latBaseline,
        double lonProposed,
        double latProposed,
        double shiftDistanceM,
        String status
) implements Serializable {}
