package com.geonexus.geometry.dto;

import java.util.UUID;

/**
 * Details of an overlapping verified parcel boundary detected during spatial analysis.
 */
public record OverlapDetail(
        UUID parcelId,
        String parcelCode,
        String locality,
        double overlapAreaSqM
) {}
