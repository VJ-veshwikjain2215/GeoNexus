package com.geonexus.analytics.dto;

import java.io.Serializable;

/**
 * High-level Cadastral and GIS operational summary metrics.
 * Derived from authoritative database state with clear delineation of live vs operational targets.
 */
public record CadastralSummaryStats(
        long totalParcels,
        long activeParcels,
        long draftParcels,
        long archivedParcels,
        long verifiedParcels,
        long pendingBoundaryProposals,
        double totalSurveyedAreaHa,
        double averageParcelAreaHa,
        long inFlightResurveysCount,
        long flaggedForReviewCount,
        long validationsPassedMtd,
        int activeGeodeticPillars,
        double firstPassRatePercent,
        double meanRmseM,
        String dataSource
) implements Serializable {}
