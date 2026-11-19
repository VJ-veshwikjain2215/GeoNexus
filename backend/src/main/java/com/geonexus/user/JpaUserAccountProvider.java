package com.geonexus.user;

import com.geonexus.security.account.UserAccount;
import com.geonexus.security.account.UserAccountProvider;
import java.time.Clock;
import java.util.EnumSet;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Adapter between the Phase 2 user model and the Phase 3 security module. Read-only; roles are
 * fetched eagerly through an entity graph because this runs outside any web transaction.
 */
@Component
class JpaUserAccountProvider implements UserAccountProvider {

    private final UserRepository users;
    private final Clock clock;

    JpaUserAccountProvider(UserRepository users, Clock clock) {
        this.users = users;
        this.clock = clock;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UserAccount> findByUsername(String normalizedUsername) {
        return users.findWithRolesByUsernameIgnoreCase(normalizedUsername).map(this::toAccount);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<UserAccount> findById(String id) {
        try {
            return users.findWithRolesById(UUID.fromString(id)).map(this::toAccount);
        } catch (IllegalArgumentException malformedId) {
            return Optional.empty();
        }
    }

    private UserAccount toAccount(User u) {
        Set<com.geonexus.security.Role> roles = EnumSet.noneOf(com.geonexus.security.Role.class);
        for (com.geonexus.user.Role r : u.getRoles()) {
            // RoleName and security.Role share the same constant names (ADMIN, SURVEYOR, REVIEWER, VIEWER).
            roles.add(com.geonexus.security.Role.valueOf(r.getName().name()));
        }
        boolean nonLocked = u.getLockedUntil() == null || !u.getLockedUntil().isAfter(clock.instant());
        return new UserAccount(u.getId().toString(), u.getUsername(), u.getPasswordHash(),
                roles, u.isEnabled(), nonLocked);
    }
}
