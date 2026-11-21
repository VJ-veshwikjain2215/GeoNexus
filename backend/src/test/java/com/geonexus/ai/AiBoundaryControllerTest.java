package com.geonexus.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.ai.dto.AiBoundaryDetectionRequest;
import com.geonexus.ai.dto.AiBoundaryDetectionResponse;
import com.geonexus.ai.dto.AiProposeBoundaryRequest;
import com.geonexus.common.error.GlobalExceptionHandler;
import com.geonexus.geometry.GeometrySource;
import com.geonexus.geometry.GeometryStatus;
import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.geometry.geojson.GeoJsonGeometry;
import com.geonexus.security.Role;
import com.geonexus.security.account.UserAccount;
import com.geonexus.security.auth.AuthenticatedUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class AiBoundaryControllerTest {

    private MockMvc mockMvc;

    @Mock
    private AiBoundaryDetectionService aiBoundaryService;

    @Mock
    private org.springframework.context.ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private AiBoundaryController aiBoundaryController;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private AuthenticatedUser mockUser;

    @BeforeEach
    void setUp() {
        mockUser = AuthenticatedUser.from(
                new UserAccount(UUID.randomUUID().toString(), "surveyor1", "hash",
                        Set.of(Role.SURVEYOR), true, true), false);

        HandlerMethodArgumentResolver authPrincipalResolver = new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter parameter) {
                return parameter.hasParameterAnnotation(AuthenticationPrincipal.class);
            }

            @Override
            public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                          NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
                return mockUser;
            }
        };

        mockMvc = MockMvcBuilders.standaloneSetup(aiBoundaryController)
                .setControllerAdvice(new GlobalExceptionHandler(eventPublisher))
                .setCustomArgumentResolvers(authPrincipalResolver)
                .build();
    }

    @Test
    @DisplayName("POST /api/v1/parcels/{id}/ai-boundary/detect returns detection results")
    void detectReturns200() throws Exception {
        UUID parcelId = UUID.randomUUID();
        double[][][][] coords = new double[][][][]{
                {{{80.43, 16.30}, {80.44, 16.30}, {80.44, 16.31}, {80.43, 16.31}, {80.43, 16.30}}}
        };
        GeoJsonGeometry geoJsonGeom = GeoJsonGeometry.multiPolygon(coords);

        AiBoundaryDetectionResponse mockResponse = new AiBoundaryDetectionResponse(
                parcelId, "PR-2024-0412", "DET-12345678", "CANNY_CONTOUR_BUND_SEGMENTATION_V1",
                "High-Resolution 10cm Drone Orthomosaic", BigDecimal.valueOf(0.915),
                0.89, 0.92, Instant.now(), 144120.0, 14.412, 142850.0, 14.285,
                1270.0, 0.89, geoJsonGeom, List.of(), AiBoundaryDetectionResponse.MANDATORY_DISCLAIMER,
                "PROPOSED_ASSISTIVE_DRAFT"
        );

        when(aiBoundaryService.detect(eq(parcelId), any())).thenReturn(mockResponse);

        AiBoundaryDetectionRequest request = new AiBoundaryDetectionRequest(
                0.80, 0.000015, "Synthetic Drone Orthomosaic", "CANNY_CONTOUR_BUND_SEGMENTATION_V1"
        );

        mockMvc.perform(post("/api/v1/parcels/{id}/ai-boundary/detect", parcelId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parcelCode").value("PR-2024-0412"))
                .andExpect(jsonPath("$.detectionId").value("DET-12345678"))
                .andExpect(jsonPath("$.confidence").value(0.915))
                .andExpect(jsonPath("$.status").value("PROPOSED_ASSISTIVE_DRAFT"))
                .andExpect(jsonPath("$.academicDisclaimer").isNotEmpty());
    }

    @Test
    @DisplayName("POST /api/v1/parcels/{id}/ai-boundary/propose submits proposal and returns GeometryResponse")
    void proposeReturns200() throws Exception {
        UUID parcelId = UUID.randomUUID();
        UUID geomId = UUID.randomUUID();

        GeometryResponse mockGeomResponse = new GeometryResponse(
                geomId, parcelId, 2, 144120.0, GeometrySource.AI_DETECTED, null, null,
                "AI boundary detection", "Drone Orthomosaic", BigDecimal.valueOf(0.915),
                null, Instant.now(), GeometryStatus.PROPOSED, null, null, null, null, null, null
        );

        when(aiBoundaryService.propose(eq(parcelId), any(AiProposeBoundaryRequest.class), eq(mockUser)))
                .thenReturn(mockGeomResponse);

        AiProposeBoundaryRequest request = new AiProposeBoundaryRequest(
                "DET-12345678", "Surveyor accepted detected agricultural bund proposal"
        );

        mockMvc.perform(post("/api/v1/parcels/{id}/ai-boundary/propose", parcelId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(geomId.toString()))
                .andExpect(jsonPath("$.versionNo").value(2))
                .andExpect(jsonPath("$.source").value("AI_DETECTED"))
                .andExpect(jsonPath("$.status").value("PROPOSED"));
    }
}
