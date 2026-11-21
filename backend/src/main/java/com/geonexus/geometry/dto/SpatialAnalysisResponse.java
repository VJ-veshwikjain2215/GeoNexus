package com.geonexus.geometry.dto;

import java.util.List;
import java.util.UUID;

/**
 * Comprehensive geospatial analysis dossier for a cadastral parcel.
 * Includes spheroidal area, perimeter, topology validation diagnostics,
 * multi-parcel overlap detection, and boundary displacement caliper metrics.
 */
public record SpatialAnalysisResponse(
        UUID parcelId,
        String parcelCode,
        Double recordedAreaSqM,
        Double recordedAreaHa,
        Double proposedAreaSqM,
        Double proposedAreaHa,
        Double areaDeltaSqM,
        Double areaDeltaPercentage,
        Double perimeterM,
        int stationCount,
        boolean isValidTopology,
        Double polygonClosureDeltaM,
        int selfIntersectionViolations,
        int adjacentCollisionOverlaps,
        List<OverlapDetail> overlappingParcels,
        int overlappingParcelsCount,
        Double maxDisplacementM,
        Double averageDisplacementM,
        List<StationDisplacement> stationDisplacements
) {}
