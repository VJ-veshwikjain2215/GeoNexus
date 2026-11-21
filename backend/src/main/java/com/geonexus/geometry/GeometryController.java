package com.geonexus.geometry;

import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.geometry.dto.ProposeGeometryRequest;
import com.geonexus.geometry.dto.RejectGeometryRequest;
import com.geonexus.geometry.dto.ReviewDecisionRequest;
import com.geonexus.security.SecurityExpressions;
import com.geonexus.security.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/parcels/{parcelId}/geometries")
public class GeometryController {

    private final ParcelGeometryService parcelGeometryService;

    public GeometryController(ParcelGeometryService parcelGeometryService) {
        this.parcelGeometryService = parcelGeometryService;
    }

    @GetMapping
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public List<GeometryResponse> getHistory(@PathVariable UUID parcelId) {
        return parcelGeometryService.getHistory(parcelId);
    }

    @GetMapping("/current")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public GeometryResponse getCurrent(@PathVariable UUID parcelId) {
        return parcelGeometryService.getCurrent(parcelId);
    }

    @GetMapping("/{geometryId}")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public GeometryResponse getById(@PathVariable UUID parcelId, @PathVariable UUID geometryId) {
        return parcelGeometryService.getById(parcelId, geometryId);
    }

    @PostMapping({"", "/propose"})
    @PreAuthorize(SecurityExpressions.SURVEY_WRITE)
    public ResponseEntity<GeometryResponse> propose(
            @PathVariable UUID parcelId,
            @Valid @RequestBody ProposeGeometryRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        GeometryResponse proposed = parcelGeometryService.propose(parcelId, request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(proposed);
    }

    @PostMapping("/{geometryId}/verify")
    @PreAuthorize(SecurityExpressions.REVIEW)
    public GeometryResponse verify(
            @PathVariable UUID parcelId,
            @PathVariable UUID geometryId,
            @Valid @RequestBody(required = false) ReviewDecisionRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        return parcelGeometryService.verify(parcelId, geometryId, request, user);
    }

    @PostMapping("/{geometryId}/reject")
    @PreAuthorize(SecurityExpressions.REVIEW)
    public GeometryResponse reject(
            @PathVariable UUID parcelId,
            @PathVariable UUID geometryId,
            @Valid @RequestBody RejectGeometryRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        return parcelGeometryService.reject(parcelId, geometryId, request, user);
    }
}
