package com.geonexus.analytics.dto;

import java.io.Serializable;

/**
 * Monthly or seasonal completion velocity time point.
 */
public record SeasonalTrendPoint(
        String period,
        int targetCount,
        int completedCount,
        int inProgressCount,
        int disputedCount,
        double velocityHectaresPerDay
) implements Serializable {}
