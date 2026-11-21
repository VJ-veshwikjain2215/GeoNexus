package com.geonexus.geometry;

import com.geonexus.common.error.ApiException;
import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.dto.GeometryResponse;
import com.geonexus.geometry.dto.ProposeGeometryRequest;
import com.geonexus.geometry.dto.RejectGeometryRequest;
import com.geonexus.geometry.dto.ReviewDecisionRequest;
import com.geonexus.geometry.geojson.GeoJsonConverter;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.survey.Survey;
import com.geonexus.survey.SurveyRepository;
import com.geonexus.user.User;
import com.geonexus.user.UserRepository;
import org.locationtech.jts.geom.MultiPolygon;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ParcelGeometryService {

    private final ParcelGeometryRepository parcelGeometryRepository;
    private final ParcelRepository parcelRepository;
    private final SurveyRepository surveyRepository;
    private final UserRepository userRepository;

    public ParcelGeometryService(ParcelGeometryRepository parcelGeometryRepository,
                                 ParcelRepository parcelRepository,
                                 SurveyRepository surveyRepository,
                                 UserRepository userRepository) {
        this.parcelGeometryRepository = parcelGeometryRepository;
        this.parcelRepository = parcelRepository;
        this.surveyRepository = surveyRepository;
        this.userRepository = userRepository;
    }

    public List<GeometryResponse> getHistory(UUID parcelId) {
        requireParcelExists(parcelId);
        return parcelGeometryRepository.findHistory(parcelId).stream()
                .map(GeometryResponse::from)
                .toList();
    }

    public GeometryResponse getById(UUID parcelId, UUID geometryId) {
        return parcelGeometryRepository.findByIdAndParcelId(geometryId, parcelId)
                .map(GeometryResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("Geometry version not found: " + geometryId));
    }

    public GeometryResponse getByVersion(UUID parcelId, int versionNo) {
        requireParcelExists(parcelId);
        return parcelGeometryRepository.findByParcelIdAndVersionNo(parcelId, versionNo)
                .map(GeometryResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("Geometry version " + versionNo + " not found for parcel " + parcelId));
    }

    public GeometryResponse getCurrent(UUID parcelId) {
        requireParcelExists(parcelId);
        return parcelGeometryRepository.findCurrent(parcelId)
                .map(GeometryResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("No verified geometry found for parcel " + parcelId));
    }

    @Transactional
    public GeometryResponse propose(UUID parcelId, ProposeGeometryRequest request, AuthenticatedUser currentUser) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(currentUser, "currentUser");

        Parcel parcel = parcelRepository.findByIdForUpdate(parcelId)
                .orElseThrow(() -> new ResourceNotFoundException("Parcel not found: " + parcelId));

        User creator = userRepository.findById(UUID.fromString(currentUser.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + currentUser.getId()));

        MultiPolygon multiPolygon = GeoJsonConverter.toJts(request.geometry());

        Optional<ParcelGeometry> currentVerified = parcelGeometryRepository.findCurrent(parcelId);
        ParcelGeometry basedOn = null;

        if (currentVerified.isPresent()) {
            if (request.basedOnGeometryId() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_BASED_ON",
                        "New boundary proposal must reference the current verified boundary version ("
                                + currentVerified.get().getVersionNo() + ")");
            }
            if (!currentVerified.get().getId().equals(request.basedOnGeometryId())) {
                throw new StaleBaseGeometryException(
                        "The proposal is based on a boundary that is no longer current; re-propose against version "
                                + currentVerified.get().getVersionNo());
            }
            basedOn = currentVerified.get();
        } else if (request.basedOnGeometryId() != null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BASED_ON",
                    "Initial boundary proposal cannot reference a previous boundary");
        }

        Survey survey = null;
        if (request.source() == GeometrySource.SURVEY) {
            if (request.surveyId() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "MISSING_SURVEY",
                        "A SURVEY boundary must reference its survey");
            }
            survey = surveyRepository.findByIdAndParcelId(request.surveyId(), parcelId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Survey " + request.surveyId() + " not found for parcel " + parcelId));
        }

        if (request.confidence() != null && request.source() != GeometrySource.AI_DETECTED) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CONFIDENCE",
                    "Confidence is only recorded for AI_DETECTED boundaries");
        }

        int nextVer = parcelGeometryRepository.nextVersionNo(parcelId);
        ParcelGeometry proposal = ParcelGeometry.propose(
                parcel,
                nextVer,
                multiPolygon,
                request.source(),
                creator,
                survey,
                basedOn,
                request.sourceDescription(),
                request.sourceReference(),
                request.confidence()
        );

        ParcelGeometry saved = parcelGeometryRepository.save(proposal);
        parcelGeometryRepository.flush();

        return GeometryResponse.from(saved);
    }

    @Transactional
    public GeometryResponse verify(UUID parcelId, UUID geometryId, ReviewDecisionRequest request, AuthenticatedUser currentUser) {
        Objects.requireNonNull(currentUser, "currentUser");

        parcelRepository.findByIdForUpdate(parcelId)
                .orElseThrow(() -> new ResourceNotFoundException("Parcel not found: " + parcelId));

        ParcelGeometry geometry = parcelGeometryRepository.findByIdAndParcelId(geometryId, parcelId)
                .orElseThrow(() -> new ResourceNotFoundException("Geometry proposal not found: " + geometryId));

        if (geometry.getStatus() != GeometryStatus.PROPOSED) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATUS",
                    "Only PROPOSED geometry can be reviewed (current status: " + geometry.getStatus() + ")");
        }

        User reviewer = userRepository.findById(UUID.fromString(currentUser.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + currentUser.getId()));

        if (geometry.getCreatedBy() != null && geometry.getCreatedBy().getId().equals(reviewer.getId())) {
            throw new FourEyesViolationException(
                    "Four-eyes rule violation: A boundary proposal cannot be reviewed by the user who submitted it.");
        }

        Optional<ParcelGeometry> currentVerified = parcelGeometryRepository.findCurrent(parcelId);
        UUID currentVerifiedId = currentVerified.map(ParcelGeometry::getId).orElse(null);
        UUID basedOnId = geometry.getBasedOn() != null ? geometry.getBasedOn().getId() : null;

        if (!Objects.equals(currentVerifiedId, basedOnId)) {
            throw new StaleBaseGeometryException(
                    "Version " + geometry.getVersionNo()
                            + " is based on a boundary that is no longer current; re-propose against current verified boundary");
        }

        String notes = request != null ? request.notes() : null;
        geometry.verify(reviewer, notes, Instant.now());

        ParcelGeometry saved = parcelGeometryRepository.save(geometry);
        parcelGeometryRepository.flush();

        return GeometryResponse.from(saved);
    }

    @Transactional
    public GeometryResponse reject(UUID parcelId, UUID geometryId, RejectGeometryRequest request, AuthenticatedUser currentUser) {
        Objects.requireNonNull(request, "request");
        Objects.requireNonNull(currentUser, "currentUser");

        parcelRepository.findByIdForUpdate(parcelId)
                .orElseThrow(() -> new ResourceNotFoundException("Parcel not found: " + parcelId));

        ParcelGeometry geometry = parcelGeometryRepository.findByIdAndParcelId(geometryId, parcelId)
                .orElseThrow(() -> new ResourceNotFoundException("Geometry proposal not found: " + geometryId));

        if (geometry.getStatus() != GeometryStatus.PROPOSED) {
            throw new ApiException(HttpStatus.CONFLICT, "INVALID_STATUS",
                    "Only PROPOSED geometry can be reviewed (current status: " + geometry.getStatus() + ")");
        }

        User reviewer = userRepository.findById(UUID.fromString(currentUser.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + currentUser.getId()));

        if (geometry.getCreatedBy() != null && geometry.getCreatedBy().getId().equals(reviewer.getId())) {
            throw new FourEyesViolationException(
                    "Four-eyes rule violation: A boundary proposal cannot be reviewed by the user who submitted it.");
        }

        geometry.reject(reviewer, request.reason(), Instant.now());

        ParcelGeometry saved = parcelGeometryRepository.save(geometry);
        parcelGeometryRepository.flush();

        return GeometryResponse.from(saved);
    }

    private void requireParcelExists(UUID parcelId) {
        if (!parcelRepository.existsById(parcelId)) {
            throw new ResourceNotFoundException("Parcel not found: " + parcelId);
        }
    }
}
