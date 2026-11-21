package com.geonexus.geometry;

import com.geonexus.common.error.ApiException;
import org.springframework.http.HttpStatus;

/**
 * Thrown when a user attempts to review (verify or reject) their own boundary proposal.
 */
public class FourEyesViolationException extends ApiException {

    public FourEyesViolationException(String message) {
        super(HttpStatus.FORBIDDEN, "FOUR_EYES_VIOLATION", message);
    }
}
