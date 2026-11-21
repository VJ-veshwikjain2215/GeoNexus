package com.geonexus.geometry.geojson;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * RFC 7946 GeoJSON Feature object.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeoJsonFeature<P>(
        @JsonProperty("type") String type,
        @JsonProperty("id") String id,
        @JsonProperty("geometry") GeoJsonGeometry geometry,
        @JsonProperty("properties") P properties
) {
    public GeoJsonFeature(String id, GeoJsonGeometry geometry, P properties) {
        this("Feature", id, geometry, properties);
    }
}
