package com.geonexus.ai.dto;

import com.geonexus.geometry.geojson.GeoJsonGeometry;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Result of an AI-assisted agricultural parcel boundary edge detection run.
 * Contains candidate geometry, station coordinates, area deltas, edge confidence metrics,
 * and mandatory academic research disclaimers.
 */
public record AiBoundaryDetectionResponse(
        UUID parcelId,
        String parcelCode,
        String detectionId,
        String algorithm,
        String imagerySource,
        BigDecimal confidence,
        Double qualityScore,
        Double edgeSharpness,
        Instant detectedAt,
        Double detectedAreaSqM,
        Double detectedAreaHa,
        Double recordedAreaSqM,
        Double recordedAreaHa,
        Double areaDeltaSqM,
        Double areaDeltaPercentage,
        GeoJsonGeometry detectedGeometry,
        List<DetectedStation> detectedStations,
        String academicDisclaimer,
        String status
) {
    public static final String MANDATORY_DISCLAIMER =
            "ACADEMIC EXPERIMENTAL AID: AI-assisted boundary detection is an unverified assistive tool for agricultural " +
            "field edge estimation and does NOT constitute a certified legal cadastre or legally binding boundary.";
}
