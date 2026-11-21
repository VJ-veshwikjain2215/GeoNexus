package com.geonexus.parcel.dto;

import com.geonexus.parcel.ParcelStatus;
import java.util.UUID;

/**
 * Filtering and search parameters for parcel query endpoints.
 */
public record ParcelFilterParams(
        ParcelStatus status,
        String district,
        String state,
        UUID ownerId,
        String search
) {
}
