package com.geonexus.analytics.dto;

import java.io.Serializable;

/**
 * Standard agricultural cadastral landholding size bucket.
 */
public record AreaDistributionBin(
        String rangeLabel,
        String category,
        double minAreaHa,
        double maxAreaHa,
        long parcelCount,
        double totalAreaHa,
        double percentage
) implements Serializable {}
