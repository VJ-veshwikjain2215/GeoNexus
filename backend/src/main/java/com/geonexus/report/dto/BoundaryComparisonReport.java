package com.geonexus.report.dto;

import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Official Adjudication & Boundary Comparison Report model.
 */
public record BoundaryComparisonReport(
        UUID parcelId,
        String parcelCode,
        String locality,
        String district,
        int baselineVersionNo,
        int proposedVersionNo,
        double baselineAreaHa,
        double proposedAreaHa,
        double areaDeltaHa,
        double areaDeltaPercent,
        String varianceClassification,
        boolean withinTolerance,
        double maxDisplacementM,
        double averageDisplacementM,
        List<StationDisplacementRecord> displacements,
        String surveyorNotes,
        String adjudicationDirective,
        String status,
        String reviewedBy,
        Instant reviewedAt,
        String crs,
        String precisionTolerance,
        String disclaimer,
        Instant generatedAt
) implements Serializable {}
