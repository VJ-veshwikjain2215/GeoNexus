package com.geonexus.geometry;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Geometry history access. There is intentionally no delete path: the database forbids it, and
 * callers should not rely on {@code deleteById}.
 * <p>
 * Spatial predicates take WKT (EPSG:4326) strings that the caller has already validated through
 * {@link GeometryPolicy}; they are bound as parameters and wrapped in {@code ST_GeomFromText(.., 4326)}.
 */
public interface ParcelGeometryRepository extends JpaRepository<ParcelGeometry, UUID> {

    /** Full history, newest version first. */
    @Query("select g from ParcelGeometry g where g.parcel.id = :parcelId order by g.versionNo desc")
    List<ParcelGeometry> findHistory(@Param("parcelId") UUID parcelId);

    @Query("select g from ParcelGeometry g where g.parcel.id = :parcelId and g.versionNo = :versionNo")
    Optional<ParcelGeometry> findByParcelIdAndVersionNo(@Param("parcelId") UUID parcelId,
                                                        @Param("versionNo") int versionNo);

    /** The current authoritative boundary: the single VERIFIED version, if any. */
    @Query("select g from ParcelGeometry g where g.parcel.id = :parcelId and g.status = com.geonexus.geometry.GeometryStatus.VERIFIED")
    Optional<ParcelGeometry> findCurrent(@Param("parcelId") UUID parcelId);

    @Query("select g from ParcelGeometry g where g.parcel.id = :parcelId and g.status = com.geonexus.geometry.GeometryStatus.PROPOSED order by g.versionNo")
    List<ParcelGeometry> findPending(@Param("parcelId") UUID parcelId);

    /** Id + parcel scoped lookup so a geometry cannot be addressed through an unrelated parcel. */
    @Query("select g from ParcelGeometry g where g.id = :id and g.parcel.id = :parcelId")
    Optional<ParcelGeometry> findByIdAndParcelId(@Param("id") UUID id, @Param("parcelId") UUID parcelId);

    /** Next contiguous version number. Call while holding {@code ParcelRepository#findByIdForUpdate}. */
    @Query("select coalesce(max(g.versionNo), 0) + 1 from ParcelGeometry g where g.parcel.id = :parcelId")
    int nextVersionNo(@Param("parcelId") UUID parcelId);

    /** Verified boundaries intersecting the given EPSG:4326 WKT (uses the partial GiST index). */
    @Query(value = """
            SELECT g.* FROM parcel_geometries g
            WHERE g.status = 'VERIFIED'
              AND ST_Intersects(g.geom, ST_GeomFromText(:wkt, 4326))
            """, nativeQuery = true)
    List<ParcelGeometry> findCurrentIntersecting(@Param("wkt") String wkt);

    /**
     * Verified boundaries of OTHER parcels that overlap the candidate by more than a shared edge/point.
     * Overlaps are reported for human review; the database does not forbid them.
     */
    @Query(value = """
            SELECT g.* FROM parcel_geometries g
            WHERE g.status = 'VERIFIED'
              AND g.parcel_id <> :excludeParcelId
              AND ST_Intersects(g.geom, ST_GeomFromText(:wkt, 4326))
              AND NOT ST_Touches(g.geom, ST_GeomFromText(:wkt, 4326))
            """, nativeQuery = true)
    List<ParcelGeometry> findCurrentOverlapping(@Param("wkt") String wkt,
                                                @Param("excludeParcelId") UUID excludeParcelId);
}
