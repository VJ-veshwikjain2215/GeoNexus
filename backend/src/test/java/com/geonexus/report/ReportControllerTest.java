package com.geonexus.report;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.common.dto.PagedResponse;
import com.geonexus.common.error.GlobalExceptionHandler;
import com.geonexus.geometry.geojson.GeoJsonFeature;
import com.geonexus.geometry.geojson.GeoJsonGeometry;
import com.geonexus.report.dto.AuditRecordResponse;
import com.geonexus.report.dto.BoundaryComparisonReport;
import com.geonexus.report.dto.ParcelDossierReport;
import com.geonexus.report.dto.StationCoordinateRecord;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ReportControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ReportService reportService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private ReportController reportController;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(reportController)
                .setControllerAdvice(new GlobalExceptionHandler(eventPublisher))
                .build();
    }

    @Test
    @DisplayName("GET /api/v1/reports/parcels/{id} returns full parcel dossier report")
    void testGetParcelDossier() throws Exception {
        UUID parcelId = UUID.randomUUID();
        ParcelDossierReport dossier = new ParcelDossierReport(
                parcelId, "PR-2024-0412", "Agro Plot", "Kothapeta", "Kothapeta", "Guntur", "Andhra Pradesh",
                "AGRICULTURAL", "ACTIVE", "officer1", "REF-412", "Notes", 1, 142850.0, 14.285, 1894.2, 4,
                List.of(new StationCoordinateRecord("ST-01", 80.4312, 16.3021, 439200.0, 1802500.0, 18.5, "VERIFIED")),
                Collections.emptyList(), "SRV-2024-0911", "M. Ananth", "Dr. E. Vance", Instant.now(),
                "SEALED", "hash123456", "EPSG:4326 / EPSG:32644", "± 0.015 m", "Disclaimer", Instant.now()
        );

        when(reportService.getParcelDossier(parcelId)).thenReturn(dossier);

        mockMvc.perform(get("/api/v1/reports/parcels/" + parcelId)
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parcelCode").value("PR-2024-0412"))
                .andExpect(jsonPath("$.areaHa").value(14.285))
                .andExpect(jsonPath("$.crs").value("EPSG:4326 / EPSG:32644"))
                .andExpect(jsonPath("$.stations[0].station").value("ST-01"));
    }

    @Test
    @DisplayName("GET /api/v1/reports/parcels/{id}/boundary-comparison returns boundary comparison report")
    void testGetBoundaryComparison() throws Exception {
        UUID parcelId = UUID.randomUUID();
        BoundaryComparisonReport report = new BoundaryComparisonReport(
                parcelId, "PR-2024-0412", "Kothapeta", "Guntur", 1, 2, 14.28, 14.412, 0.132, 0.91,
                "Saffron Silt Drift", false, 2.4, 1.17, Collections.emptyList(), "Notes", "Directive",
                "PROPOSED", "Dr. E. Vance", Instant.now(), "EPSG:4326 / EPSG:32644", "± 0.015 m", "Disclaimer", Instant.now()
        );

        when(reportService.getBoundaryComparison(parcelId)).thenReturn(report);

        mockMvc.perform(get("/api/v1/reports/parcels/" + parcelId + "/boundary-comparison")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parcelCode").value("PR-2024-0412"))
                .andExpect(jsonPath("$.varianceClassification").value("Saffron Silt Drift"))
                .andExpect(jsonPath("$.areaDeltaPercent").value(0.91));
    }

    @Test
    @DisplayName("GET /api/v1/reports/parcels/{id}/export/csv returns downloadable CSV stream")
    void testExportStationLedgerCsv() throws Exception {
        UUID parcelId = UUID.randomUUID();
        String csvContent = "Station,Latitude,Longitude\nST-01,16.3021,80.4312\n";

        when(reportService.getStationLedgerCsv(parcelId)).thenReturn(csvContent);

        mockMvc.perform(get("/api/v1/reports/parcels/" + parcelId + "/export/csv"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"parcel-" + parcelId + "-stations.csv\""))
                .andExpect(content().contentType("text/csv;charset=UTF-8"))
                .andExpect(content().string(csvContent));
    }

    @Test
    @DisplayName("GET /api/v1/reports/parcels/{id}/export/geojson returns RFC 7946 GeoJSON Feature")
    void testExportParcelGeoJson() throws Exception {
        UUID parcelId = UUID.randomUUID();
        GeoJsonFeature<Map<String, Object>> feature = new GeoJsonFeature<>(
                "Feature", parcelId.toString(),
                new GeoJsonGeometry("Polygon", List.of(List.of(List.of(80.4312, 16.3021), List.of(80.4312, 16.3021)))),
                Map.of("parcelCode", "PR-2024-0412", "areaHa", 14.28)
        );

        when(reportService.getParcelGeoJson(parcelId)).thenReturn(feature);

        mockMvc.perform(get("/api/v1/reports/parcels/" + parcelId + "/export/geojson"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"parcel-" + parcelId + "-boundary.geojson\""))
                .andExpect(jsonPath("$.type").value("Feature"))
                .andExpect(jsonPath("$.properties.parcelCode").value("PR-2024-0412"));
    }

    @Test
    @DisplayName("GET /api/v1/reports/adjudication-docket/export/csv returns district docket CSV")
    void testExportAdjudicationDocketCsv() throws Exception {
        String csvContent = "Parcel_Identifier,Old_Area,Proposed_Area\nPR-2024-0412,14.28,14.41\n";

        when(reportService.getAdjudicationDocketCsv()).thenReturn(csvContent);

        mockMvc.perform(get("/api/v1/reports/adjudication-docket/export/csv"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"geonexus-adjudication-docket-2024.csv\""))
                .andExpect(content().contentType("text/csv;charset=UTF-8"))
                .andExpect(content().string(csvContent));
    }

    @Test
    @DisplayName("GET /api/v1/reports/audit returns paginated audit records")
    void testGetAuditHistory() throws Exception {
        AuditRecordResponse record = new AuditRecordResponse(
                1L, Instant.now(), UUID.randomUUID(), "surveyor1", "GEOMETRY_PROPOSED",
                "SUCCESS", "ParcelGeometry", UUID.randomUUID(), UUID.randomUUID(), "PR-2024-0412",
                "APP", "REQ-1", "127.0.0.1", Map.of(), "hash123"
        );
        PagedResponse<AuditRecordResponse> pagedResponse = new PagedResponse<>(
                List.of(record), 0, 10, 1, 1, true
        );

        when(reportService.getAuditHistory(any(), any(), any())).thenReturn(pagedResponse);

        mockMvc.perform(get("/api/v1/reports/audit")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].action").value("GEOMETRY_PROPOSED"))
                .andExpect(jsonPath("$.content[0].integrityHash").value("hash123"));
    }
}
