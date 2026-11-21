package com.geonexus.geometry;

import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.dto.OverlapDetail;
import com.geonexus.geometry.dto.SpatialAnalysisResponse;
import com.geonexus.geometry.dto.StationDisplacement;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.operation.valid.IsValidOp;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Geospatial Analysis Service.
 * Implements high-precision spatial operations: spheroidal perimeter and area computation,
 * polygon closure checks, multi-parcel overlap detection, and boundary displacement caliper measurements.
 */
@Service
@Transactional(readOnly = true)
public class SpatialAnalysisService {

    private static final Logger log = LoggerFactory.getLogger(SpatialAnalysisService.class);

    private final ParcelRepository parcelRepository;
    private final ParcelGeometryRepository parcelGeometryRepository;

    public SpatialAnalysisService(ParcelRepository parcelRepository,
                                  ParcelGeometryRepository parcelGeometryRepository) {
        this.parcelRepository = parcelRepository;
        this.parcelGeometryRepository = parcelGeometryRepository;
    }

    public SpatialAnalysisResponse analyze(UUID parcelId) {
        Parcel parcel = parcelRepository.findById(parcelId)
                .orElseThrow(() -> new ResourceNotFoundException("Parcel not found: " + parcelId));

        Optional<ParcelGeometry> currentOpt = parcelGeometryRepository.findCurrent(parcelId);
        List<ParcelGeometry> pendingList = parcelGeometryRepository.findPending(parcelId);
        Optional<ParcelGeometry> proposedOpt = pendingList.isEmpty()
                ? Optional.empty()
                : Optional.of(pendingList.get(pendingList.size() - 1));

        Double recordedAreaSqM = currentOpt.map(ParcelGeometry::getAreaSqM).orElse(null);
        Double recordedAreaHa = recordedAreaSqM != null ? Math.round((recordedAreaSqM / 10000.0) * 1000.0) / 1000.0 : null;

        Double proposedAreaSqM = proposedOpt.map(ParcelGeometry::getAreaSqM).orElse(null);
        Double proposedAreaHa = proposedAreaSqM != null ? Math.round((proposedAreaSqM / 10000.0) * 1000.0) / 1000.0 : null;

        Double areaDeltaSqM = null;
        Double areaDeltaPercentage = null;
        if (recordedAreaSqM != null && proposedAreaSqM != null) {
            areaDeltaSqM = Math.round((proposedAreaSqM - recordedAreaSqM) * 100.0) / 100.0;
            areaDeltaPercentage = recordedAreaSqM > 0
                    ? Math.round(((proposedAreaSqM - recordedAreaSqM) / recordedAreaSqM * 100.0) * 100.0) / 100.0
                    : 0.0;
        }

        MultiPolygon activeGeom = proposedOpt.map(ParcelGeometry::getGeom)
                .orElseGet(() -> currentOpt.map(ParcelGeometry::getGeom).orElse(null));

        double perimeterM = 0.0;
        int stationCount = 0;
        boolean isValid = activeGeom != null;
        Double closureDeltaM = null;
        int selfIntersectionViolations = 0;

        if (activeGeom != null) {
            Coordinate[] coords = activeGeom.getCoordinates();
            stationCount = coords.length > 1 ? coords.length - 1 : coords.length;
            perimeterM = calculatePerimeterMeters(coords);

            IsValidOp validOp = new IsValidOp(activeGeom);
            isValid = validOp.isValid();
            if (!isValid) {
                selfIntersectionViolations = 1;
            }

            if (coords.length >= 2) {
                closureDeltaM = haversineDistanceM(coords[0].getY(), coords[0].getX(),
                        coords[coords.length - 1].getY(), coords[coords.length - 1].getX());
                closureDeltaM = Math.round(closureDeltaM * 1000.0) / 1000.0;
            }
        }

        // Overlap detection: candidate geometry is proposedOpt if available, else currentOpt (GEO-02)
        Optional<ParcelGeometry> targetGeomOpt = proposedOpt.isPresent() ? proposedOpt : currentOpt;
        List<OverlapDetail> overlaps = new ArrayList<>();
        if (targetGeomOpt.isPresent()) {
            try {
                String wkt = targetGeomOpt.get().getGeom().toText();
                List<ParcelGeometry> overlappingGeoms = parcelGeometryRepository.findCurrentOverlapping(wkt, parcelId);
                for (ParcelGeometry og : overlappingGeoms) {
                    Parcel op = og.getParcel();
                    double approxOverlapArea = 0.0;
                    try {
                        Geometry intersection = targetGeomOpt.get().getGeom().intersection(og.getGeom());
                        if (!intersection.isEmpty()) {
                            // Spheroidal area calculation on WGS 84 authalic sphere (GEO-01)
                            approxOverlapArea = calculateSpheroidalAreaSqM(intersection);
                        }
                    } catch (Exception ignored) {
                        // Geometry intersection fallback
                    }
                    overlaps.add(new OverlapDetail(
                            op.getId(),
                            op.getParcelCode(),
                            op.getVillage() != null ? op.getVillage() + ", " + op.getDistrict() : op.getDistrict(),
                            approxOverlapArea
                    ));
                }
            } catch (Exception e) {
                // Structured warning logging for resilience (SEC-01)
                log.warn("Spatial overlap query failed for parcel {}: {}", parcelId, e.getMessage());
            }
        }

        // Station displacement caliper measurements with nearest-neighbor matching (GEO-03)
        List<StationDisplacement> displacements = new ArrayList<>();
        Double maxDisplacementM = null;
        Double averageDisplacementM = null;

        if (currentOpt.isPresent() && proposedOpt.isPresent()) {
            Coordinate[] recCoords = currentOpt.get().getGeom().getCoordinates();
            Coordinate[] propCoords = proposedOpt.get().getGeom().getCoordinates();

            int propN = propCoords.length > 1 && propCoords[0].equals2D(propCoords[propCoords.length - 1])
                    ? propCoords.length - 1
                    : propCoords.length;
            int recN = recCoords.length > 1 && recCoords[0].equals2D(recCoords[recCoords.length - 1])
                    ? recCoords.length - 1
                    : recCoords.length;

            double maxD = 0.0;
            double sumD = 0.0;

            for (int i = 0; i < propN; i++) {
                Coordinate pCoord = propCoords[i];
                // Match with nearest vertex in baseline geometry (GEO-03)
                Coordinate bestMatch = recCoords[0];
                double bestDist = Double.MAX_VALUE;
                for (int j = 0; j < recN; j++) {
                    double d = haversineDistanceM(recCoords[j].getY(), recCoords[j].getX(), pCoord.getY(), pCoord.getX());
                    if (d < bestDist) {
                        bestDist = d;
                        bestMatch = recCoords[j];
                    }
                }
                double dist = Math.round(bestDist * 100.0) / 100.0;
                if (dist > maxD) maxD = dist;
                sumD += dist;

                displacements.add(new StationDisplacement(
                        String.format("ST-%02d", i + 1),
                        Math.round(bestMatch.getX() * 1000000.0) / 1000000.0,
                        Math.round(bestMatch.getY() * 1000000.0) / 1000000.0,
                        Math.round(pCoord.getX() * 1000000.0) / 1000000.0,
                        Math.round(pCoord.getY() * 1000000.0) / 1000000.0,
                        dist
                ));
            }

            maxDisplacementM = Math.round(maxD * 100.0) / 100.0;
            averageDisplacementM = propN > 0 ? Math.round((sumD / propN) * 100.0) / 100.0 : 0.0;
        }

        int collisionOverlaps = (int) overlaps.stream().filter(o -> o.overlapAreaSqM() > 0.0).count();

        return new SpatialAnalysisResponse(
                parcel.getId(),
                parcel.getParcelCode(),
                recordedAreaSqM,
                recordedAreaHa,
                proposedAreaSqM,
                proposedAreaHa,
                areaDeltaSqM,
                areaDeltaPercentage,
                perimeterM,
                stationCount,
                isValid,
                closureDeltaM != null ? closureDeltaM : 0.0,
                selfIntersectionViolations,
                collisionOverlaps,
                overlaps,
                overlaps.size(),
                maxDisplacementM,
                averageDisplacementM,
                displacements
        );
    }

