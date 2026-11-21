package com.geonexus.parcel.dto;

import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.parcel.LandUse;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelStatus;
import com.geonexus.security.dto.UserSummary;

import java.time.Instant;
import java.util.UUID;

/**
 * Detailed parcel dossier including current verified geometry and audit metadata.
 */
public record ParcelDetailResponse(
        UUID id,
        String parcelCode,
        String name,
        String village,
        String district,
        String state,
        LandUse landUse,
        ParcelStatus status,
        String externalReference,
        String notes,
        UserSummary owner,
        UserSummary createdBy,
        UserSummary updatedBy,
        GeometryResponse currentGeometry,
        int pendingProposalsCount,
        Instant createdAt,
        Instant updatedAt,
        long rowVersion
) {
    public static ParcelDetailResponse of(Parcel p, GeometryResponse currentGeometry, int pendingProposalsCount) {
        return new ParcelDetailResponse(
                p.getId(),
                p.getParcelCode(),
                p.getName(),
                p.getVillage(),
                p.getDistrict(),
                p.getState(),
                p.getLandUse(),
                p.getStatus(),
                p.getExternalReference(),
                p.getNotes(),
                UserSummary.from(p.getOwner()),
                UserSummary.from(p.getCreatedBy()),
                UserSummary.from(p.getUpdatedBy()),
                currentGeometry,
                pendingProposalsCount,
                p.getCreatedAt(),
                p.getUpdatedAt(),
                p.getRowVersion()
        );
    }
}
