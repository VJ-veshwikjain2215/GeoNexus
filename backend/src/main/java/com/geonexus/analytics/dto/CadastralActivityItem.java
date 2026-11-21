package com.geonexus.analytics.dto;

import java.io.Serializable;

/**
 * Traceable cadastral audit event item formatted for the operational ledger feed.
 */
public record CadastralActivityItem(
        String id,
        String type, // OK, PT, REJ, IMP, AI
        String title,
        String timestamp,
        String description,
        String actor,
        String parcelCode,
        String varianceText,
        String hash,
        boolean isDemonstration
) implements Serializable {}
