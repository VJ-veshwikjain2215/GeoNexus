package com.geonexus.geometry.dto;

import com.geonexus.geometry.GeometrySource;
import com.geonexus.geometry.GeometryStatus;
import com.geonexus.geometry.ParcelGeometry;
import com.geonexus.geometry.geojson.GeoJsonConverter;
import com.geonexus.geometry.geojson.GeoJsonGeometry;
import com.geonexus.security.dto.UserSummary;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Boundary version DTO with RFC 7946 GeoJSON geometry representation.
 */
public record GeometryResponse(
        UUID id,
        UUID parcelId,
        int versionNo,
        Double areaSqM,
        GeometrySource source,
        UUID surveyId,
        UUID basedOnGeometryId,
        String sourceDescription,
        String sourceReference,
        BigDecimal confidence,
        UserSummary createdBy,
        Instant createdAt,
        GeometryStatus status,
        UserSummary reviewedBy,
        Instant reviewedAt,
        String reviewNotes,
        UUID supersededById,
        Instant supersededAt,
        GeoJsonGeometry geometry
) {
    public static GeometryResponse from(ParcelGeometry pg) {
        if (pg == null) {
            return null;
        }
        return new GeometryResponse(
                pg.getId(),
                pg.getParcel() != null ? pg.getParcel().getId() : null,
                pg.getVersionNo(),
                pg.getAreaSqM(),
                pg.getSource(),
                pg.getSurvey() != null ? pg.getSurvey().getId() : null,
                pg.getBasedOn() != null ? pg.getBasedOn().getId() : null,
                pg.getSourceDescription(),
                pg.getSourceReference(),
                pg.getConfidence(),
                UserSummary.from(pg.getCreatedBy()),
                pg.getCreatedAt(),
                pg.getStatus(),
                UserSummary.from(pg.getReviewedBy()),
                pg.getReviewedAt(),
                pg.getReviewNotes(),
                pg.getSupersededBy() != null ? pg.getSupersededBy().getId() : null,
                pg.getSupersededAt(),
                GeoJsonConverter.toGeoJson(pg.getGeom())
        );
    }
}
