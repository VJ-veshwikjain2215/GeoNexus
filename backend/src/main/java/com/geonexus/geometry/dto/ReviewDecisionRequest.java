package com.geonexus.geometry.dto;

import jakarta.validation.constraints.Size;

/**
 * Payload to approve/verify a proposed boundary.
 */
public record ReviewDecisionRequest(
        @Size(max = 2000)
        String notes
) {
}
