package com.geonexus.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.geonexus.security.auth.LoginAttemptService;
import com.geonexus.security.config.SecurityProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

class LoginAttemptServiceTest {

    /** Minimal mutable clock for time-travel. */
    static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-01-01T00:00:00Z");

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override public Instant instant() {
            return now;
        }
    }

    private static SecurityProperties props() {
        return new SecurityProperties(
                new SecurityProperties.Jwt(TestKeys.SECRET, "geonexus", "geonexus-api", Duration.ofMinutes(30)),
                new SecurityProperties.Cors(List.of("http://localhost:5173"), 3600),
                new SecurityProperties.Login(3, Duration.ofMinutes(10)));
    }

    @Test
    void locksAfterMaxFailuresAndReleasesAfterWindow() {
        MutableClock clock = new MutableClock();
        LoginAttemptService svc = new LoginAttemptService(props(), clock);
        for (int i = 0; i < 2; i++) {
            svc.recordFailure("a|1.1.1.1");
        }
        assertThat(svc.lockedFor("a|1.1.1.1")).isEmpty();
        svc.recordFailure("a|1.1.1.1");
        assertThat(svc.lockedFor("a|1.1.1.1")).isPresent();
        assertThat(svc.lockedFor("a|2.2.2.2")).isEmpty(); // other client address not locked out
        clock.advance(Duration.ofMinutes(11));
        assertThat(svc.lockedFor("a|1.1.1.1")).isEmpty();
    }

    @Test
    void successfulLoginResetsCounter() {
        LoginAttemptService svc = new LoginAttemptService(props(), new MutableClock());
        svc.recordFailure("a|ip");
        svc.recordFailure("a|ip");
        svc.reset("a|ip");
        svc.recordFailure("a|ip");
        assertThat(svc.lockedFor("a|ip")).isEmpty();
    }
}
