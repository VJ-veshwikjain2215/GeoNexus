package com.geonexus.parcel;

import com.geonexus.common.TimestampedEntity;
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

import java.util.Objects;
import java.util.UUID;

/**
 * Parcel registry record. It deliberately holds no boundary: geometry lives in
 * {@code ParcelGeometry} so every boundary is a retained, versioned row.
 * <p>
 * {@code owner} is the application account responsible for the record (used for authorization),
 * not legal title to the land.
 */
@Entity
@Table(name = "parcels")
public class Parcel extends TimestampedEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "parcel_code", nullable = false, length = 64)
    private String parcelCode;

    @Column(name = "name", length = 160)
    private String name;

    @Column(name = "village", length = 120)
    private String village;

    @Column(name = "district", nullable = false, length = 120)
    private String district;

    @Column(name = "state", nullable = false, length = 120)
    private String state;

    @Enumerated(EnumType.STRING)
    @Column(name = "land_use", nullable = false, length = 32)
    private LandUse landUse = LandUse.AGRICULTURAL;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 16)
    private ParcelStatus status = ParcelStatus.DRAFT;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_user_id", nullable = false)
    private User owner;

    @Column(name = "external_reference", length = 120)
    private String externalReference;

    @Column(name = "notes")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false, updatable = false)
    private User createdBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private User updatedBy;

    @Version
    @Column(name = "row_version", nullable = false)
    private long rowVersion;

    protected Parcel() {
        // JPA
    }

    public Parcel(String parcelCode, String district, String state, User owner, User createdBy) {
        this.parcelCode = Objects.requireNonNull(parcelCode, "parcelCode");
        this.district = Objects.requireNonNull(district, "district");
        this.state = Objects.requireNonNull(state, "state");
        this.owner = Objects.requireNonNull(owner, "owner");
        this.createdBy = Objects.requireNonNull(createdBy, "createdBy");
    }

    public UUID getId() {
        return id;
    }

    public String getParcelCode() {
        return parcelCode;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getVillage() {
        return village;
    }

    public void setVillage(String village) {
        this.village = village;
    }

    public String getDistrict() {
        return district;
    }

    public void setDistrict(String district) {
        this.district = Objects.requireNonNull(district, "district");
    }

    public String getState() {
        return state;
    }

    public void setState(String state) {
        this.state = Objects.requireNonNull(state, "state");
    }

    public LandUse getLandUse() {
        return landUse;
    }

    public void setLandUse(LandUse landUse) {
        this.landUse = Objects.requireNonNull(landUse, "landUse");
    }

    public ParcelStatus getStatus() {
        return status;
    }

    public void setStatus(ParcelStatus status) {
        this.status = Objects.requireNonNull(status, "status");
    }

    public User getOwner() {
        return owner;
    }

    public void setOwner(User owner) {
        this.owner = Objects.requireNonNull(owner, "owner");
    }

    public String getExternalReference() {
        return externalReference;
    }

    public void setExternalReference(String externalReference) {
        this.externalReference = externalReference;
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

    public User getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(User updatedBy) {
        this.updatedBy = updatedBy;
    }

    public long getRowVersion() {
        return rowVersion;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Parcel other && id != null && id.equals(other.getId()); // getId(): safe on Hibernate proxies
    }

    @Override
    public int hashCode() {
        return Parcel.class.hashCode();
    }
}
