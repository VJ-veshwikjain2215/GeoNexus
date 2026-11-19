package com.geonexus.security.web;

import com.geonexus.common.error.ApiErrorWriter;
import com.geonexus.security.jwt.InvalidTokenException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

/** 401 JSON for missing, invalid or expired credentials. */
@Component
public class RestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final ApiErrorWriter writer;

    public RestAuthenticationEntryPoint(ApiErrorWriter writer) {
        this.writer = writer;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException ex)
            throws IOException {
        if (ex instanceof InvalidTokenException ite) {
            writer.write(request, response, HttpStatus.UNAUTHORIZED,
                    ite.isExpired() ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
                    ite.isExpired() ? "Access token has expired." : "Access token is invalid.",
                    "Bearer error=\"invalid_token\"");
            return;
        }
        writer.write(request, response, HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED",
                "Authentication is required to access this resource.", "Bearer");
    }
}
