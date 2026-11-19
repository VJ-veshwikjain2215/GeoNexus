package com.geonexus.security.account;

import com.geonexus.security.Role;
import java.util.Objects;
import java.util.Set;

/**
 * Security-facing view of a Phase 2 user. Built by the integration adapter; never persisted by this module.
 *
 * @param id            stable user identifier as a string (Phase 2 primary key, e.g. UUID or Long). Used as JWT subject.
 * @param username      unique, case-insensitive login name
 * @param passwordHash  BCrypt hash only; never a plaintext password
 */
public record UserAccount(String id, String username, String passwordHash, Set<Role> roles,
                          boolean enabled, boolean accountNonLocked) {

    public UserAccount {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(username, "username");
        Objects.requireNonNull(passwordHash, "passwordHash");
        roles = roles == null ? Set.of() : Set.copyOf(roles);
    }

    @Override
    public String toString() {
        return "UserAccount[id=" + id + ", username=" + username + ", roles=" + roles + "]";
    }
}
