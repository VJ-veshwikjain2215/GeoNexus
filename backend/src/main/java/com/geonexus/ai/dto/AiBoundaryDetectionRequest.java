package com.geonexus.ai.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;

/**
 * Request parameters for AI-assisted agricultural field boundary edge detection.
 */
public record AiBoundaryDetectionRequest(
        @DecimalMin(value = "0.1", message = "sensitivity must be at least 0.1")
        @DecimalMax(value = "1.0", message = "sensitivity cannot exceed 1.0")
        Double sensitivity,

        @DecimalMin(value = "0.000001", message = "smoothingTolerance must be positive")
        Double smoothingTolerance,

        @Size(max = 255)
        String imagerySource,

        @Size(max = 100)
        String algorithm
) {
    public static AiBoundaryDetectionRequest defaultSettings() {
        return new AiBoundaryDetectionRequest(
                0.75,
                0.000015,
                "High-Resolution 10cm Multispectral Drone Orthomosaic (Kothapeta Cadastral Tile)",
                "CANNY_CONTOUR_BUND_SEGMENTATION_V1"
        );
    }
}
