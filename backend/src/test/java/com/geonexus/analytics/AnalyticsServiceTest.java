package com.geonexus.analytics;

import com.geonexus.analytics.dto.ActionableCadastralInsight;
import com.geonexus.analytics.dto.AdministrativeBreakdown;
import com.geonexus.analytics.dto.AnalyticsDashboardResponse;
import com.geonexus.analytics.dto.AreaDistributionBin;
import com.geonexus.analytics.dto.BoundaryVarianceMetrics;
import com.geonexus.analytics.dto.CadastralSummaryStats;
import com.geonexus.audit.AuditRecordRepository;
import com.geonexus.geometry.GeometrySource;
import com.geonexus.geometry.GeometryStatus;
import com.geonexus.geometry.ParcelGeometry;
import com.geonexus.geometry.ParcelGeometryRepository;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import com.geonexus.parcel.ParcelStatus;
import com.geonexus.survey.SurveyRepository;
import com.geonexus.survey.SurveyStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnalyticsServiceTest {

    @Mock
    private ParcelRepository parcelRepository;

    @Mock
    private ParcelGeometryRepository parcelGeometryRepository;

    @Mock
    private AuditRecordRepository auditRecordRepository;

    @Mock
    private SurveyRepository surveyRepository;

    private AnalyticsService analyticsService;

    @BeforeEach
    void setUp() {
        analyticsService = new AnalyticsService(
                parcelRepository,
                parcelGeometryRepository,
                auditRecordRepository,
                surveyRepository
        );
    }

    @Test
    @DisplayName("getSummary returns correct aggregations from database counts")
    void testGetSummary() {
        when(parcelRepository.countTotal()).thenReturn(25L);
        when(parcelRepository.countByStatus(ParcelStatus.ACTIVE)).thenReturn(20L);
        when(parcelRepository.countByStatus(ParcelStatus.DRAFT)).thenReturn(5L);
        when(parcelRepository.countByStatus(ParcelStatus.ARCHIVED)).thenReturn(0L);

        when(parcelGeometryRepository.countByStatus(GeometryStatus.VERIFIED)).thenReturn(18L);
        when(parcelGeometryRepository.countByStatus(GeometryStatus.PROPOSED)).thenReturn(7L);
        when(parcelGeometryRepository.sumVerifiedAreaSqM()).thenReturn(1428000.0); // 142.8 ha
        when(parcelGeometryRepository.avgVerifiedAreaSqM()).thenReturn(79333.33);

        when(surveyRepository.countByStatus(SurveyStatus.IN_PROGRESS)).thenReturn(12L);

        CadastralSummaryStats summary = analyticsService.getSummary();

        assertThat(summary.totalParcels()).isEqualTo(25L);
        assertThat(summary.activeParcels()).isEqualTo(20L);
        assertThat(summary.draftParcels()).isEqualTo(5L);
        assertThat(summary.verifiedParcels()).isEqualTo(18L);
        assertThat(summary.pendingBoundaryProposals()).isEqualTo(7L);
        assertThat(summary.totalSurveyedAreaHa()).isEqualTo(142.8);
        assertThat(summary.dataSource()).isEqualTo("LIVE_DATABASE_AGGREGATION");
    }

    @Test
    @DisplayName("computeAreaDistribution categorizes parcels into 5 standard bins")
    void testComputeAreaDistribution() {
        List<AreaDistributionBin> bins = analyticsService.computeAreaDistribution();

        assertThat(bins).hasSize(5);
        assertThat(bins.get(0).category()).isEqualTo("Marginal");
        assertThat(bins.get(1).category()).isEqualTo("Small");
        assertThat(bins.get(2).category()).isEqualTo("Semi-Medium");
        assertThat(bins.get(3).category()).isEqualTo("Medium");
        assertThat(bins.get(4).category()).isEqualTo("Large");

        double sumPct = bins.stream().mapToDouble(AreaDistributionBin::percentage).sum();
        assertThat(sumPct).isBetween(99.0, 101.0);
    }

    @Test
    @DisplayName("computeAdministrativeBreakdown returns all 6 approved agro-subdistricts")
    void testComputeAdministrativeBreakdown() {
        List<AdministrativeBreakdown> breakdown = analyticsService.computeAdministrativeBreakdown();

        assertThat(breakdown).hasSize(6);
        assertThat(breakdown).extracting(AdministrativeBreakdown::subdistrict)
                .contains(
                        "Kothapeta High Basin",
                        "Mylavaram Riparian Corridor",
                        "Nuzvid Orchard Belt",
                        "Tiruvuru Lower Canal Zone",
                        "Vissannapeta Uplands",
                        "Gampalagudem West"
                );

        assertThat(breakdown.stream().allMatch(AdministrativeBreakdown::isSyntheticTarget)).isTrue();
    }

    @Test
    @DisplayName("getDashboard generates a complete response with insights, trends, and disclaimer")
    void testGetDashboard() {
        AnalyticsDashboardResponse response = analyticsService.getDashboard();

        assertThat(response).isNotNull();
        assertThat(response.summary()).isNotNull();
        assertThat(response.areaDistribution()).isNotEmpty();
        assertThat(response.administrativeBreakdown()).isNotEmpty();
        assertThat(response.boundaryVariance()).isNotNull();
        assertThat(response.actionableInsights()).isNotEmpty();
        assertThat(response.recentActivity()).isNotEmpty();
        assertThat(response.seasonalTrends()).isNotEmpty();
        assertThat(response.crs()).contains("EPSG:4326");
        assertThat(response.crs()).contains("EPSG:32644");
        assertThat(response.disclaimer()).contains("LEGAL & SCHOLARLY NOTICE");
    }
}
