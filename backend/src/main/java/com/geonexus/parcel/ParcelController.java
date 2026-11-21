package com.geonexus.parcel;

import com.geonexus.common.dto.PagedResponse;
import com.geonexus.geometry.geojson.GeoJsonFeature;
import com.geonexus.geometry.geojson.GeoJsonFeatureCollection;
import com.geonexus.parcel.dto.CreateParcelRequest;
import com.geonexus.parcel.dto.ParcelDetailResponse;
import com.geonexus.parcel.dto.ParcelFilterParams;
import com.geonexus.parcel.dto.ParcelProperties;
import com.geonexus.parcel.dto.ParcelSummaryResponse;
import com.geonexus.parcel.dto.UpdateParcelRequest;
import com.geonexus.security.SecurityExpressions;
import com.geonexus.security.auth.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/parcels")
public class ParcelController {

    private final ParcelService parcelService;

    public ParcelController(ParcelService parcelService) {
        this.parcelService = parcelService;
    }

    @GetMapping
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public PagedResponse<ParcelSummaryResponse> list(
            @RequestParam(required = false) ParcelStatus status,
            @RequestParam(required = false) String district,
            @RequestParam(required = false) String state,
            @RequestParam(required = false) UUID ownerId,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        ParcelFilterParams params = new ParcelFilterParams(status, district, state, ownerId, search);
        return parcelService.listParcels(params, pageable);
    }

    @GetMapping("/geojson")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public GeoJsonFeatureCollection<ParcelProperties> listGeoJson(
            @RequestParam(required = false) ParcelStatus status,
            @RequestParam(required = false) String district) {
        return parcelService.listParcelsGeoJson(status, district);
    }

    @GetMapping("/{id}")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ParcelDetailResponse getById(@PathVariable UUID id) {
        return parcelService.getParcel(id);
    }

    @GetMapping("/{id}/geojson")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public GeoJsonFeature<ParcelProperties> getGeoJson(@PathVariable UUID id) {
        return parcelService.getParcelGeoJson(id);
    }

    @PostMapping
    @PreAuthorize(SecurityExpressions.SURVEY_WRITE)
    public ResponseEntity<ParcelDetailResponse> create(
            @Valid @RequestBody CreateParcelRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        ParcelDetailResponse created = parcelService.createParcel(request, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize(SecurityExpressions.SURVEY_WRITE)
    public ParcelDetailResponse update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateParcelRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        return parcelService.updateParcel(id, request, user);
    }
}
