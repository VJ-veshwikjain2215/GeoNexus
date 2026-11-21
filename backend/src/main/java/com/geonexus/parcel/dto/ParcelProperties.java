package com.geonexus.parcel.dto;

import com.geonexus.parcel.LandUse;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelStatus;

import java.util.UUID;

/**
 * Feature properties payload when serving parcels in GeoJSON Feature/FeatureCollection format.
 */
public record ParcelProperties(
        UUID id,
        String parcelCode,
        String name,
        String village,
        String district,
        String state,
        LandUse landUse,
        ParcelStatus status,
        Double areaSqM,
        Integer versionNo
) {
    public static ParcelProperties from(Parcel p, Double areaSqM, Integer versionNo) {
        return new ParcelProperties(
                p.getId(),
                p.getParcelCode(),
                p.getName(),
                p.getVillage(),
                p.getDistrict(),
                p.getState(),
                p.getLandUse(),
                p.getStatus(),
                areaSqM,
                versionNo
        );
    }
}
