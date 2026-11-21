package com.geonexus.analytics.dto;

import java.io.Serializable;
import java.util.UUID;

/**
 * Actionable insight or spatial exception requiring officer adjudication.
 */
public record ActionableCadastralInsight(
        String id,
        String severity, // CRITICAL, WARNING, INFO
        String category, // VARIANCE_EXCEEDED, AI_ASSISTED_REVIEW, SEASONAL_DELAY, NETWORK_INTEGRITY
        String title,
        String description,
        String parcelCode,
        UUID parcelId,
        String recommendedAction
) implements Serializable {}
