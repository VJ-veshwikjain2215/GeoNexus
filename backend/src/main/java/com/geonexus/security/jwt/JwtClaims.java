package com.geonexus.security.jwt;

import java.time.Instant;

/** Validated claims. Roles are deliberately NOT carried in the token; they are loaded fresh per request. */
public record JwtClaims(String userId, String tokenId, Instant issuedAt, Instant expiresAt) {
}
