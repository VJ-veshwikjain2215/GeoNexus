package com.geonexus.parcel.dto;

import com.geonexus.parcel.LandUse;
import com.geonexus.parcel.ParcelStatus;
import jakarta.validation.constraints.Size;

/**
 * Payload to update mutable parcel registry attributes.
 */
public record UpdateParcelRequest(
        @Size(max = 160)
        String name,

        @Size(max = 120)
        String village,

        @Size(max = 120)
        String district,

        @Size(max = 120)
        String state,

        LandUse landUse,

        ParcelStatus status,

        @Size(max = 120)
        String externalReference,

        String notes
) {
}
