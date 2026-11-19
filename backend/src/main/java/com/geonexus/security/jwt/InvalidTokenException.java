package com.geonexus.security.jwt;

import org.springframework.security.core.AuthenticationException;

/** Raised for any unusable bearer token. The message is internal and never sent to clients. */
public class InvalidTokenException extends AuthenticationException {

    private final boolean expired;

    public InvalidTokenException(String message, boolean expired) {
        super(message);
        this.expired = expired;
    }

    public boolean isExpired() {
        return expired;
    }
}