    /**
     * Calculates spheroidal area in square meters on WGS 84 authalic sphere (GEO-01).
     * Enforces the project standard: never use planar maths on lon/lat degrees.
     */
    public static double calculateSpheroidalAreaSqM(Geometry geom) {
        if (geom == null || geom.isEmpty()) {
            return 0.0;
        }
        double totalArea = 0.0;
        for (int i = 0; i < geom.getNumGeometries(); i++) {
            Geometry sub = geom.getGeometryN(i);
            if (sub instanceof Polygon poly) {
                totalArea += calculatePolygonSpheroidalArea(poly);
            }
        }
        return Math.round(totalArea * 100.0) / 100.0;
    }

    private static double calculatePolygonSpheroidalArea(Polygon poly) {
        double area = calculateRingSpheroidalArea(poly.getExteriorRing().getCoordinates());
        for (int i = 0; i < poly.getNumInteriorRing(); i++) {
            area -= calculateRingSpheroidalArea(poly.getInteriorRingN(i).getCoordinates());
        }
        return Math.max(0.0, area);
    }

    private static double calculateRingSpheroidalArea(Coordinate[] coords) {
        if (coords == null || coords.length < 3) {
            return 0.0;
        }
        final double R = 6371008.8; // WGS 84 authalic sphere radius in meters
        double sum = 0.0;
        int n = coords.length;
        for (int i = 0; i < n - 1; i++) {
            double lon1 = Math.toRadians(coords[i].getX());
            double lat1 = Math.toRadians(coords[i].getY());
            double lon2 = Math.toRadians(coords[i + 1].getX());
            double lat2 = Math.toRadians(coords[i + 1].getY());
            double dLon = lon2 - lon1;
            while (dLon > Math.PI) dLon -= 2 * Math.PI;
            while (dLon < -Math.PI) dLon += 2 * Math.PI;
            sum += dLon * (2.0 + Math.sin(lat1) + Math.sin(lat2));
        }
        return Math.abs(sum * R * R / 2.0);
    }

    private static double calculatePerimeterMeters(Coordinate[] coords) {
        if (coords == null || coords.length < 2) return 0.0;
        double total = 0.0;
        for (int i = 0; i < coords.length - 1; i++) {
            total += haversineDistanceM(coords[i].getY(), coords[i].getX(), coords[i + 1].getY(), coords[i + 1].getX());
        }
        return Math.round(total * 100.0) / 100.0;
    }

    public static double haversineDistanceM(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371008.8; // WGS 84 authalic radius in meters
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);
        double c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        return R * c;
    }
}
