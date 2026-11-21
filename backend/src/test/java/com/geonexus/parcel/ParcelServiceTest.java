package com.geonexus.parcel;

import com.geonexus.audit.AuditRecordRepository;
import com.geonexus.common.dto.PagedResponse;
import com.geonexus.common.error.ConflictException;
import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.ParcelGeometryRepository;
import com.geonexus.geometry.ParcelGeometryService;
import com.geonexus.parcel.dto.CreateParcelRequest;
import com.geonexus.parcel.dto.ParcelDetailResponse;
import com.geonexus.parcel.dto.ParcelFilterParams;
import com.geonexus.parcel.dto.ParcelSummaryResponse;
import com.geonexus.parcel.dto.UpdateParcelRequest;
import com.geonexus.security.Role;
import com.geonexus.security.account.UserAccount;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.user.User;
import com.geonexus.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ParcelServiceTest {

    @Mock
    private ParcelRepository parcelRepository;
    @Mock
    private ParcelGeometryRepository parcelGeometryRepository;
    @Mock
    private ParcelGeometryService parcelGeometryService;
    @Mock
    private UserRepository userRepository;
    @Mock
    private AuditRecordRepository auditRecordRepository;

    @InjectMocks
    private ParcelService parcelService;

    private User testUser;
    private AuthenticatedUser authUser;

    @BeforeEach
    void setUp() {
        testUser = new User("surveyor1", "surveyor1@geonexus.test", "S. Surveyor", "hash");
        UUID userId = UUID.randomUUID();
        ReflectionTestUtils.setField(testUser, "id", userId);
        authUser = AuthenticatedUser.from(
                new UserAccount(userId.toString(), "surveyor1", "hash",
                        Set.of(Role.SURVEYOR), true, true), false);
    }

    @Test
    @DisplayName("Lists parcels with pagination")
    void listsParcelsWithPagination() {
        Parcel p = new Parcel("PR-2024-001", "Guntur", "Andhra Pradesh", testUser, testUser);
        when(parcelRepository.findAll(any(Specification.class), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of(p)));
        when(parcelGeometryRepository.findCurrent(p.getId())).thenReturn(Optional.empty());

        PagedResponse<ParcelSummaryResponse> result =
                parcelService.listParcels(new ParcelFilterParams(null, null, null, null, null), PageRequest.of(0, 10));

        assertThat(result.content()).hasSize(1);
        assertThat(result.content().get(0).parcelCode()).isEqualTo("PR-2024-001");
        assertThat(result.totalElements()).isEqualTo(1);
    }

    @Test
    @DisplayName("Creates parcel successfully and records audit log")
    void createsParcelSuccessfully() {
        CreateParcelRequest req = new CreateParcelRequest(
                "PR-2024-002", "North Field", "Kothapeta", "Guntur", "Andhra Pradesh",
                LandUse.AGRICULTURAL, null, "EXT-99", "Notes", null);

        when(parcelRepository.existsByParcelCode("PR-2024-002")).thenReturn(false);
        when(userRepository.findById(UUID.fromString(authUser.getId()))).thenReturn(Optional.of(testUser));
        when(parcelRepository.save(any(Parcel.class))).thenAnswer(inv -> inv.getArgument(0));

        // When retrieving detail for response
        when(parcelRepository.findById(any())).thenAnswer(inv ->
                Optional.of(new Parcel("PR-2024-002", "Guntur", "Andhra Pradesh", testUser, testUser)));

        ParcelDetailResponse resp = parcelService.createParcel(req, authUser);

        assertThat(resp).isNotNull();
        assertThat(resp.parcelCode()).isEqualTo("PR-2024-002");
        verify(auditRecordRepository).save(any());
    }

    @Test
    @DisplayName("Rejects duplicate parcelCode on creation with ConflictException")
    void rejectsDuplicateParcelCode() {
        CreateParcelRequest req = new CreateParcelRequest(
                "PR-DUPLICATE", null, null, "Guntur", "AP", null, null, null, null, null);

        when(parcelRepository.existsByParcelCode("PR-DUPLICATE")).thenReturn(true);

        assertThatThrownBy(() -> parcelService.createParcel(req, authUser))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already in use");
    }

    @Test
    @DisplayName("Throws ResourceNotFoundException when parcel not found")
    void throwsNotFoundWhenParcelMissing() {
        UUID missingId = UUID.randomUUID();
        when(parcelRepository.findById(missingId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> parcelService.getParcel(missingId))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Parcel not found");
    }

    @Test
    @DisplayName("Updates parcel attributes and records update audit")
    void updatesParcelSuccessfully() {
        UUID id = UUID.randomUUID();
        Parcel existing = new Parcel("PR-2024-003", "District 1", "AP", testUser, testUser);
        ReflectionTestUtils.setField(existing, "id", id);
        UpdateParcelRequest req = new UpdateParcelRequest("Updated Name", "New Village", null, null, null, null, null, null);

        when(parcelRepository.findById(id)).thenReturn(Optional.of(existing));
        when(userRepository.findById(UUID.fromString(authUser.getId()))).thenReturn(Optional.of(testUser));
        when(parcelRepository.save(any(Parcel.class))).thenAnswer(inv -> inv.getArgument(0));

        ParcelDetailResponse resp = parcelService.updateParcel(id, req, authUser);

        assertThat(resp).isNotNull();
        assertThat(existing.getName()).isEqualTo("Updated Name");
        assertThat(existing.getVillage()).isEqualTo("New Village");
        verify(auditRecordRepository).save(any());
    }

    @Test
    @DisplayName("Rejects parcel update when user is neither the parcel owner nor an admin")
    void rejectsParcelUpdateWhenNotOwnerAndNotAdmin() {
        UUID id = UUID.randomUUID();
        User otherOwner = new User("otherUser", "other@geonexus.test", "Other Owner", "hash");
        ReflectionTestUtils.setField(otherOwner, "id", UUID.randomUUID());

        Parcel existing = new Parcel("PR-2024-004", "District 1", "AP", otherOwner, otherOwner);
        UpdateParcelRequest req = new UpdateParcelRequest("Updated Name", null, null, null, null, null, null, null);

        when(parcelRepository.findById(id)).thenReturn(Optional.of(existing));
        when(userRepository.findById(UUID.fromString(authUser.getId()))).thenReturn(Optional.of(testUser));

        assertThatThrownBy(() -> parcelService.updateParcel(id, req, authUser))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("Only the owner or an administrator can update it");
    }

    @Test
    @DisplayName("Allows parcel update when caller has ADMIN role even if not the owner")
    void allowsParcelUpdateWhenAdminEvenIfNotOwner() {
        UUID id = UUID.randomUUID();
        User otherOwner = new User("otherUser", "other@geonexus.test", "Other Owner", "hash");
        ReflectionTestUtils.setField(otherOwner, "id", UUID.randomUUID());

        Parcel existing = new Parcel("PR-2024-005", "District 1", "AP", otherOwner, otherOwner);
        ReflectionTestUtils.setField(existing, "id", id);
        UpdateParcelRequest req = new UpdateParcelRequest("Admin Override", null, null, null, null, null, null, null);

        UUID adminId = UUID.randomUUID();
        User adminUser = new User("admin1", "admin@geonexus.test", "Admin User", "hash");
        ReflectionTestUtils.setField(adminUser, "id", adminId);

        AuthenticatedUser adminAuth = AuthenticatedUser.from(
                new UserAccount(adminId.toString(), "admin1", "hash",
                        Set.of(Role.ADMIN), true, true), false);

        when(parcelRepository.findById(id)).thenReturn(Optional.of(existing));
        when(userRepository.findById(adminId)).thenReturn(Optional.of(adminUser));
        when(parcelRepository.save(any(Parcel.class))).thenAnswer(inv -> inv.getArgument(0));

        ParcelDetailResponse resp = parcelService.updateParcel(id, req, adminAuth);

        assertThat(resp).isNotNull();
        assertThat(existing.getName()).isEqualTo("Admin Override");
        verify(auditRecordRepository).save(any());
    }
}
