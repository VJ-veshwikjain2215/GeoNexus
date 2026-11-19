package com.geonexus.security.auth;

import com.geonexus.security.audit.SecurityAuditEvent;
import com.geonexus.security.dto.LoginRequest;
import com.geonexus.security.dto.LoginResponse;
import com.geonexus.security.dto.UserSummary;
import com.geonexus.security.jwt.JwtService;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    /** BCrypt only considers the first 72 bytes; longer inputs are rejected rather than silently truncated. */
    private static final int BCRYPT_MAX_BYTES = 72;

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final LoginAttemptService attempts;
    private final ApplicationEventPublisher events;

    public AuthService(AuthenticationManager authenticationManager, JwtService jwtService,
                       LoginAttemptService attempts, ApplicationEventPublisher events) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.attempts = attempts;
        this.events = events;
    }

    public LoginResponse login(LoginRequest request, String clientIp) {
        String username = AuthUserDetailsService.normalize(request.username());
        String key = username + "|" + clientIp;

        Duration locked = attempts.lockedFor(key).orElse(null);
        if (locked != null) {
            events.publishEvent(SecurityAuditEvent.of(SecurityAuditEvent.Type.LOGIN_LOCKED_OUT, username, clientIp, ""));
            throw new TooManyLoginAttemptsException(locked);
        }

        if (request.password().getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            failed(key, username, clientIp, "password too long");
            throw new InvalidCredentialsException();
        }

        Authentication authenticated;
        try {
            authenticated = authenticationManager.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(username, request.password()));
        } catch (AuthenticationException ex) {
            // Unknown user, bad password, disabled, locked: all look identical to the caller.
            failed(key, username, clientIp, ex.getClass().getSimpleName());
            throw new InvalidCredentialsException();
        }

        AuthenticatedUser user = (AuthenticatedUser) authenticated.getPrincipal();
        attempts.reset(key);
        events.publishEvent(SecurityAuditEvent.of(SecurityAuditEvent.Type.LOGIN_SUCCESS, username, clientIp, ""));
        return new LoginResponse(jwtService.issue(user), "Bearer",
                jwtService.accessTokenTtl().toSeconds(), UserSummary.from(user));
    }

    private void failed(String key, String username, String ip, String reason) {
        attempts.recordFailure(key);
        events.publishEvent(SecurityAuditEvent.of(SecurityAuditEvent.Type.LOGIN_FAILURE, username, ip, reason));
    }
}
