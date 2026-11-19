package com.geonexus.geometry;

import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.locationtech.jts.io.ParseException;
import org.locationtech.jts.io.WKTReader;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Pure unit tests (no database): the application-level geometry gate. */
class GeometryPolicyTest {

    private static final GeometryFactory GF = new GeometryFactory(new PrecisionModel(), 4326);

    private static Polygon square(double x, double y, double size) {
        return GF.createPolygon(new Coordinate[]{
                new Coordinate(x, y), new Coordinate(x + size, y), new Coordinate(x + size, y + size),
                new Coordinate(x, y + size), new Coordinate(x, y)});
    }

    private static Geometry wkt(String text, int srid) throws ParseException {
        Geometry g = new WKTReader(new GeometryFactory(new PrecisionModel(), srid)).read(text);
        g.setSRID(srid);
        return g;
    }

    @Test
    void policyConstantsAreWgs84() {
        assertThat(GeometryPolicy.STORAGE_SRID).isEqualTo(4326);
        assertThat(GeometryPolicy.STORAGE_CRS).isEqualTo("EPSG:4326");
    }

    @Test
    void polygonIsNormalisedToMultiPolygonWithSrid() {
        MultiPolygon result = GeometryPolicy.requireStorable(square(85.3, 23.35, 0.001));

        assertThat(result.getNumGeometries()).isEqualTo(1);
        assertThat(result.getSRID()).isEqualTo(4326);
    }

    @Test
    void multiPolygonIsAccepted() {
        MultiPolygon mp = GF.createMultiPolygon(new Polygon[]{square(85.3, 23.35, 0.001), square(85.4, 23.35, 0.001)});

        assertThat(GeometryPolicy.requireStorable(mp).getNumGeometries()).isEqualTo(2);
    }

    @Test
    void nullIsRejected() {
        assertThatThrownBy(() -> GeometryPolicy.requireStorable(null))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("required");
    }

    @Test
    void unsetSridIsRejectedRatherThanAssumed() {
        Polygon noSrid = new GeometryFactory().createPolygon(new Coordinate[]{
                new Coordinate(0, 0), new Coordinate(1, 0), new Coordinate(1, 1), new Coordinate(0, 0)});

        assertThatThrownBy(() -> GeometryPolicy.requireStorable(noSrid))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("SRID");
    }

    @Test
    void otherSridIsRejected() throws Exception {
        Geometry webMercator = wkt("POLYGON((0 0, 100 0, 100 100, 0 100, 0 0))", 3857);

        assertThatThrownBy(() -> GeometryPolicy.requireStorable(webMercator))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("3857");
    }

    @Test
    void nonPolygonalTypesAreRejected() throws Exception {
        assertThatThrownBy(() -> GeometryPolicy.requireStorable(wkt("POINT(85.3 23.35)", 4326)))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("Polygon");
        assertThatThrownBy(() -> GeometryPolicy.requireStorable(wkt("LINESTRING(85.3 23.35, 85.4 23.4)", 4326)))
                .isInstanceOf(InvalidGeometryException.class);
    }

    @Test
    void emptyPolygonIsRejected() {
        assertThatThrownBy(() -> GeometryPolicy.requireStorable(GF.createPolygon()))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("empty");
    }

    @Test
    void outOfRangeLongitudeAndLatitudeAreRejected() {
        assertThatThrownBy(() -> GeometryPolicy.requireStorable(square(179.5, 10, 1.0)))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("longitude");
        assertThatThrownBy(() -> GeometryPolicy.requireStorable(square(10, 89.5, 1.0)))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("latitude");
    }

    @Test
    void swappedLatLonIsCaughtWhenLatitudeIsOutOfRange() {
        // India is ~85E, ~23N. Submitting [lat, lon] puts 85 in the x slot (fine) but a lon of 100+ in y would fail.
        assertThatThrownBy(() -> GeometryPolicy.requireStorable(square(23.0, 120.0, 0.001)))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("latitude");
    }

    @Test
    void selfIntersectingBowTieIsRejected() throws Exception {
        Geometry bowTie = wkt("POLYGON((0 0, 2 2, 2 0, 0 2, 0 0))", 4326);

        assertThatThrownBy(() -> GeometryPolicy.requireStorable(bowTie))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("topology");
    }

    @Test
    void holeOutsideShellIsRejected() throws Exception {
        Geometry bad = wkt("POLYGON((0 0, 2 0, 2 2, 0 2, 0 0), (3 3, 4 3, 4 4, 3 4, 3 3))", 4326);

        assertThatThrownBy(() -> GeometryPolicy.requireStorable(bad)).isInstanceOf(InvalidGeometryException.class);
    }

    @Test
    void threeDimensionalCoordinatesAreRejected() {
        Polygon withZ = GF.createPolygon(new Coordinate[]{
                new Coordinate(0, 0, 5), new Coordinate(1, 0, 5), new Coordinate(1, 1, 5), new Coordinate(0, 0, 5)});

        assertThatThrownBy(() -> GeometryPolicy.requireStorable(withZ))
                .isInstanceOf(InvalidGeometryException.class).hasMessageContaining("two-dimensional");
    }

    @Test
    void nonFiniteCoordinatesAreRejected() {
        Polygon nan = GF.createPolygon(new Coordinate[]{
                new Coordinate(0, 0), new Coordinate(Double.NaN, 0), new Coordinate(1, 1), new Coordinate(0, 0)});

        assertThatThrownBy(() -> GeometryPolicy.requireStorable(nan)).isInstanceOf(InvalidGeometryException.class);
    }
}
