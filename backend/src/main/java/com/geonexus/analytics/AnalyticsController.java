package com.geonexus.analytics;

import com.geonexus.analytics.dto.AnalyticsDashboardResponse;
import com.geonexus.analytics.dto.CadastralSummaryStats;
import com.geonexus.security.SecurityExpressions;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller providing authoritative Cadastral GIS analytics,
 * operational summary metrics, area distributions, and seasonal progress telemetry.
 */
@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;

    public AnalyticsController(AnalyticsService analyticsService) {
        this.analyticsService = analyticsService;
    }

    /**
     * Complete analytics dashboard payload.
     */
    @GetMapping("/dashboard")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<AnalyticsDashboardResponse> getDashboard() {
        return ResponseEntity.ok(analyticsService.getDashboard());
    }

    /**
     * High-level summary KPI metrics only.
     */
    @GetMapping("/summary")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public ResponseEntity<CadastralSummaryStats> getSummary() {
        return ResponseEntity.ok(analyticsService.getSummary());
    }
}
