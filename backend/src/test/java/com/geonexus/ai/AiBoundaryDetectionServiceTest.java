package com.geonexus.ai;

import com.geonexus.ai.dto.AiBoundaryDetectionRequest;
import com.geonexus.ai.dto.AiBoundaryDetectionResponse;
import com.geonexus.ai.dto.AiProposeBoundaryRequest;
import com.geonexus.common.error.ApiException;
import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.GeometryPolicy;
import com.geonexus.geometry.GeometrySource;
import com.geonexus.geometry.GeometryStatus;
import com.geonexus.geometry.ParcelGeometry;
import com.geonexus.geometry.ParcelGeometryRepository;
import com.geonexus.geometry.ParcelGeometryService;
import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.geometry.dto.ProposeGeometryRequest;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import com.geonexus.security.Role;
import com.geonexus.security.account.UserAccount;
import com.geonexus.security.auth.AuthenticatedUser;
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
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiBoundaryDetectionServiceTest {

    private static final GeometryFactory FACTORY =
            new GeometryFactory(new PrecisionModel(), GeometryPolicy.STORAGE_SRID);

    @Mock
    private ParcelRepository parcelRepository;

    @Mock
    private ParcelGeometryRepository parcelGeometryRepository;

    @Mock
    private ParcelGeometryService parcelGeometryService;

    @InjectMocks
    private AiBoundaryDetectionService aiBoundaryService;

    private UUID parcelId;
    private Parcel parcel;
    private ParcelGeometry currentGeometry;

    @BeforeEach
    void setUp() {
        parcelId = UUID.randomUUID();
        User owner = new User("owner1", "owner1@geonexus.test", "Owner One", "hash");
        User reviewer = new User("reviewer1", "reviewer1@geonexus.test", "Reviewer One", "hash");
        parcel = new Parcel("PR-2024-0412", "Guntur", "Andhra Pradesh", owner, owner);
        ReflectionTestUtils.setField(parcel, "id", parcelId);

        // Simple square parcel in Guntur, AP (EPSG:4326)
        Coordinate[] coords = new Coordinate[]{
                new Coordinate(80.4312, 16.3021),
                new Coordinate(80.4355, 16.3025),
                new Coordinate(80.4350, 16.3060),
                new Coordinate(80.4310, 16.3055),
                new Coordinate(80.4312, 16.3021)
        };
        LinearRing shell = FACTORY.createLinearRing(coords);
        Polygon poly = FACTORY.createPolygon(shell);
        MultiPolygon mp = FACTORY.createMultiPolygon(new Polygon[]{poly});
        mp.setSRID(4326);

        currentGeometry = ParcelGeometry.propose(parcel, 1, mp,
                GeometrySource.MANUAL_ENTRY, owner, null, null, "Manual baseline", null, null);
        ReflectionTestUtils.setField(currentGeometry, "areaSqM", 142850.0);
        currentGeometry.verify(reviewer, "Approved initial baseline", java.time.Instant.now());
    }

    @Test
    @DisplayName("detect returns valid candidate geometry with confidence and academic disclaimer")
    void detectSuccessful() {
        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.of(currentGeometry));

        AiBoundaryDetectionRequest request = new AiBoundaryDetectionRequest(
                0.80, 0.000015, "Synthetic 10cm Drone Orthomosaic", "CANNY_CONTOUR_V1"
        );

        AiBoundaryDetectionResponse response = aiBoundaryService.detect(parcelId, request);

        assertThat(response).isNotNull();
        assertThat(response.parcelId()).isEqualTo(parcelId);
        assertThat(response.parcelCode()).isEqualTo("PR-2024-0412");
        assertThat(response.confidence().doubleValue()).isBetween(0.70, 0.98);
        assertThat(response.qualityScore()).isGreaterThan(0.7);
        assertThat(response.edgeSharpness()).isGreaterThan(0.8);
        assertThat(response.detectedGeometry()).isNotNull();
        assertThat(response.detectedStations()).isNotEmpty();
        assertThat(response.academicDisclaimer()).contains("ACADEMIC EXPERIMENTAL AID");
        assertThat(response.status()).isEqualTo("PROPOSED_ASSISTIVE_DRAFT");
    }

    @Test
    @DisplayName("detect throws ResourceNotFoundException when parcel does not exist")
    void detectMissingParcelThrows() {
        when(parcelRepository.findById(parcelId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> aiBoundaryService.detect(parcelId, null))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Parcel not found");
    }

    @Test
    @DisplayName("detect throws ApiException when parcel has no verified geometry")
    void detectUnsurveyedParcelThrows() {
        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> aiBoundaryService.detect(parcelId, null))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("Cannot execute boundary detection on unsurveyed parcel");
    }

    @Test
    @DisplayName("propose converts cached AI detection into formal proposal with AI_DETECTED source")
    void proposeSuccessful() {
        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.of(currentGeometry));

        // First run detection to cache result
        AiBoundaryDetectionResponse detected = aiBoundaryService.detect(parcelId, null);

        AuthenticatedUser surveyor = AuthenticatedUser.from(
                new UserAccount(UUID.randomUUID().toString(), "surveyor1", "hash",
                        Set.of(Role.SURVEYOR), true, true), false);

        GeometryResponse mockGeomResponse = new GeometryResponse(
                UUID.randomUUID(), parcelId, 2, detected.detectedAreaSqM(),
                GeometrySource.AI_DETECTED, null, currentGeometry.getId(),
                "AI boundary detection", "Synthetic Drone Tile", detected.confidence(),
                null, null, GeometryStatus.PROPOSED, null, null, null, null, null, detected.detectedGeometry()
        );

        when(parcelGeometryService.propose(eq(parcelId), any(ProposeGeometryRequest.class), eq(surveyor)))
                .thenReturn(mockGeomResponse);

        AiProposeBoundaryRequest proposeReq = new AiProposeBoundaryRequest(
                detected.detectionId(), "Surveyor field verification accepted edge proposal"
        );

        GeometryResponse result = aiBoundaryService.propose(parcelId, proposeReq, surveyor);

        assertThat(result).isNotNull();
        assertThat(result.source()).isEqualTo(GeometrySource.AI_DETECTED);

        ArgumentCaptor<ProposeGeometryRequest> captor = ArgumentCaptor.forClass(ProposeGeometryRequest.class);
        verify(parcelGeometryService).propose(eq(parcelId), captor.capture(), eq(surveyor));

        ProposeGeometryRequest captured = captor.getValue();
        assertThat(captured.source()).isEqualTo(GeometrySource.AI_DETECTED);
        assertThat(captured.confidence()).isEqualTo(detected.confidence());
        assertThat(captured.basedOnGeometryId()).isEqualTo(currentGeometry.getId());
    }
}
