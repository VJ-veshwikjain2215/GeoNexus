package com.geonexus.common.error;

import org.springframework.http.HttpStatus;

/**
 * Thrown when an entity is not found by ID or query criteria.
 */
public class ResourceNotFoundException extends ApiException {

    public ResourceNotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }
}
