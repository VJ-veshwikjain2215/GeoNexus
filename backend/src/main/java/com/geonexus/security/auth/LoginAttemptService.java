package com.geonexus.security.auth;

import com.geonexus.security.config.SecurityProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * In-memory brute-force limiter keyed by "username|clientIp": after N failures inside a fixed window
 * further logins are refused until the window ends. Limitations (documented in INTEGRATION.md): state is
 * per JVM instance and lost on restart; use a shared store if the API is ever scaled horizontally.
 * Keying by user+IP (not user alone) stops a remote attacker from locking a victim out of every device.
 */
@Component
public class LoginAttemptService {

    private static final int MAX_TRACKED_KEYS = 10_000;

    private record Window(int failures, Instant start) {
    }

    private final ConcurrentHashMap<String, Window> state = new ConcurrentHashMap<>();
    private final int maxFailures;
    private final Duration window;
    private final Clock clock;

    public LoginAttemptService(SecurityProperties props, Clock clock) {
        this.maxFailures = props.login().maxFailedAttempts();
        this.window = props.login().lockoutWindow();
        this.clock = clock;
    }

    /** @return remaining lock duration if the key is currently locked out */
    public Optional<Duration> lockedFor(String key) {
        Window w = state.get(key);
        if (w == null) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        Instant end = w.start().plus(window);
        if (!now.isBefore(end)) {
            state.remove(key, w);
            return Optional.empty();
        }
        return w.failures() >= maxFailures ? Optional.of(Duration.between(now, end)) : Optional.empty();
    }

    public void recordFailure(String key) {
        Instant now = clock.instant();
        if (state.size() >= MAX_TRACKED_KEYS) {
            state.entrySet().removeIf(e -> !now.isBefore(e.getValue().start().plus(window)));
            if (state.size() >= MAX_TRACKED_KEYS) {
                state.clear(); // hard memory bound; documented trade-off
            }
        }
        state.merge(key, new Window(1, now), (old, ignored) ->
                !now.isBefore(old.start().plus(window)) ? new Window(1, now)
                        : new Window(old.failures() + 1, old.start()));
    }

    public void reset(String key) {
        state.remove(key);
    }
}
