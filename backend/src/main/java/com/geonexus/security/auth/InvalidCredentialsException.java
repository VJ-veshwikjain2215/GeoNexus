package com.geonexus.security.auth;

import com.geonexus.common.error.ApiException;
import org.springframework.http.HttpStatus;

/** One generic message for unknown user, wrong password, disabled or locked account (no enumeration). */
public class InvalidCredentialsException extends ApiException {

    public InvalidCredentialsException() {
        super(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid username or password.");
    }
}
