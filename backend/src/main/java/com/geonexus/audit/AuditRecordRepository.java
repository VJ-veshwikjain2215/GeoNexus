package com.geonexus.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.repository.Repository;

import java.util.UUID;

/**
 * Deliberately NOT a JpaRepository: the audit trail is append-only, so no update/delete/deleteAll
 * methods are exposed. (The database enforces the same rule.)
 */
public interface AuditRecordRepository extends Repository<AuditRecord, Long> {

    <S extends AuditRecord> S save(S record);

    Page<AuditRecord> findByParcelIdOrderByOccurredAtDesc(UUID parcelId, Pageable pageable);

    Page<AuditRecord> findByEntityTypeAndEntityIdOrderByOccurredAtDesc(String entityType, UUID entityId,
                                                                       Pageable pageable);

    Page<AuditRecord> findByActorUserIdOrderByOccurredAtDesc(UUID actorUserId, Pageable pageable);

    Page<AuditRecord> findByActionOrderByOccurredAtDesc(AuditAction action, Pageable pageable);
}
