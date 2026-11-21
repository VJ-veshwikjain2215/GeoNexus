package com.geonexus.geometry;

import com.geonexus.common.error.ResourceNotFoundException;
import com.geonexus.geometry.dto.SpatialAnalysisResponse;
import com.geonexus.parcel.Parcel;
import com.geonexus.parcel.ParcelRepository;
import com.geonexus.user.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.LinearRing;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.geom.Polygon;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SpatialAnalysisServiceTest {

    @Mock
    private ParcelRepository parcelRepository;

    @Mock
    private ParcelGeometryRepository parcelGeometryRepository;

    @InjectMocks
    private SpatialAnalysisService spatialAnalysisService;

    private static final GeometryFactory GF = new GeometryFactory(new PrecisionModel(), 4326);

    private MultiPolygon createPolygon(Coordinate[] coords) {
        LinearRing ring = GF.createLinearRing(coords);
        Polygon poly = GF.createPolygon(ring);
        return GF.createMultiPolygon(new Polygon[]{poly});
    }

    @Test
    @DisplayName("analyze computes perimeter, area delta, and caliper station displacements")
    void analyzeComputesSpatialMetrics() {
        UUID parcelId = UUID.randomUUID();
        User owner = new User("owner1", "owner1@geonexus.test", "Owner One", "hash");
        User reviewer = new User("reviewer1", "reviewer1@geonexus.test", "Reviewer One", "hash");
        Parcel parcel = new Parcel("PR-2024-0412", "Guntur", "Andhra Pradesh", owner, owner);

        Coordinate[] recCoords = new Coordinate[]{
                new Coordinate(80.4312, 16.3021),
                new Coordinate(80.4355, 16.3025),
                new Coordinate(80.4348, 16.2985),
                new Coordinate(80.4305, 16.2981),
                new Coordinate(80.4312, 16.3021)
        };
        MultiPolygon recGeom = createPolygon(recCoords);
        ParcelGeometry currentGeom = ParcelGeometry.propose(parcel, 1, recGeom,
                GeometrySource.MANUAL_ENTRY, owner, null, null, "Manual digitisation", null, null);
        ReflectionTestUtils.setField(currentGeom, "areaSqM", 142850.0);
        currentGeom.verify(reviewer, "Approved initial baseline", Instant.now());

        Coordinate[] propCoords = new Coordinate[]{
                new Coordinate(80.4310, 16.3023),
                new Coordinate(80.4357, 16.3027),
                new Coordinate(80.4349, 16.2984),
                new Coordinate(80.4303, 16.2980),
                new Coordinate(80.4310, 16.3023)
        };
        MultiPolygon propGeom = createPolygon(propCoords);
        ParcelGeometry proposedGeom = ParcelGeometry.propose(parcel, 2, propGeom,
                GeometrySource.MANUAL_ENTRY, owner, null, currentGeom, "Digital traverse", null, null);
        ReflectionTestUtils.setField(proposedGeom, "areaSqM", 144120.0);

        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.of(currentGeom));
        when(parcelGeometryRepository.findPending(parcelId)).thenReturn(List.of(proposedGeom));
        when(parcelGeometryRepository.findCurrentOverlapping(any(), eq(parcelId))).thenReturn(List.of());

        SpatialAnalysisResponse resp = spatialAnalysisService.analyze(parcelId);

        assertThat(resp).isNotNull();
        assertThat(resp.parcelCode()).isEqualTo("PR-2024-0412");
        assertThat(resp.recordedAreaHa()).isEqualTo(14.285);
        assertThat(resp.proposedAreaHa()).isEqualTo(14.412);
        assertThat(resp.areaDeltaSqM()).isEqualTo(1270.0);
        assertThat(resp.areaDeltaPercentage()).isEqualTo(0.89);
        assertThat(resp.perimeterM()).isGreaterThan(1000.0);
        assertThat(resp.isValidTopology()).isTrue();
        assertThat(resp.stationCount()).isEqualTo(4);
        assertThat(resp.maxDisplacementM()).isGreaterThan(0.0);
        assertThat(resp.stationDisplacements()).isNotEmpty();
        assertThat(resp.stationDisplacements().get(0).station()).isEqualTo("ST-01");
        assertThat(resp.polygonClosureDeltaM()).isEqualTo(0.0);

        // Verify that proposed geometry was tested for overlaps (GEO-02)
        verify(parcelGeometryRepository).findCurrentOverlapping(eq(propGeom.toText()), eq(parcelId));
    }

    @Test
    @DisplayName("calculateSpheroidalAreaSqM calculates accurate spherical area on WGS 84 (GEO-01)")
    void calculateSpheroidalAreaAccurate() {
        // ~100m x ~100m patch in Guntur (16.3 deg lat):
        // 0.001 deg lat = ~110.6 m
        // 0.001 deg lon at 16.3 deg lat = 111.32 * cos(16.3 deg) = ~106.8 m
        // Expected area ~= 110.6 * 106.8 ~= 11,812 m²
        Coordinate[] boxCoords = new Coordinate[]{
                new Coordinate(80.4300, 16.3000),
                new Coordinate(80.4310, 16.3000),
                new Coordinate(80.4310, 16.3010),
                new Coordinate(80.4300, 16.3010),
                new Coordinate(80.4300, 16.3000)
        };
        MultiPolygon box = createPolygon(boxCoords);

        double areaSqM = SpatialAnalysisService.calculateSpheroidalAreaSqM(box);

        assertThat(areaSqM).isBetween(11700.0, 11950.0);
    }

    @Test
    @DisplayName("nearest-neighbor station matching pairs closest vertices correctly (GEO-03)")
    void nearestNeighborStationMatching() {
        UUID parcelId = UUID.randomUUID();
        User owner = new User("owner1", "owner1@geonexus.test", "Owner One", "hash");
        Parcel parcel = new Parcel("PR-2024-0412", "Guntur", "Andhra Pradesh", owner, owner);

        Coordinate[] recCoords = new Coordinate[]{
                new Coordinate(80.4312, 16.3021),
                new Coordinate(80.4355, 16.3025),
                new Coordinate(80.4348, 16.2985),
                new Coordinate(80.4305, 16.2981),
                new Coordinate(80.4312, 16.3021)
        };
        MultiPolygon recGeom = createPolygon(recCoords);
        ParcelGeometry currentGeom = ParcelGeometry.propose(parcel, 1, recGeom,
                GeometrySource.MANUAL_ENTRY, owner, null, null, "Manual digitisation", null, null);

        // Permuted starting vertex in proposed geometry
        Coordinate[] propCoords = new Coordinate[]{
                new Coordinate(80.4356, 16.3026), // Nearest to recCoords[1]
                new Coordinate(80.4349, 16.2984), // Nearest to recCoords[2]
                new Coordinate(80.4304, 16.2980), // Nearest to recCoords[3]
                new Coordinate(80.4311, 16.3022), // Nearest to recCoords[0]
                new Coordinate(80.4356, 16.3026)
        };
        MultiPolygon propGeom = createPolygon(propCoords);
        ParcelGeometry proposedGeom = ParcelGeometry.propose(parcel, 2, propGeom,
                GeometrySource.MANUAL_ENTRY, owner, null, currentGeom, "Resurvey", null, null);

        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.of(currentGeom));
        when(parcelGeometryRepository.findPending(parcelId)).thenReturn(List.of(proposedGeom));
        when(parcelGeometryRepository.findCurrentOverlapping(any(), eq(parcelId))).thenReturn(List.of());

        SpatialAnalysisResponse resp = spatialAnalysisService.analyze(parcelId);

        assertThat(resp.stationDisplacements()).hasSize(4);
        // ST-01 should match with nearest coordinate (80.4355, 16.3025) which is ~15m away, NOT (80.4312, 16.3021) which is ~460m away
        assertThat(resp.stationDisplacements().get(0).shiftDistanceM()).isLessThan(30.0);
    }

    @Test
    @DisplayName("analyze detects proposed-geometry overlaps with neighboring parcels (GEO-02)")
    void analyzeDetectsProposedOverlaps() {
        UUID parcelId = UUID.randomUUID();
        User owner = new User("owner1", "owner1@geonexus.test", "Owner One", "hash");
        Parcel parcel = new Parcel("PR-2024-0412", "Guntur", "Andhra Pradesh", owner, owner);

        Parcel neighborParcel = new Parcel("PR-2024-0413", "Guntur", "Andhra Pradesh", owner, owner);
        ReflectionTestUtils.setField(neighborParcel, "id", UUID.randomUUID());

        Coordinate[] recCoords = new Coordinate[]{
                new Coordinate(80.4300, 16.3000),
                new Coordinate(80.4320, 16.3000),
                new Coordinate(80.4320, 16.3020),
                new Coordinate(80.4300, 16.3020),
                new Coordinate(80.4300, 16.3000)
        };
        ParcelGeometry currentGeom = ParcelGeometry.propose(parcel, 1, createPolygon(recCoords),
                GeometrySource.MANUAL_ENTRY, owner, null, null, "Base", null, null);

        // Proposed geometry extends east to 80.4330
        Coordinate[] propCoords = new Coordinate[]{
                new Coordinate(80.4300, 16.3000),
                new Coordinate(80.4330, 16.3000),
                new Coordinate(80.4330, 16.3020),
                new Coordinate(80.4300, 16.3020),
                new Coordinate(80.4300, 16.3000)
        };
        ParcelGeometry proposedGeom = ParcelGeometry.propose(parcel, 2, createPolygon(propCoords),
                GeometrySource.MANUAL_ENTRY, owner, null, currentGeom, "Proposed", null, null);

        // Neighbor overlaps between 80.4320 and 80.4330
        Coordinate[] neighborCoords = new Coordinate[]{
                new Coordinate(80.4320, 16.3000),
                new Coordinate(80.4340, 16.3000),
                new Coordinate(80.4340, 16.3020),
                new Coordinate(80.4320, 16.3020),
                new Coordinate(80.4320, 16.3000)
        };
        ParcelGeometry neighborGeom = ParcelGeometry.propose(neighborParcel, 1, createPolygon(neighborCoords),
                GeometrySource.MANUAL_ENTRY, owner, null, null, "Neighbor", null, null);

        when(parcelRepository.findById(parcelId)).thenReturn(Optional.of(parcel));
        when(parcelGeometryRepository.findCurrent(parcelId)).thenReturn(Optional.of(currentGeom));
        when(parcelGeometryRepository.findPending(parcelId)).thenReturn(List.of(proposedGeom));
        when(parcelGeometryRepository.findCurrentOverlapping(any(), eq(parcelId))).thenReturn(List.of(neighborGeom));

        SpatialAnalysisResponse resp = spatialAnalysisService.analyze(parcelId);

        assertThat(resp.overlappingParcelsCount()).isEqualTo(1);
        assertThat(resp.overlappingParcels().get(0).parcelCode()).isEqualTo("PR-2024-0413");
        assertThat(resp.overlappingParcels().get(0).overlapAreaSqM()).isGreaterThan(0.0);
    }

    @Test
    @DisplayName("analyze throws ResourceNotFoundException when parcel is missing")
    void analyzeMissingParcel() {
        UUID parcelId = UUID.randomUUID();
        when(parcelRepository.findById(parcelId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> spatialAnalysisService.analyze(parcelId))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Parcel not found");
    }
}
