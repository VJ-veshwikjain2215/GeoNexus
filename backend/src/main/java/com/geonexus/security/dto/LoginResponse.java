package com.geonexus.security.dto;

public record LoginResponse(String accessToken, String tokenType, long expiresInSeconds, UserSummary user) {

    @Override
    public String toString() {
        return "LoginResponse[accessToken=<redacted>, tokenType=" + tokenType + ", user=" + user + "]";
    }
}
