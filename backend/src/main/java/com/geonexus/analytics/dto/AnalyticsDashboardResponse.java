package com.geonexus.analytics.dto;

import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * Full Analytics Dashboard payload consolidating operational KPIs, spatial distributions,
 * administrative progress, boundary variance, recent activity, and insights.
 */
public record AnalyticsDashboardResponse(
        CadastralSummaryStats summary,
        List<AreaDistributionBin> areaDistribution,
        List<AdministrativeBreakdown> administrativeBreakdown,
        BoundaryVarianceMetrics boundaryVariance,
        List<ActionableCadastralInsight> actionableInsights,
        List<CadastralActivityItem> recentActivity,
        List<SeasonalTrendPoint> seasonalTrends,
        String crs,
        String precisionTolerance,
        String disclaimer,
        Instant generatedAt
) implements Serializable {}
