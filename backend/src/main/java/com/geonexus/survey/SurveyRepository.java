package com.geonexus.survey;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SurveyRepository extends JpaRepository<Survey, UUID> {

    @Query("select s from Survey s where s.parcel.id = :parcelId order by s.createdAt desc")
    List<Survey> findByParcelIdNewestFirst(@Param("parcelId") UUID parcelId);

    /** Id + parcel scoped lookup: prevents addressing a survey through the wrong parcel. */
    @Query("select s from Survey s where s.id = :id and s.parcel.id = :parcelId")
    Optional<Survey> findByIdAndParcelId(@Param("id") UUID id, @Param("parcelId") UUID parcelId);

    @Query("select s from Survey s where s.surveyor.id = :surveyorId")
    Page<Survey> findBySurveyorId(@Param("surveyorId") UUID surveyorId, Pageable pageable);

    @Query("select s from Survey s where s.status in :statuses")
    Page<Survey> findByStatusIn(@Param("statuses") Collection<SurveyStatus> statuses, Pageable pageable);

    long countByStatus(SurveyStatus status);
}
