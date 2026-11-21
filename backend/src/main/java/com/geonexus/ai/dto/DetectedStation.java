package com.geonexus.ai.dto;

/**
 * Cadastral station/vertex identified during AI boundary edge extraction.
 */
public record DetectedStation(
        String station,
        double longitude,
        double latitude,
        double edgeConfidence,
        double displacementFromRecordedM
) {
}
