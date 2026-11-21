package com.geonexus.geometry.geojson;

import com.geonexus.geometry.GeometryPolicy;
import com.geonexus.geometry.InvalidGeometryException;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/**
 * Converts bidirectionally between JTS {@link MultiPolygon} and RFC 7946 {@link GeoJsonGeometry}.
 * Always enforces EPSG:4326 via {@link GeometryPolicy#requireStorable(org.locationtech.jts.geom.Geometry)}.
 * Coordinates are rounded to 7 decimal places (~1 cm precision at equator).
 */
public final class GeoJsonConverter {

    private static final int COORDINATE_DECIMALS = 7;
    private static final GeometryFactory FACTORY =
            new GeometryFactory(new PrecisionModel(), GeometryPolicy.STORAGE_SRID);

    private GeoJsonConverter() {
    }

    /**
     * Converts a JTS MultiPolygon to a GeoJSON MultiPolygon representation with 7 decimal places.
     */
    public static GeoJsonGeometry toGeoJson(MultiPolygon mp) {
        if (mp == null || mp.isEmpty()) {
            return null;
        }

        int numPolys = mp.getNumGeometries();
        double[][][][] multiCoords = new double[numPolys][][][];

        for (int p = 0; p < numPolys; p++) {
            Polygon poly = (Polygon) mp.getGeometryN(p);
            int numInteriorRings = poly.getNumInteriorRing();
            double[][][] polyCoords = new double[1 + numInteriorRings][][];

            // Exterior shell
            polyCoords[0] = extractRingCoordinates(poly.getExteriorRing().getCoordinates());

            // Interior holes
            for (int h = 0; h < numInteriorRings; h++) {
                polyCoords[1 + h] = extractRingCoordinates(poly.getInteriorRingN(h).getCoordinates());
            }

            multiCoords[p] = polyCoords;
        }

        return GeoJsonGeometry.multiPolygon(multiCoords);
    }

    private static double[][] extractRingCoordinates(Coordinate[] coordinates) {
        double[][] ring = new double[coordinates.length][2];
        for (int i = 0; i < coordinates.length; i++) {
            ring[i][0] = round(coordinates[i].getX());
            ring[i][1] = round(coordinates[i].getY());
        }
        return ring;
    }

    private static double round(double val) {
        return BigDecimal.valueOf(val).setScale(COORDINATE_DECIMALS, RoundingMode.HALF_UP).doubleValue();
    }

    /**
     * Converts a GeoJSON Geometry (Polygon or MultiPolygon) into a validated JTS {@link MultiPolygon}
     * with SRID 4326.
     *
     * @throws InvalidGeometryException if the geometry breaks CRS, range, or topological validity.
     */
    @SuppressWarnings("unchecked")
    public static MultiPolygon toJts(GeoJsonGeometry geoJson) {
        if (geoJson == null) {
            throw new InvalidGeometryException("geometry is required");
        }
        if (geoJson.type() == null) {
            throw new InvalidGeometryException("geometry type is required");
        }
        if (geoJson.coordinates() == null) {
            throw new InvalidGeometryException("geometry coordinates are required");
        }

        String type = geoJson.type().trim();
        Object rawCoords = geoJson.coordinates();

        try {
            if ("MultiPolygon".equalsIgnoreCase(type)) {
                return parseMultiPolygon(rawCoords);
            } else if ("Polygon".equalsIgnoreCase(type)) {
                Polygon poly = parsePolygon(rawCoords);
                MultiPolygon mp = FACTORY.createMultiPolygon(new Polygon[]{poly});
                mp.setSRID(GeometryPolicy.STORAGE_SRID);
                return GeometryPolicy.requireStorable(mp);
            } else {
                throw new InvalidGeometryException("only Polygon and MultiPolygon are accepted, got " + type);
            }
        } catch (InvalidGeometryException ige) {
            throw ige;
        } catch (ClassCastException | IndexOutOfBoundsException ex) {
            throw new InvalidGeometryException("malformed GeoJSON coordinates structure: " + ex.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private static MultiPolygon parseMultiPolygon(Object raw) {
        if (raw instanceof double[][][][] arr) {
            Polygon[] polys = new Polygon[arr.length];
            for (int p = 0; p < arr.length; p++) {
                polys[p] = createPolygonFromCoords(arr[p]);
            }
            MultiPolygon mp = FACTORY.createMultiPolygon(polys);
            mp.setSRID(GeometryPolicy.STORAGE_SRID);
            return GeometryPolicy.requireStorable(mp);
        }

        if (raw instanceof List<?> polyList) {
            List<Polygon> polys = new ArrayList<>(polyList.size());
            for (Object pObj : polyList) {
                if (!(pObj instanceof List<?> ringList)) {
                    throw new InvalidGeometryException("malformed MultiPolygon polygon element");
                }
                polys.add(createPolygonFromList(ringList));
            }
            MultiPolygon mp = FACTORY.createMultiPolygon(polys.toArray(new Polygon[0]));
            mp.setSRID(GeometryPolicy.STORAGE_SRID);
            return GeometryPolicy.requireStorable(mp);
        }

        throw new InvalidGeometryException("unsupported coordinate format for MultiPolygon");
    }

    @SuppressWarnings("unchecked")
    private static Polygon parsePolygon(Object raw) {
        if (raw instanceof double[][][] arr) {
            return createPolygonFromCoords(arr);
        }
        if (raw instanceof List<?> ringList) {
            return createPolygonFromList(ringList);
        }
        throw new InvalidGeometryException("unsupported coordinate format for Polygon");
    }

    private static Polygon createPolygonFromCoords(double[][][] rings) {
        if (rings.length == 0) {
            throw new InvalidGeometryException("polygon has no linear rings");
        }
        LinearRing shell = createRing(rings[0]);
        LinearRing[] holes = new LinearRing[rings.length - 1];
        for (int h = 1; h < rings.length; h++) {
            holes[h - 1] = createRing(rings[h]);
        }
        return FACTORY.createPolygon(shell, holes);
    }

    private static LinearRing createRing(double[][] coords) {
        Coordinate[] jtsCoords = new Coordinate[coords.length];
        for (int i = 0; i < coords.length; i++) {
            if (coords[i].length < 2) {
                throw new InvalidGeometryException("coordinate pair must contain [x, y]");
            }
            jtsCoords[i] = new Coordinate(coords[i][0], coords[i][1]);
        }
        return FACTORY.createLinearRing(jtsCoords);
    }

    private static Polygon createPolygonFromList(List<?> ringList) {
        if (ringList.isEmpty()) {
            throw new InvalidGeometryException("polygon has no linear rings");
        }
        LinearRing shell = createRingFromList((List<?>) ringList.get(0));
        LinearRing[] holes = new LinearRing[ringList.size() - 1];
        for (int h = 1; h < ringList.size(); h++) {
            holes[h - 1] = createRingFromList((List<?>) ringList.get(h));
        }
        return FACTORY.createPolygon(shell, holes);
    }

    private static LinearRing createRingFromList(List<?> coordList) {
        Coordinate[] jtsCoords = new Coordinate[coordList.size()];
        for (int i = 0; i < coordList.size(); i++) {
            Object pt = coordList.get(i);
            if (!(pt instanceof List<?> ptList) || ptList.size() < 2) {
                throw new InvalidGeometryException("each coordinate must be [lon, lat]");
            }
            double x = ((Number) ptList.get(0)).doubleValue();
            double y = ((Number) ptList.get(1)).doubleValue();
            jtsCoords[i] = new Coordinate(x, y);
        }
        return FACTORY.createLinearRing(jtsCoords);
    }
}
