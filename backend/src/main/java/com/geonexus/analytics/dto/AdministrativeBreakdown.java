package com.geonexus.analytics.dto;

import java.io.Serializable;

/**
 * Cadastral progress aggregated across agro-subdistricts and administrative taluks.
 */
public record AdministrativeBreakdown(
        String subdistrict,
        String taluk,
        String district,
        int totalTargetParcels,
        int completedAndSealed,
        int underActiveSurvey,
        double completionPercentage,
        String groundStatus,
        String leadSurveyor,
        boolean isSyntheticTarget
) implements Serializable {}
