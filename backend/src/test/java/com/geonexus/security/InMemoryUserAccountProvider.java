package com.geonexus.security;

import com.geonexus.security.account.UserAccount;
import com.geonexus.security.account.UserAccountProvider;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Test-only stand-in for the Phase 2 adapter. Marked @TestComponent so real app scans never pick it up. */
@TestComponent
public class InMemoryUserAccountProvider implements UserAccountProvider {

    private final Map<String, UserAccount> byId = new ConcurrentHashMap<>();

    public InMemoryUserAccountProvider(PasswordEncoder encoder) {
        String hash = encoder.encode(TestKeys.PASSWORD);
        add(new UserAccount("u-admin", "admin1", hash, Set.of(Role.ADMIN), true, true));
        add(new UserAccount("u-surveyor", "surveyor1", hash, Set.of(Role.SURVEYOR), true, true));
        add(new UserAccount("u-reviewer", "reviewer1", hash, Set.of(Role.REVIEWER), true, true));
        add(new UserAccount("u-viewer", "viewer1", hash, Set.of(Role.VIEWER), true, true));
        add(new UserAccount("u-disabled", "disabled1", hash, Set.of(Role.VIEWER), false, true));
        add(new UserAccount("u-lock", "lockout1", hash, Set.of(Role.VIEWER), true, true));
        add(new UserAccount("u-temp", "temp1", hash, Set.of(Role.VIEWER), true, true));
    }

    private void add(UserAccount a) {
        byId.put(a.id(), a);
    }

    public void remove(String id) {
        byId.remove(id);
    }

    public void restore(UserAccount a) {
        add(a);
    }

    public UserAccount get(String id) {
        return byId.get(id);
    }

    @Override
    public Optional<UserAccount> findByUsername(String normalizedUsername) {
        return byId.values().stream().filter(a -> a.username().equals(normalizedUsername)).findFirst();
    }

    @Override
    public Optional<UserAccount> findById(String id) {
        return Optional.ofNullable(byId.get(id));
    }
}
