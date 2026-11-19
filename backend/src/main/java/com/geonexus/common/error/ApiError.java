package com.geonexus.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

/**
 * The single error body returned by every API failure. It never contains stack traces,
 * exception messages from internals, rejected input values, tokens or passwords.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String code,
        String message,
        String path,
        List<FieldViolation> violations,
        String errorId) {

    public record FieldViolation(String field, String message) {
    }

    public static ApiError of(HttpStatusCode status, String code, String message, String path) {
        String reason = status instanceof HttpStatus hs ? hs.getReasonPhrase() : String.valueOf(status.value());
        return new ApiError(Instant.now(), status.value(), reason, code, message, path, null, null);
    }

    public ApiError withViolations(List<FieldViolation> violations) {
        return new ApiError(timestamp, status, error, code, message, path,
                violations == null || violations.isEmpty() ? null : List.copyOf(violations), errorId);
    }

    public ApiError withErrorId(String errorId) {
        return new ApiError(timestamp, status, error, code, message, path, violations, errorId);
    }
}
