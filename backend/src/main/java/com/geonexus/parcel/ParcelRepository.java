package com.geonexus.parcel;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface ParcelRepository extends JpaRepository<Parcel, UUID>, JpaSpecificationExecutor<Parcel> {

    Optional<Parcel> findByParcelCode(String parcelCode);

    boolean existsByParcelCode(String parcelCode);

    /** Ownership-scoped lookup so services can authorize by id + owner in a single query. */
    @Query("select p from Parcel p where p.id = :id and p.owner.id = :ownerId")
    Optional<Parcel> findByIdAndOwnerId(@Param("id") UUID id, @Param("ownerId") UUID ownerId);

    @Query("select p from Parcel p where p.owner.id = :ownerId")
    Page<Parcel> findByOwnerId(@Param("ownerId") UUID ownerId, Pageable pageable);

    Page<Parcel> findByDistrictAndStatus(String district, ParcelStatus status, Pageable pageable);

    /**
     * Row lock used before creating a new geometry version, so concurrent resurveys of one parcel
     * serialise (the database trigger takes the same lock).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Parcel p where p.id = :id")
    Optional<Parcel> findByIdForUpdate(@Param("id") UUID id);
}
