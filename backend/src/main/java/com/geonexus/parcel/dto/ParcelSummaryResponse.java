package com.geonexus.parcel.dto;

import com.geonexus.parcel.LandUse;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * Lightweight parcel item in paginated lists and search results.
 */
public record ParcelSummaryResponse(
        UUID id,
        String parcelCode,
        String name,
        String village,
        String district,
        String state,
        LandUse landUse,
        ParcelStatus status,
        String externalReference,
        Double currentAreaSqM,
        Integer currentVersionNo,
        Instant createdAt,
        Instant updatedAt
) {
    public static ParcelSummaryResponse from(Parcel p, Double currentAreaSqM, Integer currentVersionNo) {
        return new ParcelSummaryResponse(
                p.getId(),
                p.getParcelCode(),
                p.getName(),
                p.getVillage(),
                p.getDistrict(),
                p.getState(),
                p.getLandUse(),
                p.getStatus(),
                p.getExternalReference(),
                currentAreaSqM,
                currentVersionNo,
                p.getCreatedAt(),
                p.getUpdatedAt()
        );
    }
}
