package com.geonexus.security;

/**
 * Application roles. Authorities are exposed to Spring Security as {@code ROLE_<NAME>}.
 * If Phase 2 already defines an equivalent enum, see INTEGRATION.md for how to map it.
 */
public enum Role {
    ADMIN,
    SURVEYOR,
    REVIEWER,
    VIEWER;

    public String authority() {
        return "ROLE_" + name();
    }
}
