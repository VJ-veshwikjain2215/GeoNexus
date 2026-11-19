package com.geonexus.geometry;

import com.geonexus.parcel.Parcel;
import com.geonexus.survey.Survey;
import com.geonexus.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.MultiPolygon;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * One immutable boundary version of a parcel (EPSG:4326 MultiPolygon).
 * <p>
 * Boundary, provenance and version number are {@code updatable = false} and have no setters; the
 * database additionally rejects any attempt to change them. A resurvey therefore always creates a
 * <em>new</em> instance via {@link #propose}. Only lifecycle state changes, through {@link #verify}
 * and {@link #reject}.
 * <p>
 * When a version is verified the database marks the previously verified version SUPERSEDED. A
 * previously loaded instance of that older row is stale afterwards; refresh it if you need its state.
 */
@Entity
@Table(name = "parcel_geometries")
public class ParcelGeometry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "parcel_id", nullable = false, updatable = false)
    private Parcel parcel;

    @Column(name = "version_no", nullable = false, updatable = false)
    private int versionNo;

    @JdbcTypeCode(SqlTypes.GEOMETRY)
    @Column(name = "geom", nullable = false, updatable = false, columnDefinition = "geometry(MultiPolygon,4326)")
    private MultiPolygon geom;

    /** Spheroidal area in square metres, computed by PostGIS (generated column). Null until re-read from the DB. */
    @Column(name = "area_sq_m", insertable = false, updatable = false)
    private Double areaSqM;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, updatable = false, length = 16)
    private GeometrySource source;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "survey_id", updatable = false)
    private Survey survey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "based_on_geometry_id", updatable = false)
    private ParcelGeometry basedOn;

    @Column(name = "source_description", updatable = false)
    private String sourceDescription;

    @Column(name = "source_reference", updatable = false)
    private String sourceReference;

    @Column(name = "confidence", updatable = false, precision = 4, scale = 3)
    private BigDecimal confidence;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private User createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private GeometryStatus status = GeometryStatus.PROPOSED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by")
    private User reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "review_notes")
    private String reviewNotes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "superseded_by_id", insertable = false, updatable = false)
    private ParcelGeometry supersededBy;

    @Column(name = "superseded_at", insertable = false, updatable = false)
    private Instant supersededAt;

    protected ParcelGeometry() {
        // JPA
    }

    /**
     * Creates a new PROPOSED boundary version. The geometry is validated against {@link GeometryPolicy}
     * (SRID 4326, polygonal, valid topology, coordinate ranges) and normalised to a MultiPolygon.
     *
     * @param versionNo  next contiguous version for the parcel; obtain it from
     *                   {@code ParcelGeometryRepository#nextVersionNo} while holding the parcel row lock
     * @param basedOn    the verified version this proposal was drawn against (null for the first boundary)
     * @param survey     required when {@code source == SURVEY}
     * @param confidence 0..1, only meaningful for {@link GeometrySource#AI_DETECTED}
     */
    public static ParcelGeometry propose(Parcel parcel, int versionNo, org.locationtech.jts.geom.Geometry geometry,
                                         GeometrySource source, User createdBy, Survey survey,
                                         ParcelGeometry basedOn, String sourceDescription,
                                         String sourceReference, BigDecimal confidence) {
        if (versionNo < 1) {
            throw new IllegalArgumentException("versionNo must be >= 1");
        }
        if (source == GeometrySource.SURVEY && survey == null) {
            throw new IllegalArgumentException("a SURVEY boundary must reference its survey");
        }
        if (confidence != null && source != GeometrySource.AI_DETECTED) {
            throw new IllegalArgumentException("confidence is only recorded for AI_DETECTED boundaries");
        }
        ParcelGeometry g = new ParcelGeometry();
        g.parcel = Objects.requireNonNull(parcel, "parcel");
        g.versionNo = versionNo;
        g.geom = GeometryPolicy.requireStorable(geometry);
        g.source = Objects.requireNonNull(source, "source");
        g.createdBy = Objects.requireNonNull(createdBy, "createdBy");
        g.survey = survey;
        g.basedOn = basedOn;
        g.sourceDescription = sourceDescription;
        g.sourceReference = sourceReference;
        g.confidence = confidence;
        return g;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    /** Marks this PROPOSED version VERIFIED by a human reviewer other than its submitter. */
    public void verify(User reviewer, String notes, Instant at) {
        decide(GeometryStatus.VERIFIED, reviewer, notes, at);
    }

    /** Marks this PROPOSED version REJECTED by a human reviewer other than its submitter. */
    public void reject(User reviewer, String notes, Instant at) {
        decide(GeometryStatus.REJECTED, reviewer, notes, at);
    }

    private void decide(GeometryStatus decision, User reviewer, String notes, Instant at) {
        if (status != GeometryStatus.PROPOSED) {
            throw new IllegalStateException("only a PROPOSED geometry can be reviewed (status is " + status + ")");
        }
        if (Objects.requireNonNull(reviewer, "reviewer").equals(createdBy)) {
            throw new IllegalArgumentException("a boundary cannot be reviewed by the user who submitted it");
        }
        this.status = decision;
        this.reviewedBy = reviewer;
        this.reviewedAt = Objects.requireNonNull(at, "at");
        this.reviewNotes = notes;
    }

    public UUID getId() {
        return id;
    }

    public Parcel getParcel() {
        return parcel;
    }

    public int getVersionNo() {
        return versionNo;
    }

    public MultiPolygon getGeom() {
        return geom;
    }

    public Double getAreaSqM() {
        return areaSqM;
    }

    public GeometrySource getSource() {
        return source;
    }

    public Survey getSurvey() {
        return survey;
    }

    public ParcelGeometry getBasedOn() {
        return basedOn;
    }

    public String getSourceDescription() {
        return sourceDescription;
    }

    public String getSourceReference() {
        return sourceReference;
    }

    public BigDecimal getConfidence() {
        return confidence;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public GeometryStatus getStatus() {
        return status;
    }

    public User getReviewedBy() {
        return reviewedBy;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public String getReviewNotes() {
        return reviewNotes;
    }

    public ParcelGeometry getSupersededBy() {
        return supersededBy;
    }

    public Instant getSupersededAt() {
        return supersededAt;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof ParcelGeometry other && id != null && id.equals(other.getId()); // getId(): safe on Hibernate proxies
    }

    @Override
    public int hashCode() {
        return ParcelGeometry.class.hashCode();
    }
}
