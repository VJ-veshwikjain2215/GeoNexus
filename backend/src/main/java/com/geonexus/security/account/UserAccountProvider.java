package com.geonexus.security.account;

import java.util.Optional;

/**
 * Port implemented during integration on top of the Phase 2 user repository (see INTEGRATION.md).
 * Implementations must be read-only and must not log credentials.
 */
public interface UserAccountProvider {

    /** Case-insensitive lookup. The argument is already trimmed and lower-cased by this module. */
    Optional<UserAccount> findByUsername(String normalizedUsername);

    /** Lookup by the stable id that was placed in the JWT subject. */
    Optional<UserAccount> findById(String id);
}
