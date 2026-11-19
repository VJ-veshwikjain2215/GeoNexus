package com.geonexus.common.error;

import com.geonexus.common.error.ApiError.FieldViolation;
import com.geonexus.security.audit.SecurityAuditEvent;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Maps every failure to {@link ApiError}. Messages are fixed strings or validation constraint
 * messages; exception messages and rejected values are never echoed to the client.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private final ApplicationEventPublisher events;

    public GlobalExceptionHandler(ApplicationEventPublisher events) {
        this.events = events;
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Object> handleApiException(ApiException ex, HttpServletRequest request) {
        ApiError body = ApiError.of(ex.getStatus(), ex.getCode(), ex.getMessage(), request.getRequestURI());
        ResponseEntity.BodyBuilder builder = ResponseEntity.status(ex.getStatus()).contentType(MediaType.APPLICATION_JSON);
        if (ex.getRetryAfter() != null) {
            builder.header(HttpHeaders.RETRY_AFTER, String.valueOf(Math.max(1, ex.getRetryAfter().toSeconds())));
        }
        return builder.body(body);
    }

    /** Thrown by method security ({@code @PreAuthorize}); must be handled here because MVC sees it first. */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Object> handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String subject = auth != null ? auth.getName() : "anonymous";
        events.publishEvent(SecurityAuditEvent.of(SecurityAuditEvent.Type.ACCESS_DENIED, subject,
                request.getRemoteAddr(), request.getMethod() + " " + request.getRequestURI()));
        return json(HttpStatus.FORBIDDEN, "FORBIDDEN",
                "You do not have permission to perform this action.", request.getRequestURI());
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Object> handleAuthentication(AuthenticationException ex, HttpServletRequest request) {
        return json(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED",
                "Authentication is required to access this resource.", request.getRequestURI());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException ex, HttpServletRequest request) {
        List<FieldViolation> violations = ex.getConstraintViolations().stream()
                .map(v -> new FieldViolation(v.getPropertyPath().toString(), v.getMessage()))
                .sorted(Comparator.comparing(FieldViolation::field))
                .toList();
        ApiError body = ApiError.of(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                "Request validation failed.", request.getRequestURI()).withViolations(violations);
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpected(Exception ex, HttpServletRequest request) {
        String errorId = UUID.randomUUID().toString();
        // Full detail goes to server logs only, correlated by errorId. Never returned to the client.
        log.error("Unhandled exception errorId={} method={} path={}", errorId, request.getMethod(),
                request.getRequestURI(), ex);
        ApiError body = ApiError.of(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "An unexpected error occurred.", request.getRequestURI()).withErrorId(errorId);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType(MediaType.APPLICATION_JSON).body(body);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
                                                                  HttpHeaders headers, HttpStatusCode status,
                                                                  WebRequest request) {
        List<FieldViolation> violations = new java.util.ArrayList<>();
        ex.getBindingResult().getFieldErrors()
                .forEach(fe -> violations.add(new FieldViolation(fe.getField(), fe.getDefaultMessage())));
        ex.getBindingResult().getGlobalErrors()
                .forEach(ge -> violations.add(new FieldViolation(ge.getObjectName(), ge.getDefaultMessage())));
        violations.sort(Comparator.comparing(FieldViolation::field));
        ApiError body = ApiError.of(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED",
                "Request validation failed.", path(request)).withViolations(violations);
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
                                                                  HttpHeaders headers, HttpStatusCode status,
                                                                  WebRequest request) {
        ApiError body = ApiError.of(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST",
                "Request body is missing or malformed.", path(request));
        return ResponseEntity.badRequest().contentType(MediaType.APPLICATION_JSON).body(body);
    }

    /** Fallback for all other Spring MVC exceptions (404, 405, 415, missing params, ...). */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
                                                             HttpStatusCode statusCode, WebRequest request) {
        if (statusCode.is5xxServerError()) {
            log.error("Framework exception type={} path={}", ex.getClass().getSimpleName(), path(request));
        }
        ApiError error = ApiError.of(statusCode, codeFor(statusCode), messageFor(statusCode), path(request));
        return ResponseEntity.status(statusCode).headers(headers)
                .contentType(MediaType.APPLICATION_JSON).body(error);
    }

    private static ResponseEntity<Object> json(HttpStatus status, String code, String message, String path) {
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON)
                .body(ApiError.of(status, code, message, path));
    }

    private static String path(WebRequest request) {
        return request instanceof ServletWebRequest swr ? swr.getRequest().getRequestURI() : "";
    }

    private static String codeFor(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> "BAD_REQUEST";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 406 -> "NOT_ACCEPTABLE";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> status.is5xxServerError() ? "INTERNAL_ERROR" : "REQUEST_ERROR";
        };
    }

    private static String messageFor(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> "The request could not be processed.";
            case 404 -> "The requested resource was not found.";
            case 405 -> "This HTTP method is not supported for this resource.";
            case 406 -> "The requested response format is not supported.";
            case 415 -> "The request content type is not supported.";
            default -> status.is5xxServerError() ? "An unexpected error occurred."
                    : "The request could not be completed.";
        };
    }
}
