package com.geonexus.common.error;

import org.springframework.http.HttpStatus;

/**
 * Thrown when an operation conflicts with existing server state (e.g. duplicate parcel code).
 */
public class ConflictException extends ApiException {

    public ConflictException(String code, String message) {
        super(HttpStatus.CONFLICT, code, message);
    }

    public ConflictException(String message) {
        this("CONFLICT", message);
    }
}
