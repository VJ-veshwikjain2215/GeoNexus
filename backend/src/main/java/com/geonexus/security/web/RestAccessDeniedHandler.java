package com.geonexus.security.web;

import com.geonexus.common.error.ApiErrorWriter;
import com.geonexus.security.audit.SecurityAuditEvent;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.stereotype.Component;

/** 403 JSON for authenticated users lacking the required role (URL-level rules). */
@Component
public class RestAccessDeniedHandler implements AccessDeniedHandler {

    private final ApiErrorWriter writer;
    private final ApplicationEventPublisher events;

    public RestAccessDeniedHandler(ApiErrorWriter writer, ApplicationEventPublisher events) {
        this.writer = writer;
        this.events = events;
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex)
            throws IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        events.publishEvent(SecurityAuditEvent.of(SecurityAuditEvent.Type.ACCESS_DENIED,
                auth != null ? auth.getName() : "anonymous", request.getRemoteAddr(),
                request.getMethod() + " " + request.getRequestURI()));
        writer.write(request, response, HttpStatus.FORBIDDEN, "FORBIDDEN",
                "You do not have permission to perform this action.", null);
    }
}
