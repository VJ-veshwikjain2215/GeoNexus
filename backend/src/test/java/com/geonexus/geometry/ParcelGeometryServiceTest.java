package com.geonexus.geometry;

import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.geometry.dto.ProposeGeometryRequest;
import com.geonexus.geometry.dto.RejectGeometryRequest;
import com.geonexus.geometry.dto.ReviewDecisionRequest;
import com.geonexus.geometry.geojson.GeoJsonGeometry;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import com.geonexus.security.Role;
import com.geonexus.security.account.UserAccount;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.survey.SurveyRepository;
import com.geonexus.user.User;
import com.geonexus.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ParcelGeometryServiceTest {

    @Mock
    private ParcelGeometryRepository parcelGeometryRepository;
    @Mock
    private ParcelRepository parcelRepository;
    @Mock
    private SurveyRepository surveyRepository;
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private ParcelGeometryService parcelGeometryService;

    private User submitter;
    private User reviewer;
    private AuthenticatedUser submitterAuth;
    private AuthenticatedUser reviewerAuth;
    private Parcel parcel;

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
        submitter = new User("surveyor1", "surveyor1@geonexus.test", "S. Surveyor", "hash");
        reviewer = new User("reviewer1", "reviewer1@geonexus.test", "R. Reviewer", "hash");

        UUID submitterId = UUID.randomUUID();
        UUID reviewerId = UUID.randomUUID();

        // Inject IDs using reflection or test sub-classes if id is generated
        org.springframework.test.util.ReflectionTestUtils.setField(submitter, "id", submitterId);
        org.springframework.test.util.ReflectionTestUtils.setField(reviewer, "id", reviewerId);

        submitterAuth = AuthenticatedUser.from(
                new UserAccount(submitterId.toString(), "surveyor1", "hash",
                        Set.of(Role.SURVEYOR), true, true), false);
        reviewerAuth = AuthenticatedUser.from(
                new UserAccount(reviewerId.toString(), "reviewer1", "hash",
                        Set.of(Role.REVIEWER), true, true), false);

        parcel = new Parcel("PR-2024-TEST", "Guntur", "Andhra Pradesh", submitter, submitter);
    }

    @Test
    @DisplayName("Proposes first boundary version successfully")
    void proposesFirstBoundaryVersion() {
        UUID parcelId = UUID.randomUUID();
        ProposeGeometryRequest req = new ProposeGeometryRequest(
                GeoJsonGeometry.polygon(validPolyCoords),
                GeometrySource.MANUAL_ENTRY,
                null, null, "Manual digitisation", "Field book #1", null);

        when(parcelRepository.findByIdForUpdate(parcelId)).thenReturn(Optional.of(parcel));
        when(userRepository.findById(UUID.fromString(submitterAuth.getId()))).thenReturn(Optional.of(submitter));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.empty());
        when(parcelGeometryRepository.nextVersionNo(parcelId)).thenReturn(1);
        when(parcelGeometryRepository.save(any(ParcelGeometry.class))).thenAnswer(inv -> inv.getArgument(0));

        GeometryResponse resp = parcelGeometryService.propose(parcelId, req, submitterAuth);

        assertThat(resp).isNotNull();
        assertThat(resp.versionNo()).isEqualTo(1);
        assertThat(resp.status()).isEqualTo(GeometryStatus.PROPOSED);
        assertThat(resp.source()).isEqualTo(GeometrySource.MANUAL_ENTRY);
        verify(parcelGeometryRepository).flush();
    }

    @Test
    @DisplayName("Enforces Four-Eyes: reviewer cannot be the proposal submitter on verify")
    void enforcesFourEyesOnVerify() {
        UUID parcelId = UUID.randomUUID();
        UUID geometryId = UUID.randomUUID();

        ParcelGeometry proposal = ParcelGeometry.propose(
                parcel, 1,
                com.geonexus.geometry.geojson.GeoJsonConverter.toJts(GeoJsonGeometry.polygon(validPolyCoords)),
                GeometrySource.MANUAL_ENTRY, submitter, null, null, null, null, null);

        when(parcelRepository.findByIdForUpdate(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findByIdAndParcelId(geometryId, parcelId)).thenReturn(Optional.of(proposal));
        when(userRepository.findById(UUID.fromString(submitterAuth.getId()))).thenReturn(Optional.of(submitter));

        // Submitter attempts to verify own proposal
        assertThatThrownBy(() -> parcelGeometryService.verify(parcelId, geometryId,
                new ReviewDecisionRequest("Self approval"), submitterAuth))
                .isInstanceOf(FourEyesViolationException.class)
                .hasMessageContaining("Four-eyes rule violation");
    }

    @Test
    @DisplayName("Reviewer successfully verifies proposal submitted by different user")
    void reviewerVerifiesProposal() {
        UUID parcelId = UUID.randomUUID();
        UUID geometryId = UUID.randomUUID();

        ParcelGeometry proposal = ParcelGeometry.propose(
                parcel, 1,
                com.geonexus.geometry.geojson.GeoJsonConverter.toJts(GeoJsonGeometry.polygon(validPolyCoords)),
                GeometrySource.MANUAL_ENTRY, submitter, null, null, null, null, null);

        when(parcelRepository.findByIdForUpdate(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findByIdAndParcelId(geometryId, parcelId)).thenReturn(Optional.of(proposal));
        when(userRepository.findById(UUID.fromString(reviewerAuth.getId()))).thenReturn(Optional.of(reviewer));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.empty()); // basedOn was null
        when(parcelGeometryRepository.save(any(ParcelGeometry.class))).thenAnswer(inv -> inv.getArgument(0));

        GeometryResponse resp = parcelGeometryService.verify(parcelId, geometryId,
                new ReviewDecisionRequest("Approved after audit"), reviewerAuth);

        assertThat(resp).isNotNull();
        assertThat(resp.status()).isEqualTo(GeometryStatus.VERIFIED);
        assertThat(resp.reviewNotes()).isEqualTo("Approved after audit");
        verify(parcelGeometryRepository).flush();
    }

    @Test
    @DisplayName("Reviewer rejects proposal with mandatory reason")
    void reviewerRejectsProposal() {
        UUID parcelId = UUID.randomUUID();
        UUID geometryId = UUID.randomUUID();

        ParcelGeometry proposal = ParcelGeometry.propose(
                parcel, 1,
                com.geonexus.geometry.geojson.GeoJsonConverter.toJts(GeoJsonGeometry.polygon(validPolyCoords)),
                GeometrySource.MANUAL_ENTRY, submitter, null, null, null, null, null);

        when(parcelRepository.findByIdForUpdate(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findByIdAndParcelId(geometryId, parcelId)).thenReturn(Optional.of(proposal));
        when(userRepository.findById(UUID.fromString(reviewerAuth.getId()))).thenReturn(Optional.of(reviewer));
        when(parcelGeometryRepository.save(any(ParcelGeometry.class))).thenAnswer(inv -> inv.getArgument(0));

        GeometryResponse resp = parcelGeometryService.reject(parcelId, geometryId,
                new RejectGeometryRequest("Discrepancy exceeds threshold"), reviewerAuth);

        assertThat(resp).isNotNull();
        assertThat(resp.status()).isEqualTo(GeometryStatus.REJECTED);
        assertThat(resp.reviewNotes()).isEqualTo("Discrepancy exceeds threshold");
    }

    @Test
    @DisplayName("Enforces Four-Eyes: reviewer cannot reject own proposal")
    void enforcesFourEyesOnReject() {
        UUID parcelId = UUID.randomUUID();
        UUID geometryId = UUID.randomUUID();

        ParcelGeometry proposal = ParcelGeometry.propose(
                parcel, 1,
                com.geonexus.geometry.geojson.GeoJsonConverter.toJts(GeoJsonGeometry.polygon(validPolyCoords)),
                GeometrySource.MANUAL_ENTRY, submitter, null, null, null, null, null);

        when(parcelRepository.findByIdForUpdate(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findByIdAndParcelId(geometryId, parcelId)).thenReturn(Optional.of(proposal));
        when(userRepository.findById(UUID.fromString(submitterAuth.getId()))).thenReturn(Optional.of(submitter));

        assertThatThrownBy(() -> parcelGeometryService.reject(parcelId, geometryId,
                new RejectGeometryRequest("Cancel"), submitterAuth))
                .isInstanceOf(FourEyesViolationException.class)
                .hasMessageContaining("Four-eyes rule violation");
    }
}
