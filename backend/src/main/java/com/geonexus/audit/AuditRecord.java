package com.geonexus.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Append-only audit row. The entity is {@code @Immutable} and the table rejects UPDATE, DELETE and TRUNCATE.
 * Never put secrets, password material, tokens or full coordinates into {@code details}.
 * Actor and parcel are stored as plain ids so audit writes never depend on loading other entities.
 */
@Entity
@Immutable
@Table(name = "audit_records")
public class AuditRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", updatable = false)
    private Long id;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "actor_user_id", updatable = false)
    private UUID actorUserId;

    @Column(name = "actor_username", updatable = false, length = 64)
    private String actorUsername;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, updatable = false, length = 40)
    private AuditAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "outcome", nullable = false, updatable = false, length = 16)
    private AuditOutcome outcome;

    @Column(name = "entity_type", nullable = false, updatable = false, length = 32)
    private String entityType;

    @Column(name = "entity_id", updatable = false)
    private UUID entityId;

    @Column(name = "parcel_id", updatable = false)
    private UUID parcelId;

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", nullable = false, updatable = false, length = 8)
    private AuditOrigin origin;

    @Column(name = "request_id", updatable = false, length = 64)
    private String requestId;

    @Column(name = "client_ip", updatable = false, length = 45)
    private String clientIp;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details", nullable = false, updatable = false, columnDefinition = "jsonb")
    private Map<String, Object> details = new LinkedHashMap<>();

    protected AuditRecord() {
        // JPA
    }

    /** Application-originated audit event. */
    public static AuditRecord of(AuditAction action, AuditOutcome outcome, String entityType, UUID entityId,
                                 UUID parcelId, UUID actorUserId, String actorUsername,
                                 String requestId, String clientIp, Map<String, Object> details) {
        AuditRecord r = new AuditRecord();
        r.action = Objects.requireNonNull(action, "action");
        r.outcome = Objects.requireNonNull(outcome, "outcome");
        r.entityType = Objects.requireNonNull(entityType, "entityType");
        r.entityId = entityId;
        r.parcelId = parcelId;
        r.actorUserId = actorUserId;
        r.actorUsername = actorUsername;
        r.requestId = requestId;
        r.clientIp = clientIp;
        r.origin = AuditOrigin.APP;
        if (details != null) {
            r.details = new LinkedHashMap<>(details);
        }
        return r;
    }

    @PrePersist
    void onCreate() {
        if (occurredAt == null) {
            occurredAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public String getActorUsername() {
        return actorUsername;
    }

    public AuditAction getAction() {
        return action;
    }

    public AuditOutcome getOutcome() {
        return outcome;
    }

    public String getEntityType() {
        return entityType;
    }

    public UUID getEntityId() {
        return entityId;
    }

    public UUID getParcelId() {
        return parcelId;
    }

    public AuditOrigin getOrigin() {
        return origin;
    }

    public String getRequestId() {
        return requestId;
    }

    public String getClientIp() {
        return clientIp;
    }

    public Map<String, Object> getDetails() {
        return Collections.unmodifiableMap(details);
    }
}
