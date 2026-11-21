package com.geonexus.report.dto;

import java.io.Serializable;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * DTO representing an immutable audit record in the reports and audit view.
 */
public record AuditRecordResponse(
        Long id,
        Instant occurredAt,
        UUID actorUserId,
        String actorUsername,
        String action,
        String outcome,
        String entityType,
        UUID entityId,
        UUID parcelId,
        String parcelCode,
        String origin,
        String requestId,
        String clientIp,
        Map<String, Object> details,
        String integrityHash
) implements Serializable {}
