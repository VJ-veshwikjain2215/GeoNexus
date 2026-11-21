package com.geonexus.report.dto;

import java.io.Serializable;
import java.time.Instant;

/**
 * Historical boundary geometry revision summary.
 */
public record GeometryVersionSummary(
        int versionNo,
        String source,
        String status,
        double areaHa,
        Double areaDeltaHa,
        Double areaDeltaPercent,
        String surveyorUsername,
        String reviewerUsername,
        Instant createdAt,
        Instant reviewedAt,
        String notes
) implements Serializable {}
