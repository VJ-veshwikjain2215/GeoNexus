package com.geonexus.report.dto;

import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Full Cadastral Parcel Dossier Report model.
 */
public record ParcelDossierReport(
        UUID parcelId,
        String parcelCode,
        String name,
        String village,
        String taluk,
        String district,
        String state,
        String landUse,
        String status,
        String ownerName,
        String externalReference,
        String notes,
        Integer currentVersionNo,
        Double areaSqM,
        Double areaHa,
        Double perimeterM,
        Integer verticesCount,
        List<StationCoordinateRecord> stations,
        List<GeometryVersionSummary> history,
        String surveyReference,
        String surveyorName,
        String reviewerName,
        Instant reviewedAt,
        String certificationSeal,
        String verificationHash,
        String crs,
        String precisionTolerance,
        String disclaimer,
        Instant generatedAt
) implements Serializable {}
