package com.geonexus.geometry;

import com.geonexus.common.error.ApiException;
import org.springframework.http.HttpStatus;

/**
 * Thrown when a boundary proposal is based on a geometry that is no longer the current verified version.
 */
public class StaleBaseGeometryException extends ApiException {

    public StaleBaseGeometryException(String message) {
        super(HttpStatus.CONFLICT, "STALE_BASE_GEOMETRY", message);
    }
}
