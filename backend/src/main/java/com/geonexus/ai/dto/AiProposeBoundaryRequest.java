package com.geonexus.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request payload to accept an AI-detected boundary draft and submit it as a formal
 * append-only geometry proposal for human four-eyes verification.
 */
public record AiProposeBoundaryRequest(
        @NotBlank(message = "detectionId is required")
        String detectionId,

        @Size(max = 255)
        String surveyorNotes
) {
}
