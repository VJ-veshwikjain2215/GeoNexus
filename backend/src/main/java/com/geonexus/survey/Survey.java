package com.geonexus.survey;

import com.geonexus.common.TimestampedEntity;
import com.geonexus.parcel.Parcel;
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
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

/**
 * One survey visit. A {@link SurveyType#RESURVEY} must reference the survey it revisits
 * ({@code previousSurvey}); the database enforces that both belong to the same parcel.
 */
@Entity
@Table(name = "surveys")
public class Survey extends TimestampedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "parcel_id", nullable = false, updatable = false)
    private Parcel parcel;

    @Enumerated(EnumType.STRING)
    @Column(name = "survey_type", nullable = false, updatable = false, length = 16)
    private SurveyType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private SurveyStatus status = SurveyStatus.PLANNED;

    @Enumerated(EnumType.STRING)
    @Column(name = "method", nullable = false, length = 24)
    private SurveyMethod method = SurveyMethod.GNSS;

    @Column(name = "survey_date")
    private LocalDate surveyDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "previous_survey_id", updatable = false)
    private Survey previousSurvey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "surveyor_id", nullable = false)
    private User surveyor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewer_id")
    private User reviewer;

    @Column(name = "submitted_at")
    private Instant submittedAt;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "review_notes")
    private String reviewNotes;

    @Column(name = "notes")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private User createdBy;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    protected Survey() {
        // JPA
    }

    private Survey(Parcel parcel, SurveyType type, Survey previous, User surveyor, User createdBy) {
        this.parcel = Objects.requireNonNull(parcel, "parcel");
        this.type = type;
        this.previousSurvey = previous;
        this.surveyor = Objects.requireNonNull(surveyor, "surveyor");
        this.createdBy = Objects.requireNonNull(createdBy, "createdBy");
    }

    public static Survey initial(Parcel parcel, User surveyor, User createdBy) {
        return new Survey(parcel, SurveyType.INITIAL, null, surveyor, createdBy);
    }

    public static Survey resurvey(Parcel parcel, Survey previous, User surveyor, User createdBy) {
        Objects.requireNonNull(previous, "a resurvey must reference the survey it revisits");
        return new Survey(parcel, SurveyType.RESURVEY, previous, surveyor, createdBy);
    }

    public UUID getId() {
        return id;
    }

    public Parcel getParcel() {
        return parcel;
    }

    public SurveyType getType() {
        return type;
    }

    public SurveyStatus getStatus() {
        return status;
    }

    public void setStatus(SurveyStatus status) {
        this.status = Objects.requireNonNull(status, "status");
    }

    public SurveyMethod getMethod() {
        return method;
    }

    public void setMethod(SurveyMethod method) {
        this.method = Objects.requireNonNull(method, "method");
    }

    public LocalDate getSurveyDate() {
        return surveyDate;
    }

    public void setSurveyDate(LocalDate surveyDate) {
        this.surveyDate = surveyDate;
    }

    public Survey getPreviousSurvey() {
        return previousSurvey;
    }

    public User getSurveyor() {
        return surveyor;
    }

    public void setSurveyor(User surveyor) {
        this.surveyor = Objects.requireNonNull(surveyor, "surveyor");
    }

    public User getReviewer() {
        return reviewer;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }

    public void setSubmittedAt(Instant submittedAt) {
        this.submittedAt = submittedAt;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }

    public String getReviewNotes() {
        return reviewNotes;
    }

    /** Records a decision; the database rejects reviewer == surveyor and decisions without a reviewer. */
    public void recordDecision(SurveyStatus decision, User reviewer, String notes, Instant at) {
        if (decision != SurveyStatus.APPROVED && decision != SurveyStatus.REJECTED) {
            throw new IllegalArgumentException("decision must be APPROVED or REJECTED");
        }
        if (Objects.requireNonNull(reviewer, "reviewer").equals(surveyor)) {
            throw new IllegalArgumentException("the surveyor cannot review their own survey");
        }
        this.status = decision;
        this.reviewer = reviewer;
        this.reviewNotes = notes;
        this.reviewedAt = Objects.requireNonNull(at, "at");
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public long getRowVersion() {
        return rowVersion;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Survey other && id != null && id.equals(other.getId()); // getId(): safe on Hibernate proxies
    }

    @Override
    public int hashCode() {
        return Survey.class.hashCode();
    }
}
