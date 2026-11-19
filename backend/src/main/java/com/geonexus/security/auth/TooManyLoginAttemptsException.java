package com.geonexus.security.auth;

import com.geonexus.common.error.ApiException;
import java.time.Duration;
import org.springframework.http.HttpStatus;

public class TooManyLoginAttemptsException extends ApiException {

    public TooManyLoginAttemptsException(Duration retryAfter) {
        super(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS",
                "Too many failed login attempts. Try again later.", retryAfter);
    }
}
