package com.geonexus.ai;

import com.geonexus.ai.dto.AiBoundaryDetectionRequest;
import com.geonexus.ai.dto.AiBoundaryDetectionResponse;
import com.geonexus.ai.dto.AiProposeBoundaryRequest;
import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.security.SecurityExpressions;
import com.geonexus.security.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * REST controller for AI-assisted agricultural boundary edge detection (Phase 7).
 */
@RestController
@RequestMapping("/api/v1/parcels/{id}/ai-boundary")
public class AiBoundaryController {

    private final AiBoundaryDetectionService aiBoundaryService;

    public AiBoundaryController(AiBoundaryDetectionService aiBoundaryService) {
        this.aiBoundaryService = aiBoundaryService;
    }

    /**
     * Executes spectral/contour edge detection over the parcel's cadastral bounds.
     */
    @PostMapping("/detect")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<AiBoundaryDetectionResponse> detect(
            @PathVariable UUID id,
            @RequestBody(required = false) @Valid AiBoundaryDetectionRequest request) {
        AiBoundaryDetectionResponse response = aiBoundaryService.detect(id, request);
        return ResponseEntity.ok(response);
    }

    /**
     * Submits an accepted AI boundary suggestion as a formal versioned proposal
     * with AI_DETECTED provenance and confidence score for four-eyes review.
     */
    @PostMapping("/propose")
    @PreAuthorize(SecurityExpressions.SURVEY_WRITE)
    public ResponseEntity<GeometryResponse> propose(
            @PathVariable UUID id,
            @RequestBody @Valid AiProposeBoundaryRequest request,
            @AuthenticationPrincipal AuthenticatedUser currentUser) {
        GeometryResponse response = aiBoundaryService.propose(id, request, currentUser);
        return ResponseEntity.ok(response);
    }
}
