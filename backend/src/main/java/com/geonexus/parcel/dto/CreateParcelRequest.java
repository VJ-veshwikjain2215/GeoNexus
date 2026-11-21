package com.geonexus.parcel.dto;

import com.geonexus.geometry.dto.ProposeGeometryRequest;
import com.geonexus.parcel.LandUse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Payload to register a new parcel.
 */
public record CreateParcelRequest(
        @NotBlank(message = "parcelCode is required")
        @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$", message = "parcelCode format is invalid")
        String parcelCode,

        @Size(max = 160)
        String name,

        @Size(max = 120)
        String village,

        @NotBlank(message = "district is required")
        @Size(max = 120)
        String district,

        @NotBlank(message = "state is required")
        @Size(max = 120)
        String state,

        LandUse landUse,

        UUID ownerUserId,

        @Size(max = 120)
        String externalReference,

        String notes,

        @Valid
        ProposeGeometryRequest initialGeometry
) {
}
