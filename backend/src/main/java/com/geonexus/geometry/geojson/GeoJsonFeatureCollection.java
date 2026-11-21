package com.geonexus.geometry.geojson;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/**
 * RFC 7946 GeoJSON FeatureCollection object.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeoJsonFeatureCollection<P>(
        @JsonProperty("type") String type,
        @JsonProperty("features") List<GeoJsonFeature<P>> features
) {
    public GeoJsonFeatureCollection(List<GeoJsonFeature<P>> features) {
        this("FeatureCollection", features != null ? features : List.of());
    }
}
