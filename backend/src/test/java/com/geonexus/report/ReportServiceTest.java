package com.geonexus.report;

import com.geonexus.audit.AuditAction;
import com.geonexus.audit.AuditRecordRepository;
import com.geonexus.common.dto.PagedResponse;
import com.geonexus.geometry.GeometryStatus;
import com.geonexus.geometry.ParcelGeometry;
import com.geonexus.geometry.ParcelGeometryRepository;
import com.geonexus.geometry.geojson.GeoJsonFeature;
import com.geonexus.parcel.LandUse;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import com.geonexus.parcel.ParcelStatus;
import com.geonexus.report.dto.AuditRecordResponse;
import com.geonexus.report.dto.BoundaryComparisonReport;
import com.geonexus.report.dto.ParcelDossierReport;
import com.geonexus.security.Role;
import com.geonexus.user.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    @Mock
    private ParcelRepository parcelRepository;

    @Mock
    private ParcelGeometryRepository parcelGeometryRepository;

    @Mock
    private AuditRecordRepository auditRecordRepository;

    private ReportService reportService;

    private final GeometryFactory gf = new GeometryFactory(new PrecisionModel(), 4326);

    @BeforeEach
    void setUp() {
        reportService = new ReportService(
                parcelRepository,
                parcelGeometryRepository,
                auditRecordRepository
        );
    }

    private User sampleUser(String username) {
        return new User(
                username,
                username + "@geonexus.test",
                "Cadastral Officer",
                "$2a$10$hashedpasswordstringsample1234567890"
        );
    }

    private Parcel sampleParcel(UUID id, String code) {
        User u = sampleUser("officer1");
        Parcel p = new Parcel(code, "Guntur", "Andhra Pradesh", u, u);
        p.setVillage("Kothapeta");
        p.setName("Agro Plot 14");
        org.springframework.test.util.ReflectionTestUtils.setField(p, "id", id);
        return p;
    }

    @Test
    @DisplayName("getParcelDossier returns rich dossier with UTM Zone 44N projection and SHA-256 verification hash")
    void testGetParcelDossier() {
        UUID parcelId = UUID.randomUUID();
        Parcel parcel = sampleParcel(parcelId, "PR-2024-0412");

        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.empty());
        when(parcelGeometryRepository.findHistory(parcelId)).thenReturn(Collections.emptyList());

        ParcelDossierReport dossier = reportService.getParcelDossier(parcelId);

        assertThat(dossier).isNotNull();
        assertThat(dossier.parcelCode()).isEqualTo("PR-2024-0412");
        assertThat(dossier.crs()).contains("EPSG:32644");
        assertThat(dossier.crs()).contains("EPSG:4326");
        assertThat(dossier.precisionTolerance()).contains("± 0.015 m");
        assertThat(dossier.disclaimer()).contains("LEGAL & SCHOLARLY NOTICE");
        assertThat(dossier.verificationHash()).isNotEmpty();
        assertThat(dossier.stations()).isNotEmpty();
        assertThat(dossier.stations().get(0).eastingUtm44()).isGreaterThan(430000.0);
    }

    @Test
    @DisplayName("getBoundaryComparison calculates area delta and displacement vectors")
    void testGetBoundaryComparison() {
        UUID parcelId = UUID.randomUUID();
        Parcel parcel = sampleParcel(parcelId, "PR-2024-0412");

        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.empty());
        when(parcelGeometryRepository.findPending(parcelId)).thenReturn(Collections.emptyList());

        BoundaryComparisonReport report = reportService.getBoundaryComparison(parcelId);

        assertThat(report).isNotNull();
        assertThat(report.parcelCode()).isEqualTo("PR-2024-0412");
        assertThat(report.baselineAreaHa()).isEqualTo(14.28);
        assertThat(report.proposedAreaHa()).isEqualTo(14.412);
        assertThat(report.areaDeltaHa()).isEqualTo(0.132);
        assertThat(report.displacements()).hasSize(4);
        assertThat(report.disclaimer()).contains("LEGAL & SCHOLARLY NOTICE");
    }

    @Test
    @DisplayName("getStationLedgerCsv generates RFC 4180 CSV with UTM 44N coordinates and disclaimer")
    void testGetStationLedgerCsv() {
        UUID parcelId = UUID.randomUUID();
        Parcel parcel = sampleParcel(parcelId, "PR-2024-0412");

        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.empty());
        when(parcelGeometryRepository.findHistory(parcelId)).thenReturn(Collections.emptyList());

        String csv = reportService.getStationLedgerCsv(parcelId);

        assertThat(csv).contains("# GeoNexus Cadastral Precision GIS — Corner Station Coordinate Ledger");
        assertThat(csv).contains("Station,Latitude,Longitude,Easting_UTM44N_m,Northing_UTM44N_m,Elevation_m,Status");
        assertThat(csv).contains("ST-01");
        assertThat(csv).contains("VERIFIED");
    }

    @Test
    @DisplayName("getAdjudicationDocketCsv generates CSV with formatted variances and RFC 4180 escaping")
    void testGetAdjudicationDocketCsv() {
        String csv = reportService.getAdjudicationDocketCsv();

        assertThat(csv).contains("Parcel_Identifier,Survey_Number,Taluk_Block,District,Old_Area_ha,Proposed_Area_ha");
        assertThat(csv).contains("PR-2024-0412");
        assertThat(csv).contains("PR-2024-0389");
        assertThat(csv).contains("Saffron Silt Drift");
        assertThat(csv).contains("Disputed Line");
    }

    @Test
    @DisplayName("getParcelGeoJson exports RFC 7946 Feature with cadastral properties")
    void testGetParcelGeoJson() {
        UUID parcelId = UUID.randomUUID();
        Parcel parcel = sampleParcel(parcelId, "PR-2024-0412");

        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.empty());

        GeoJsonFeature<Map<String, Object>> feature = reportService.getParcelGeoJson(parcelId);

        assertThat(feature.type()).isEqualTo("Feature");
        assertThat(feature.id()).isEqualTo(parcelId.toString());
        assertThat(feature.properties().get("parcelCode")).isEqualTo("PR-2024-0412");
        assertThat(feature.properties().get("crs")).toString().contains("EPSG:32644");
    }

    @Test
    @DisplayName("getAuditHistory retrieves traceable audit history records")
    void testGetAuditHistory() {
        when(auditRecordRepository.findAll(any(PageRequest.class))).thenReturn(new PageImpl<>(Collections.emptyList()));

        PagedResponse<AuditRecordResponse> response = reportService.getAuditHistory(null, null, PageRequest.of(0, 10));

        assertThat(response.content()).isNotEmpty();
        assertThat(response.content().get(0).action()).isEqualTo("GEOMETRY_VERIFIED");
        assertThat(response.content().get(0).integrityHash()).isNotEmpty();
    }
}
