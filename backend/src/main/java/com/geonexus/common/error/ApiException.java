package com.geonexus.common.error;

import java.time.Duration;
import org.springframework.http.HttpStatus;

/**
 * Base class for deliberate, client-safe failures. The message MUST be safe to show to clients.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Duration retryAfter;

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public ApiException(HttpStatus status, String code, String message, Duration retryAfter) {
        super(message);
        this.status = status;
        this.code = code;
        this.retryAfter = retryAfter;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public Duration getRetryAfter() {
        return retryAfter;
    }
}
