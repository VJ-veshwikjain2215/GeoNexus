package com.geonexus.parcel;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.geonexus.common.dto.PagedResponse;
import com.geonexus.common.error.GlobalExceptionHandler;
import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.SpatialAnalysisService;
import com.geonexus.geometry.dto.SpatialAnalysisResponse;
import com.geonexus.geometry.dto.StationDisplacement;
import com.geonexus.parcel.dto.CreateParcelRequest;
import com.geonexus.parcel.dto.ParcelDetailResponse;
import com.geonexus.parcel.dto.ParcelSummaryResponse;
import com.geonexus.parcel.dto.UpdateParcelRequest;
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
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class ParcelControllerTest {

    private MockMvc mockMvc;

    @Mock
    private ParcelService parcelService;

    @Mock
    private SpatialAnalysisService spatialAnalysisService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @InjectMocks
    private ParcelController parcelController;

    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    private AuthenticatedUser mockUser;

    @BeforeEach
    void setUp() {
        mockUser = AuthenticatedUser.from(
                new UserAccount(UUID.randomUUID().toString(), "surveyor1", "hash",
                        Set.of(Role.SURVEYOR), true, true), false);

        // Custom resolver for @AuthenticationPrincipal in standalone MockMvc
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

        mockMvc = MockMvcBuilders.standaloneSetup(parcelController)
                .setControllerAdvice(new GlobalExceptionHandler(eventPublisher))
                .setCustomArgumentResolvers(new PageableHandlerMethodArgumentResolver(), authPrincipalResolver)
                .build();
    }

    @Test
    @DisplayName("GET /api/v1/parcels returns paginated list")
    void listsParcels() throws Exception {
        ParcelSummaryResponse item = new ParcelSummaryResponse(
                UUID.randomUUID(), "PR-2024-001", "Field 1", "Kothapeta", "Guntur", "AP",
                LandUse.AGRICULTURAL, ParcelStatus.DRAFT, "REF-1", 14200.0, 1,
                Instant.now(), Instant.now());
        PagedResponse<ParcelSummaryResponse> paged = new PagedResponse<>(List.of(item), 0, 20, 1, 1, true);

        when(parcelService.listParcels(any(), any())).thenReturn(paged);

        mockMvc.perform(get("/api/v1/parcels").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].parcelCode").value("PR-2024-001"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    @DisplayName("GET /api/v1/parcels/{id} returns parcel details")
    void getsParcelDetails() throws Exception {
        UUID id = UUID.randomUUID();
        UserSummary userSummary = new UserSummary(mockUser.getId(), mockUser.getUsername(), List.of(Role.SURVEYOR));
        ParcelDetailResponse detail = new ParcelDetailResponse(
                id, "PR-2024-001", "Field 1", "Kothapeta", "Guntur", "AP",
                LandUse.AGRICULTURAL, ParcelStatus.DRAFT, "REF-1", "Notes",
                userSummary, userSummary, null, null, 0,
                Instant.now(), Instant.now(), 0L);

        when(parcelService.getParcel(id)).thenReturn(detail);

        mockMvc.perform(get("/api/v1/parcels/{id}", id).accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.parcelCode").value("PR-2024-001"));
    }

    @Test
    @DisplayName("GET /api/v1/parcels/{id} returns 404 when not found")
    void returns404WhenMissing() throws Exception {
        UUID id = UUID.randomUUID();
        when(parcelService.getParcel(id)).thenThrow(new ResourceNotFoundException("Parcel not found: " + id));

        mockMvc.perform(get("/api/v1/parcels/{id}", id).accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @DisplayName("POST /api/v1/parcels returns 201 on valid input")
    void createsParcel() throws Exception {
        CreateParcelRequest req = new CreateParcelRequest(
                "PR-2024-NEW", "Name", "Village", "District", "State",
                LandUse.AGRICULTURAL, null, null, null, null);
        UserSummary userSummary = new UserSummary(mockUser.getId(), mockUser.getUsername(), List.of(Role.SURVEYOR));
        ParcelDetailResponse detail = new ParcelDetailResponse(
                UUID.randomUUID(), "PR-2024-NEW", "Name", "Village", "District", "State",
                LandUse.AGRICULTURAL, ParcelStatus.DRAFT, null, null,
                userSummary, userSummary, null, null, 0,
                Instant.now(), Instant.now(), 0L);

        when(parcelService.createParcel(any(), any())).thenReturn(detail);

        mockMvc.perform(post("/api/v1/parcels")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.parcelCode").value("PR-2024-NEW"));
    }

    @Test
    @DisplayName("POST /api/v1/parcels returns 400 when parcelCode is blank")
    void rejectsBlankParcelCode() throws Exception {
        CreateParcelRequest req = new CreateParcelRequest(
                "", "Name", "Village", "District", "State",
                LandUse.AGRICULTURAL, null, null, null, null);

        mockMvc.perform(post("/api/v1/parcels")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("PUT /api/v1/parcels/{id} updates parcel")
    void updatesParcel() throws Exception {
        UUID id = UUID.randomUUID();
        UpdateParcelRequest req = new UpdateParcelRequest("Updated Name", null, null, null, null, null, null, null);
        UserSummary userSummary = new UserSummary(mockUser.getId(), mockUser.getUsername(), List.of(Role.SURVEYOR));
        ParcelDetailResponse detail = new ParcelDetailResponse(
                id, "PR-2024-001", "Updated Name", "Village", "District", "State",
                LandUse.AGRICULTURAL, ParcelStatus.DRAFT, null, null,
                userSummary, userSummary, null, null, 0,
                Instant.now(), Instant.now(), 1L);

        when(parcelService.updateParcel(eq(id), any(), any())).thenReturn(detail);

        mockMvc.perform(put("/api/v1/parcels/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated Name"));
    }

    @Test
    @DisplayName("GET /api/v1/parcels/{id}/spatial-analysis returns dossier")
    void getSpatialAnalysis() throws Exception {
        UUID id = UUID.randomUUID();
        SpatialAnalysisResponse analysis = new SpatialAnalysisResponse(
                id, "PR-2024-0412", 142850.0, 14.285, 144120.0, 14.412,
                1270.0, 0.89, 1894.20, 18, true, 0.002, 0, 0,
                List.of(), 0, 2.4, 1.1,
                List.of(new StationDisplacement("ST-01", 80.4312, 16.3021, 80.431, 16.3024, 1.2))
        );

        when(spatialAnalysisService.analyze(id)).thenReturn(analysis);

        mockMvc.perform(get("/api/v1/parcels/{id}/spatial-analysis", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parcelCode").value("PR-2024-0412"))
                .andExpect(jsonPath("$.recordedAreaHa").value(14.285))
                .andExpect(jsonPath("$.perimeterM").value(1894.20))
                .andExpect(jsonPath("$.isValidTopology").value(true));
    }
}
