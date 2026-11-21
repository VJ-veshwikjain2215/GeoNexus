package com.geonexus.analytics;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.analytics.dto.ActionableCadastralInsight;
import com.geonexus.analytics.dto.AdministrativeBreakdown;
import com.geonexus.analytics.dto.AnalyticsDashboardResponse;
import com.geonexus.analytics.dto.AreaDistributionBin;
import com.geonexus.analytics.dto.BoundaryVarianceMetrics;
import com.geonexus.analytics.dto.CadastralActivityItem;
import com.geonexus.analytics.dto.CadastralSummaryStats;
import com.geonexus.analytics.dto.SeasonalTrendPoint;
import com.geonexus.common.error.GlobalExceptionHandler;
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
import java.util.List;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AnalyticsControllerTest {

    private MockMvc mockMvc;

    @Mock
    private AnalyticsService analyticsService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private AnalyticsController analyticsController;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(analyticsController)
                .setControllerAdvice(new GlobalExceptionHandler(eventPublisher))
                .build();
    }

    @Test
    @DisplayName("GET /api/v1/analytics/dashboard returns full dashboard response")
    void testGetDashboard() throws Exception {
        CadastralSummaryStats summary = new CadastralSummaryStats(
                10L, 8L, 2L, 0L, 6L, 3L, 85.4, 14.23, 42L, 18L, 184L, 36, 99.1, 0.004, "LIVE_DATABASE_AGGREGATION"
        );
        List<AreaDistributionBin> bins = List.of(
                new AreaDistributionBin("< 2 ha", "Marginal", 0, 2, 1, 1.8, 10.0),
                new AreaDistributionBin("10 – 25 ha", "Medium", 10, 25, 4, 60.5, 90.0)
        );
        List<AdministrativeBreakdown> admin = List.of(
                new AdministrativeBreakdown("Kothapeta High Basin", "Kothapeta", "Guntur", 1240, 1098, 142, 88.5, "On Schedule", "Dr. E. Vance", true)
        );
        BoundaryVarianceMetrics variance = new BoundaryVarianceMetrics(
                14, 8, 5, 1, 0.12, 1.15, 0.16, 4, 10, 3
        );
        List<ActionableCadastralInsight> insights = List.of(
                new ActionableCadastralInsight("INS-01", "WARNING", "VARIANCE_EXCEEDED", "Area Drift Exceeds Tolerance", "Description", "PR-2024-0412", null, "Inspect")
        );
        List<CadastralActivityItem> activity = List.of(
                new CadastralActivityItem("ACT-01", "OK", "Resurvey Certified", "Today", "Approved", "K. Ramachandran", "PR-2024-0365", "+0.04 ha", "hash", true)
        );
        List<SeasonalTrendPoint> trends = List.of(
                new SeasonalTrendPoint("Jul 2024", 800, 680, 90, 30, 24.5)
        );

        AnalyticsDashboardResponse response = new AnalyticsDashboardResponse(
                summary, bins, admin, variance, insights, activity, trends,
                "EPSG:4326 / EPSG:32644", "± 0.015 m", "Disclaimer", Instant.now()
        );

        when(analyticsService.getDashboard()).thenReturn(response);

        mockMvc.perform(get("/api/v1/analytics/dashboard")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.totalParcels").value(10))
                .andExpect(jsonPath("$.summary.totalSurveyedAreaHa").value(85.4))
                .andExpect(jsonPath("$.areaDistribution[0].rangeLabel").value("< 2 ha"))
                .andExpect(jsonPath("$.administrativeBreakdown[0].subdistrict").value("Kothapeta High Basin"))
                .andExpect(jsonPath("$.boundaryVariance.totalProposalsEvaluated").value(14))
                .andExpect(jsonPath("$.actionableInsights[0].id").value("INS-01"))
                .andExpect(jsonPath("$.recentActivity[0].type").value("OK"))
                .andExpect(jsonPath("$.crs").value("EPSG:4326 / EPSG:32644"));
    }

    @Test
    @DisplayName("GET /api/v1/analytics/summary returns high-level summary KPIs")
    void testGetSummary() throws Exception {
        CadastralSummaryStats summary = new CadastralSummaryStats(
                10L, 8L, 2L, 0L, 6L, 3L, 85.4, 14.23, 42L, 18L, 184L, 36, 99.1, 0.004, "LIVE_DATABASE_AGGREGATION"
        );

        when(analyticsService.getSummary()).thenReturn(summary);

        mockMvc.perform(get("/api/v1/analytics/summary")
                        .accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalParcels").value(10))
                .andExpect(jsonPath("$.activeGeodeticPillars").value(36));
    }
}
