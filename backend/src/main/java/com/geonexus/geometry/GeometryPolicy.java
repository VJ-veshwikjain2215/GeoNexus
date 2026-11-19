package com.geonexus.geometry;

import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.locationtech.jts.operation.valid.IsValidOp;
import org.locationtech.jts.operation.valid.TopologyValidationError;

/**
 * The single place that defines the stored-geometry policy (see data-model.md):
 * <ul>
 *   <li>CRS: EPSG:4326 (WGS 84, x = longitude, y = latitude, degrees). The SRID must be set explicitly.</li>
 *   <li>Type: Polygon or MultiPolygon; always stored as MultiPolygon.</li>
 *   <li>Coordinates finite, within lon [-180, 180] / lat [-90, 90], two-dimensional.</li>
 *   <li>Topology valid (closed rings, no self-intersection, holes inside shell, ...).</li>
 * </ul>
 * This is the application-level gate. The database re-checks SRID, validity and ranges as a last line of defence.
 * Lon/lat values must never be used for planar area or distance maths; area is computed by PostGIS on geography.
 */
public final class GeometryPolicy {

    /** Storage SRID. Changing it requires a new migration and a data-model.md update. */
    public static final int STORAGE_SRID = 4326;

    public static final String STORAGE_CRS = "EPSG:4326";

    private static final GeometryFactory FACTORY = new GeometryFactory(new PrecisionModel(), STORAGE_SRID);

    private GeometryPolicy() {
    }

    /**
     * Validates {@code input} and returns a MultiPolygon carrying SRID 4326.
     *
     * @throws InvalidGeometryException if the geometry breaks the policy
     */
    public static MultiPolygon requireStorable(Geometry input) {
        if (input == null) {
            throw new InvalidGeometryException("geometry is required");
        }
        if (input.getSRID() != STORAGE_SRID) {
            throw new InvalidGeometryException(
                    "geometry SRID must be explicitly " + STORAGE_SRID + " (" + STORAGE_CRS + "), got " + input.getSRID());
        }
        if (!(input instanceof Polygon) && !(input instanceof MultiPolygon)) {
            throw new InvalidGeometryException(
                    "only Polygon and MultiPolygon are accepted, got " + input.getGeometryType());
        }
        if (input.isEmpty()) {
            throw new InvalidGeometryException("geometry must not be empty");
        }
        for (Coordinate c : input.getCoordinates()) {
            requireCoordinate(c);
        }
        TopologyValidationError error = new IsValidOp(input).getValidationError();
        if (error != null) {
            throw new InvalidGeometryException("invalid geometry topology: " + error.getMessage()
                    + " at " + error.getCoordinate());
        }

        MultiPolygon result = input instanceof MultiPolygon mp
                ? mp
                : FACTORY.createMultiPolygon(new Polygon[]{(Polygon) input});
        result.setSRID(STORAGE_SRID);
        return result;
    }

    private static void requireCoordinate(Coordinate c) {
        double x = c.getX();
        double y = c.getY();
        if (!Double.isFinite(x) || !Double.isFinite(y)) {
            throw new InvalidGeometryException("coordinates must be finite numbers");
        }
        if (x < -180.0 || x > 180.0) {
            throw new InvalidGeometryException("longitude out of range [-180, 180]: " + x
                    + " (coordinates must be [longitude, latitude])");
        }
        if (y < -90.0 || y > 90.0) {
            throw new InvalidGeometryException("latitude out of range [-90, 90]: " + y
                    + " (coordinates must be [longitude, latitude])");
        }
        if (!Double.isNaN(c.getZ())) {
            throw new InvalidGeometryException("only two-dimensional (x, y) geometries are accepted");
        }
    }
}
