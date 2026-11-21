package com.geonexus.geometry.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload to reject a proposed boundary.
 */
public record RejectGeometryRequest(
        @NotBlank(message = "reason is required")
        @Size(max = 2000)
        String reason
) {
}
