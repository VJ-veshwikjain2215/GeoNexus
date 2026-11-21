package com.geonexus.report;

import com.geonexus.audit.AuditAction;
import com.geonexus.common.dto.PagedResponse;
import com.geonexus.geometry.geojson.GeoJsonFeature;
import com.geonexus.report.dto.AuditRecordResponse;
import com.geonexus.report.dto.BoundaryComparisonReport;
import com.geonexus.report.dto.ParcelDossierReport;
import com.geonexus.security.SecurityExpressions;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;

/**
 * Controller providing Cadastral Dossier Reports, Boundary Comparison Declarations,
 * downloadable RFC 4180 CSV / GeoJSON exports, and immutable audit logs.
 */
@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    /**
     * Comprehensive official-style Cadastral Parcel Dossier Report.
     */
    @GetMapping("/parcels/{id}")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<ParcelDossierReport> getParcelDossier(@PathVariable("id") UUID id) {
        return ResponseEntity.ok(reportService.getParcelDossier(id));
    }

    /**
     * Boundary Comparison & Variance Adjudication Report.
     */
    @GetMapping("/parcels/{id}/boundary-comparison")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<BoundaryComparisonReport> getBoundaryComparison(@PathVariable("id") UUID id) {
        return ResponseEntity.ok(reportService.getBoundaryComparison(id));
    }

    /**
     * Downloadable corner station coordinate ledger CSV.
     */
    @GetMapping(value = "/parcels/{id}/export/csv", produces = "text/csv")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<byte[]> exportStationLedgerCsv(@PathVariable("id") UUID id) {
        String csv = reportService.getStationLedgerCsv(id);
        byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"parcel-" + id + "-stations.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }

    /**
     * Downloadable RFC 7946 GeoJSON Feature with rich cadastral attributes.
     */
    @GetMapping(value = "/parcels/{id}/export/geojson", produces = "application/geo+json")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<GeoJsonFeature<Map<String, Object>>> exportParcelGeoJson(@PathVariable("id") UUID id) {
        GeoJsonFeature<Map<String, Object>> feature = reportService.getParcelGeoJson(id);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"parcel-" + id + "-boundary.geojson\"")
                .contentType(MediaType.parseMediaType("application/geo+json; charset=UTF-8"))
                .body(feature);
    }

    /**
     * Downloadable full district adjudication docket CSV.
     */
    @GetMapping(value = "/adjudication-docket/export/csv", produces = "text/csv")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<byte[]> exportAdjudicationDocketCsv() {
        String csv = reportService.getAdjudicationDocketCsv();
        byte[] bytes = csv.getBytes(StandardCharsets.UTF_8);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"geonexus-adjudication-docket-2024.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .body(bytes);
    }

    /**
     * Paginated, filterable immutable audit trail.
     */
    @GetMapping("/audit")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<PagedResponse<AuditRecordResponse>> getAuditHistory(
            @RequestParam(value = "parcelId", required = false) UUID parcelId,
            @RequestParam(value = "action", required = false) AuditAction action,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "10") int size
    ) {
        Pageable pageable = PageRequest.of(page, Math.min(size, 100), Sort.by(Sort.Direction.DESC, "occurredAt"));
        return ResponseEntity.ok(reportService.getAuditHistory(parcelId, action, pageable));
    }
}
