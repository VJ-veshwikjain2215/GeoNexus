package com.geonexus.analytics.dto;

import java.io.Serializable;

/**
 * Quantitative metrics on boundary shifts and area changes between survey revisions.
 */
public record BoundaryVarianceMetrics(
        long totalProposalsEvaluated,
        long positiveDeltaCount,
        long negativeDeltaCount,
        long zeroDeltaCount,
        double averageDeltaHa,
        double averageDeltaPercent,
        double maxDeltaHa,
        long aiAssistedCount,
        long groundSurveyCount,
        long flaggedVarianceCount
) implements Serializable {}
