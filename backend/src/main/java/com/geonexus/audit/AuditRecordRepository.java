package com.geonexus.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Deliberately NOT a JpaRepository: the audit trail is append-only, so no update/delete/deleteAll
 * methods are exposed. (The database enforces the same rule.)
 */
public interface AuditRecordRepository extends Repository<AuditRecord, Long> {

    <S extends AuditRecord> S save(S record);

    long count();

    @Query("select a from AuditRecord a order by a.occurredAt desc")
    List<AuditRecord> findRecent(Pageable pageable);

    @Query(value = "select a from AuditRecord a order by a.occurredAt desc",
           countQuery = "select count(a) from AuditRecord a")
    Page<AuditRecord> findAll(Pageable pageable);

    @Query(value = "select a from AuditRecord a where (:parcelId is null or a.parcelId = :parcelId) and (:action is null or a.action = :action) order by a.occurredAt desc",
           countQuery = "select count(a) from AuditRecord a where (:parcelId is null or a.parcelId = :parcelId) and (:action is null or a.action = :action)")
    Page<AuditRecord> findFiltered(@org.springframework.data.repository.query.Param("parcelId") UUID parcelId,
                                   @org.springframework.data.repository.query.Param("action") AuditAction action,
                                   Pageable pageable);

    Page<AuditRecord> findByParcelIdOrderByOccurredAtDesc(UUID parcelId, Pageable pageable);

    Page<AuditRecord> findByEntityTypeAndEntityIdOrderByOccurredAtDesc(String entityType, UUID entityId,
                                                                       Pageable pageable);

    Page<AuditRecord> findByActorUserIdOrderByOccurredAtDesc(UUID actorUserId, Pageable pageable);

    Page<AuditRecord> findByActionOrderByOccurredAtDesc(AuditAction action, Pageable pageable);
}
