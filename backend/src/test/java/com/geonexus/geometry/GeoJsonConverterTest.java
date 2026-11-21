package com.geonexus.geometry;

import com.geonexus.geometry.geojson.GeoJsonConverter;
import com.geonexus.geometry.geojson.GeoJsonGeometry;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GeoJsonConverterTest {

    private static final GeometryFactory FACTORY =
            new GeometryFactory(new PrecisionModel(), GeometryPolicy.STORAGE_SRID);

    @Test
    @DisplayName("Converts valid Polygon to MultiPolygon with 7 decimal coordinate rounding")
    void convertsValidPolygonToMultiPolygon() {
        // Counter-clockwise simple box in lon/lat
        double[][][] polyCoords = new double[][][]{
                {
                        {78.123456789, 14.123456789},
                        {78.223456789, 14.123456789},
                        {78.223456789, 14.223456789},
                        {78.123456789, 14.223456789},
                        {78.123456789, 14.123456789}
                }
        };
        GeoJsonGeometry input = GeoJsonGeometry.polygon(polyCoords);

        MultiPolygon mp = GeoJsonConverter.toJts(input);

        assertThat(mp).isNotNull();
        assertThat(mp.getSRID()).isEqualTo(4326);
        assertThat(mp.getNumGeometries()).isEqualTo(1);
        assertThat(mp.isValid()).isTrue();

        GeoJsonGeometry output = GeoJsonConverter.toGeoJson(mp);
        assertThat(output.type()).isEqualTo("MultiPolygon");
        double[][][][] outCoords = (double[][][][]) output.coordinates();
        assertThat(outCoords[0][0][0][0]).isEqualTo(78.1234568); // rounded to 7 decimals
        assertThat(outCoords[0][0][0][1]).isEqualTo(14.1234568);
    }

    @Test
    @DisplayName("Rejects self-intersecting bow-tie polygon")
    void rejectsSelfIntersectingPolygon() {
        double[][][] bowTie = new double[][][]{
                {
                        {0.0, 0.0},
                        {1.0, 1.0},
                        {0.0, 1.0},
                        {1.0, 0.0},
                        {0.0, 0.0}
                }
        };
        GeoJsonGeometry input = GeoJsonGeometry.polygon(bowTie);

        assertThatThrownBy(() -> GeoJsonConverter.toJts(input))
                .isInstanceOf(InvalidGeometryException.class)
                .hasMessageContaining("invalid geometry topology");
    }

    @Test
    @DisplayName("Rejects out of range coordinates")
    void rejectsOutOfRangeCoordinates() {
        double[][][] outOfRange = new double[][][]{
                {
                        {185.0, 14.0}, // longitude > 180
                        {186.0, 14.0},
                        {186.0, 15.0},
                        {185.0, 15.0},
                        {185.0, 14.0}
                }
        };
        GeoJsonGeometry input = GeoJsonGeometry.polygon(outOfRange);

        assertThatThrownBy(() -> GeoJsonConverter.toJts(input))
                .isInstanceOf(InvalidGeometryException.class)
                .hasMessageContaining("longitude out of range");
    }

    @Test
    @DisplayName("Converts JTS MultiPolygon to GeoJsonGeometry")
    void convertsJtsMultiPolygonToGeoJson() {
        Coordinate[] shellCoords = new Coordinate[]{
                new Coordinate(78.0, 14.0),
                new Coordinate(79.0, 14.0),
                new Coordinate(79.0, 15.0),
                new Coordinate(78.0, 15.0),
                new Coordinate(78.0, 14.0)
        };
        LinearRing shell = FACTORY.createLinearRing(shellCoords);
        Polygon poly = FACTORY.createPolygon(shell);
        MultiPolygon mp = FACTORY.createMultiPolygon(new Polygon[]{poly});
        mp.setSRID(4326);

        GeoJsonGeometry geoJson = GeoJsonConverter.toGeoJson(mp);
        assertThat(geoJson).isNotNull();
        assertThat(geoJson.type()).isEqualTo("MultiPolygon");
        double[][][][] coords = (double[][][][]) geoJson.coordinates();
        assertThat(coords.length).isEqualTo(1);
        assertThat(coords[0].length).isEqualTo(1);
        assertThat(coords[0][0].length).isEqualTo(5);
        assertThat(coords[0][0][0].length).isEqualTo(2);
    }
}
