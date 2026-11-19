package com.geonexus.security.jwt;

import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.security.config.SecurityProperties;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

/**
 * Issues and validates HS256 access tokens. Fails fast at startup if the secret is missing,
 * not Base64, or shorter than 256 bits. The secret is never logged.
 */
@Service
public class JwtService {

    private static final int MIN_SECRET_BYTES = 32;
    private static final Duration MAX_TTL = Duration.ofHours(24);

    private final SecretKey key;
    private final String issuer;
    private final String audience;
    private final Duration ttl;
    private final Clock clock;

    public JwtService(SecurityProperties props, Clock clock) {
        SecurityProperties.Jwt jwt = props.jwt();
        byte[] secret;
        try {
            secret = Decoders.BASE64.decode(jwt.secret());
        } catch (RuntimeException e) {
            throw new IllegalStateException("geonexus.security.jwt.secret must be a Base64-encoded value");
        }
        if (secret.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "geonexus.security.jwt.secret must decode to at least " + MIN_SECRET_BYTES + " bytes (256 bits)");
        }
        Duration ttl = jwt.accessTokenTtl();
        if (ttl.isZero() || ttl.isNegative() || ttl.compareTo(MAX_TTL) > 0) {
            throw new IllegalStateException("geonexus.security.jwt.access-token-ttl must be > 0 and <= 24h");
        }
        this.key = Keys.hmacShaKeyFor(secret);
        this.issuer = jwt.issuer();
        this.audience = jwt.audience();
        this.ttl = ttl;
        this.clock = clock;
    }

    public String issue(AuthenticatedUser user) {
        Instant now = clock.instant();
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .issuer(issuer)
                .audience().add(audience).and()
                .subject(user.getId())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    public Duration accessTokenTtl() {
        return ttl;
    }

    /** @throws InvalidTokenException if the token is malformed, unsigned, tampered, expired or for another issuer/audience */
    public JwtClaims parse(String token) {
        if (token == null || token.isBlank()) {
            throw new InvalidTokenException("empty token", false);
        }
        try {
            io.jsonwebtoken.Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .requireIssuer(issuer)
                    .requireAudience(audience)
                    .clock(() -> Date.from(clock.instant()))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            if (claims.getSubject() == null || claims.getExpiration() == null) {
                throw new InvalidTokenException("missing required claims", false);
            }
            Instant iat = claims.getIssuedAt() == null ? null : claims.getIssuedAt().toInstant();
            return new JwtClaims(claims.getSubject(), claims.getId(), iat, claims.getExpiration().toInstant());
        } catch (ExpiredJwtException e) {
            throw new InvalidTokenException("token expired", true);
        } catch (JwtException | IllegalArgumentException e) {
            // Exception text can echo token fragments; keep only the type.
            throw new InvalidTokenException("token rejected: " + e.getClass().getSimpleName(), false);
        }
    }
}
