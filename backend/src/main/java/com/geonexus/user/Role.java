package com.geonexus.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Reference data; rows are managed by migrations, not by the application. */
@Entity
@Table(name = "roles")
public class Role {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private Short id;

    @Enumerated(EnumType.STRING)
    @Column(name = "name", nullable = false, updatable = false, length = 32)
    private RoleName name;

    @Column(name = "description", nullable = false, updatable = false)
    private String description;

    protected Role() {
        // JPA
    }

    public Short getId() {
        return id;
    }

    public RoleName getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Role other && id != null && id.equals(other.getId()); // getId(): safe on Hibernate proxies
    }

    @Override
    public int hashCode() {
        return Role.class.hashCode();
    }
}
