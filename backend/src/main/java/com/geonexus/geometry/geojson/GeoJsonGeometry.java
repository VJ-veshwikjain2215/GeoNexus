package com.geonexus.geometry.geojson;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * RFC 7946 GeoJSON Geometry object (EPSG:4326).
 * Supported types in GeoNexus are Polygon and MultiPolygon.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeoJsonGeometry(
        @JsonProperty("type") String type,
        @JsonProperty("coordinates") Object coordinates
) {

    public static GeoJsonGeometry multiPolygon(double[][][][] coords) {
        return new GeoJsonGeometry("MultiPolygon", coords);
    }

    public static GeoJsonGeometry polygon(double[][][] coords) {
        return new GeoJsonGeometry("Polygon", coords);
    }
}
