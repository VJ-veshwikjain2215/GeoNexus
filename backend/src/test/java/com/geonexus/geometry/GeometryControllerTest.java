package com.geonexus.geometry;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.common.error.GlobalExceptionHandler;
import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.geometry.dto.ProposeGeometryRequest;
import com.geonexus.geometry.dto.RejectGeometryRequest;
import com.geonexus.geometry.dto.ReviewDecisionRequest;
import com.geonexus.geometry.geojson.GeoJsonGeometry;
import com.geonexus.security.Role;
import com.geonexus.security.account.UserAccount;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.security.dto.UserSummary;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class GeometryControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ParcelGeometryService parcelGeometryService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private GeometryController geometryController;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private AuthenticatedUser mockUser;

    private final double[][][] validPolyCoords = new double[][][]{
            {
                    {78.1, 14.1},
                    {78.2, 14.1},
                    {78.2, 14.2},
                    {78.1, 14.2},
                    {78.1, 14.1}
            }
    };

    @BeforeEach
    void setUp() {
        mockUser = AuthenticatedUser.from(
                new UserAccount(UUID.randomUUID().toString(), "reviewer1", "hash",
                        Set.of(Role.REVIEWER), true, true), false);

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

        mockMvc = MockMvcBuilders.standaloneSetup(geometryController)
                .setControllerAdvice(new GlobalExceptionHandler(eventPublisher))
                .setCustomArgumentResolvers(authPrincipalResolver)
                .build();
    }

    @Test
    @DisplayName("GET /api/v1/parcels/{id}/geometries returns boundary history")
    void getsHistory() throws Exception {
        UUID parcelId = UUID.randomUUID();
        UserSummary submitterSummary = new UserSummary(mockUser.getId(), mockUser.getUsername(), List.of(Role.SURVEYOR));
        GeometryResponse resp = new GeometryResponse(
                UUID.randomUUID(), parcelId, 1, 14200.0, GeometrySource.MANUAL_ENTRY,
                null, null, "Desc", "Ref", null,
                submitterSummary, Instant.now(), GeometryStatus.PROPOSED, null, null, null, null, null,
                GeoJsonGeometry.polygon(validPolyCoords));

        when(parcelGeometryService.getHistory(parcelId)).thenReturn(List.of(resp));

        mockMvc.perform(get("/api/v1/parcels/{parcelId}/geometries", parcelId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].versionNo").value(1))
                .andExpect(jsonPath("$[0].status").value("PROPOSED"));
    }

    @Test
    @DisplayName("POST /api/v1/parcels/{id}/geometries/propose creates proposal")
    void proposesGeometry() throws Exception {
        UUID parcelId = UUID.randomUUID();
        ProposeGeometryRequest req = new ProposeGeometryRequest(
                GeoJsonGeometry.polygon(validPolyCoords),
                GeometrySource.MANUAL_ENTRY, null, null, "Desc", "Ref", null);

        UserSummary submitterSummary = new UserSummary(mockUser.getId(), mockUser.getUsername(), List.of(Role.SURVEYOR));
        GeometryResponse resp = new GeometryResponse(
                UUID.randomUUID(), parcelId, 1, 14200.0, GeometrySource.MANUAL_ENTRY,
                null, null, "Desc", "Ref", null,
                submitterSummary, Instant.now(), GeometryStatus.PROPOSED, null, null, null, null, null,
                GeoJsonGeometry.polygon(validPolyCoords));

        when(parcelGeometryService.propose(eq(parcelId), any(), any())).thenReturn(resp);

        mockMvc.perform(post("/api/v1/parcels/{parcelId}/geometries/propose", parcelId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PROPOSED"));
    }

    @Test
    @DisplayName("POST /api/v1/parcels/{id}/geometries/{geomId}/verify approves proposal")
    void verifiesProposal() throws Exception {
        UUID parcelId = UUID.randomUUID();
        UUID geomId = UUID.randomUUID();
        ReviewDecisionRequest req = new ReviewDecisionRequest("Verified with ground control");

        UserSummary submitterSummary = new UserSummary(UUID.randomUUID().toString(), "surveyor1", List.of(Role.SURVEYOR));
        UserSummary reviewerSummary = new UserSummary(mockUser.getId(), mockUser.getUsername(), List.of(Role.REVIEWER));

        GeometryResponse resp = new GeometryResponse(
                geomId, parcelId, 1, 14200.0, GeometrySource.MANUAL_ENTRY,
                null, null, "Desc", "Ref", null,
                submitterSummary, Instant.now(), GeometryStatus.VERIFIED, reviewerSummary, Instant.now(), "Verified",
                null, null, GeoJsonGeometry.polygon(validPolyCoords));

        when(parcelGeometryService.verify(eq(parcelId), eq(geomId), any(), any())).thenReturn(resp);

        mockMvc.perform(post("/api/v1/parcels/{parcelId}/geometries/{geomId}/verify", parcelId, geomId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VERIFIED"));
    }

    @Test
    @DisplayName("POST /api/v1/parcels/{id}/geometries/{geomId}/verify returns 403 on Four-Eyes violation")
    void returns403OnFourEyesViolation() throws Exception {
        UUID parcelId = UUID.randomUUID();
        UUID geomId = UUID.randomUUID();

        when(parcelGeometryService.verify(eq(parcelId), eq(geomId), any(), any()))
                .thenThrow(new FourEyesViolationException("Four-eyes rule violation"));

        mockMvc.perform(post("/api/v1/parcels/{parcelId}/geometries/{geomId}/verify", parcelId, geomId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FOUR_EYES_VIOLATION"));
    }

    @Test
    @DisplayName("POST /api/v1/parcels/{id}/geometries/{geomId}/reject returns 400 when reason is missing")
    void rejectsWhenReasonMissing() throws Exception {
        UUID parcelId = UUID.randomUUID();
        UUID geomId = UUID.randomUUID();

        mockMvc.perform(post("/api/v1/parcels/{parcelId}/geometries/{geomId}/reject", parcelId, geomId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
