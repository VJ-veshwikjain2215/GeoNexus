package com.geonexus.report.dto;

import java.io.Serializable;

/**
 * Boundary station vertex projected into geographic (WGS84) and cartographic (UTM Zone 44N) frames.
 */
public record StationCoordinateRecord(
        String station,
        double longitude,
        double latitude,
        double eastingUtm44,
        double northingUtm44,
        double elevationM,
        String status
) implements Serializable {}
