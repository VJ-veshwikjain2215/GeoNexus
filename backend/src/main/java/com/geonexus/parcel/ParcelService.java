package com.geonexus.parcel;

import com.geonexus.audit.AuditAction;
import com.geonexus.audit.AuditOutcome;
import com.geonexus.audit.AuditRecord;
import com.geonexus.audit.AuditRecordRepository;
import com.geonexus.common.dto.PagedResponse;
import com.geonexus.common.error.ConflictException;
import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.ParcelGeometry;
import com.geonexus.geometry.ParcelGeometryRepository;
import com.geonexus.geometry.ParcelGeometryService;
import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.geometry.geojson.GeoJsonConverter;
import com.geonexus.geometry.geojson.GeoJsonFeature;
import com.geonexus.geometry.geojson.GeoJsonFeatureCollection;
import com.geonexus.parcel.dto.CreateParcelRequest;
import com.geonexus.parcel.dto.ParcelDetailResponse;
import com.geonexus.parcel.dto.ParcelFilterParams;
import com.geonexus.parcel.dto.ParcelProperties;
import com.geonexus.parcel.dto.ParcelSummaryResponse;
import com.geonexus.parcel.dto.UpdateParcelRequest;
import com.geonexus.security.Role;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.user.User;
import com.geonexus.user.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ParcelService {

    private final ParcelRepository parcelRepository;
    private final ParcelGeometryRepository parcelGeometryRepository;
    private final ParcelGeometryService parcelGeometryService;
    private final UserRepository userRepository;
    private final AuditRecordRepository auditRecordRepository;

    public ParcelService(ParcelRepository parcelRepository,
                         ParcelGeometryRepository parcelGeometryRepository,
                         ParcelGeometryService parcelGeometryService,
                         UserRepository userRepository,
                         AuditRecordRepository auditRecordRepository) {
        this.parcelRepository = parcelRepository;
        this.parcelGeometryRepository = parcelGeometryRepository;
        this.parcelGeometryService = parcelGeometryService;
        this.userRepository = userRepository;
        this.auditRecordRepository = auditRecordRepository;
    }

    public PagedResponse<ParcelSummaryResponse> listParcels(ParcelFilterParams params, Pageable pageable) {
        Page<Parcel> page = parcelRepository.findAll(ParcelSpecifications.withFilters(params), pageable);

        List<ParcelSummaryResponse> summaries = page.getContent().stream()
                .map(p -> {
                    Optional<ParcelGeometry> cur = parcelGeometryRepository.findCurrent(p.getId());
                    Double area = cur.map(ParcelGeometry::getAreaSqM).orElse(null);
                    Integer ver = cur.map(ParcelGeometry::getVersionNo).orElse(null);
                    return ParcelSummaryResponse.from(p, area, ver);
                })
                .toList();

        return new PagedResponse<>(
                summaries,
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isLast()
        );
    }

    public ParcelDetailResponse getParcel(UUID id) {
        Parcel p = parcelRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Parcel not found: " + id));

        GeometryResponse cur = parcelGeometryRepository.findCurrent(id)
                .map(GeometryResponse::from)
                .orElse(null);

        int pendingCount = parcelGeometryRepository.findPending(id).size();

        return ParcelDetailResponse.of(p, cur, pendingCount);
    }

    public GeoJsonFeature<ParcelProperties> getParcelGeoJson(UUID id) {
        Parcel p = parcelRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Parcel not found: " + id));

        ParcelGeometry cur = parcelGeometryRepository.findCurrent(id)
                .orElseThrow(() -> new ResourceNotFoundException("No verified geometry found for parcel: " + id));

        ParcelProperties props = ParcelProperties.from(p, cur.getAreaSqM(), cur.getVersionNo());
        return new GeoJsonFeature<>(p.getId().toString(), GeoJsonConverter.toGeoJson(cur.getGeom()), props);
    }

    public GeoJsonFeatureCollection<ParcelProperties> listParcelsGeoJson(ParcelStatus status, String district) {
        ParcelFilterParams params = new ParcelFilterParams(status, district, null, null, null);
        List<Parcel> parcels = parcelRepository.findAll(ParcelSpecifications.withFilters(params));

        List<GeoJsonFeature<ParcelProperties>> features = new ArrayList<>();
        for (Parcel p : parcels) {
            Optional<ParcelGeometry> curOpt = parcelGeometryRepository.findCurrent(p.getId());
            if (curOpt.isPresent()) {
                ParcelGeometry cur = curOpt.get();
                ParcelProperties props = ParcelProperties.from(p, cur.getAreaSqM(), cur.getVersionNo());
                features.add(new GeoJsonFeature<>(p.getId().toString(), GeoJsonConverter.toGeoJson(cur.getGeom()), props));
            }
        }

        return new GeoJsonFeatureCollection<>(features);
    }

    @Transactional
    public ParcelDetailResponse createParcel(CreateParcelRequest request, AuthenticatedUser currentUser) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(currentUser, "currentUser");

        if (parcelRepository.existsByParcelCode(request.parcelCode())) {
            throw new ConflictException("DUPLICATE_PARCEL_CODE",
                    "Parcel code '" + request.parcelCode() + "' is already in use.");
        }

        User creator = userRepository.findById(UUID.fromString(currentUser.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + currentUser.getId()));

        User owner = creator;
        if (request.ownerUserId() != null) {
            if (currentUser.getRoles().contains(Role.ADMIN)) {
                owner = userRepository.findById(request.ownerUserId())
                        .orElseThrow(() -> new ResourceNotFoundException("Owner user not found: " + request.ownerUserId()));
            }
        }

        Parcel p = new Parcel(request.parcelCode(), request.district(), request.state(), owner, creator);
        if (request.name() != null) {
            p.setName(request.name());
        }
        if (request.village() != null) {
            p.setVillage(request.village());
        }
        if (request.landUse() != null) {
            p.setLandUse(request.landUse());
        }
        if (request.externalReference() != null) {
            p.setExternalReference(request.externalReference());
        }
        if (request.notes() != null) {
            p.setNotes(request.notes());
        }

        Parcel saved = parcelRepository.save(p);

        auditRecordRepository.save(AuditRecord.of(
                AuditAction.PARCEL_CREATED,
                AuditOutcome.SUCCESS,
                "PARCEL",
                saved.getId(),
                saved.getId(),
                creator.getId(),
                creator.getUsername(),
                null,
                null,
                Map.of("parcelCode", saved.getParcelCode(), "district", saved.getDistrict())
        ));

        if (request.initialGeometry() != null) {
            parcelGeometryService.propose(saved.getId(), request.initialGeometry(), currentUser);
        }

        return getParcel(saved.getId());
    }

    @Transactional
    public ParcelDetailResponse updateParcel(UUID id, UpdateParcelRequest request, AuthenticatedUser currentUser) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(currentUser, "currentUser");

        Parcel p = parcelRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Parcel not found: " + id));

        User updater = userRepository.findById(UUID.fromString(currentUser.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + currentUser.getId()));

        boolean isAdmin = currentUser.getRoles() != null && currentUser.getRoles().contains(Role.ADMIN);
        boolean isOwner = p.getOwner() != null && p.getOwner().getId() != null && p.getOwner().getId().equals(updater.getId());

        if (!isAdmin && !isOwner) {
            throw new AccessDeniedException(
                    "You do not have permission to update parcel " + p.getParcelCode()
                            + ". Only the owner or an administrator can update it.");
        }

        if (request.name() != null) {
            p.setName(request.name());
        }
        if (request.village() != null) {
            p.setVillage(request.village());
        }
        if (request.district() != null) {
            p.setDistrict(request.district());
        }
        if (request.state() != null) {
            p.setState(request.state());
        }
        if (request.landUse() != null) {
            p.setLandUse(request.landUse());
        }
        if (request.status() != null) {
            p.setStatus(request.status());
        }
        if (request.externalReference() != null) {
            p.setExternalReference(request.externalReference());
        }
        if (request.notes() != null) {
            p.setNotes(request.notes());
        }
        p.setUpdatedBy(updater);

        Parcel saved = parcelRepository.save(p);

        AuditAction action = saved.getStatus() == ParcelStatus.ARCHIVED
                ? AuditAction.PARCEL_ARCHIVED
                : AuditAction.PARCEL_UPDATED;

        auditRecordRepository.save(AuditRecord.of(
                action,
                AuditOutcome.SUCCESS,
                "PARCEL",
                saved.getId(),
                saved.getId(),
                updater.getId(),
                updater.getUsername(),
                null,
                null,
                Map.of("parcelCode", saved.getParcelCode(), "status", saved.getStatus().name())
        ));

        return getParcel(saved.getId());
    }
}
