package com.geonexus.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.geonexus.security.account.UserAccount;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.security.config.SecurityProperties;
import com.geonexus.security.dto.LoginRequest;
import com.geonexus.security.jwt.InvalidTokenException;
import com.geonexus.security.jwt.JwtClaims;
import com.geonexus.security.jwt.JwtService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

class JwtServiceTest {

    private static SecurityProperties props(String secret, Duration ttl) {
        return new SecurityProperties(
                new SecurityProperties.Jwt(secret, "geonexus", "geonexus-api", ttl),
                new SecurityProperties.Cors(List.of("http://localhost:5173"), 3600),
                new SecurityProperties.Login(5, Duration.ofMinutes(15)));
    }

    private static AuthenticatedUser user() {
        return AuthenticatedUser.from(new UserAccount("u-1", "someone", "hash", Set.of(Role.VIEWER), true, true), false);
    }

    @Test
    void issuedTokenRoundTripsAndCarriesNoRoles() {
        JwtService svc = new JwtService(props(TestKeys.SECRET, Duration.ofMinutes(30)), Clock.systemUTC());
        String token = svc.issue(user());
        JwtClaims claims = svc.parse(token);
        assertThat(claims.userId()).isEqualTo("u-1");
        assertThat(claims.expiresAt()).isAfter(Instant.now());
        assertThat(new String(java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1])))
                .doesNotContain("VIEWER").doesNotContain("role");
    }

    @Test
    void tokenExpiresAtTtlBoundary() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        JwtService issuer = new JwtService(props(TestKeys.SECRET, Duration.ofMinutes(10)), Clock.fixed(t0, ZoneOffset.UTC));
        String token = issuer.issue(user());

        JwtService before = new JwtService(props(TestKeys.SECRET, Duration.ofMinutes(10)),
                Clock.fixed(t0.plusSeconds(599), ZoneOffset.UTC));
        assertThat(before.parse(token).userId()).isEqualTo("u-1");

        JwtService after = new JwtService(props(TestKeys.SECRET, Duration.ofMinutes(10)),
                Clock.fixed(t0.plusSeconds(601), ZoneOffset.UTC));
        assertThatThrownBy(() -> after.parse(token)).isInstanceOf(InvalidTokenException.class)
                .satisfies(e -> assertThat(((InvalidTokenException) e).isExpired()).isTrue());
    }

    @Test
    void blankAndNullTokensAreRejected() {
        JwtService svc = new JwtService(props(TestKeys.SECRET, Duration.ofMinutes(30)), Clock.systemUTC());
        assertThatThrownBy(() -> svc.parse("")).isInstanceOf(InvalidTokenException.class);
        assertThatThrownBy(() -> svc.parse(null)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void weakOrMalformedSecretsFailFast() {
        assertThatThrownBy(() -> new JwtService(props("c2hvcnQ=", Duration.ofMinutes(5)), Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("at least 32 bytes");
        assertThatThrownBy(() -> new JwtService(props("%%%not-base64%%%", Duration.ofMinutes(5)), Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Base64");
    }

    @Test
    void unreasonableTtlFailsFast() {
        assertThatThrownBy(() -> new JwtService(props(TestKeys.SECRET, Duration.ofDays(30)), Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new JwtService(props(TestKeys.SECRET, Duration.ZERO), Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void sensitiveValuesAreRedactedInToString() {
        assertThat(props(TestKeys.SECRET, Duration.ofMinutes(5)).toString()).doesNotContain(TestKeys.SECRET);
        assertThat(new LoginRequest("u", "super-secret-pw").toString()).doesNotContain("super-secret-pw");
        UserAccount account = new UserAccount("1", "u", "$2a$12$hash", Set.of(), true, true);
        assertThat(account.toString()).doesNotContain("$2a$");
    }
}
