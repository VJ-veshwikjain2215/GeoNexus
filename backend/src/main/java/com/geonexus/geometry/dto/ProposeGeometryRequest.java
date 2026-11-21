package com.geonexus.geometry.dto;

import com.geonexus.geometry.GeometrySource;
import com.geonexus.geometry.geojson.GeoJsonGeometry;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Payload to propose a new boundary version for a parcel.
 */
public record ProposeGeometryRequest(
        @NotNull(message = "geometry is required")
        GeoJsonGeometry geometry,

        @NotNull(message = "source is required")
        GeometrySource source,

        UUID surveyId,

        UUID basedOnGeometryId,

        @Size(max = 255)
        String sourceDescription,

        @Size(max = 255)
        String sourceReference,

        @DecimalMin("0.0")
        @DecimalMax("1.0")
        BigDecimal confidence
) {
}
