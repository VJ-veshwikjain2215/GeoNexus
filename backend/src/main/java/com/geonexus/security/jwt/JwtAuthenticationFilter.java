package com.geonexus.security.jwt;

import com.geonexus.security.account.UserAccount;
import com.geonexus.security.account.UserAccountProvider;
import com.geonexus.security.audit.SecurityAuditEvent;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.security.web.RestAuthenticationEntryPoint;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates requests carrying {@code Authorization: Bearer <jwt>}. The account is re-loaded from
 * the provider on every request so disabled/locked/deleted users and role changes take effect immediately.
 * A request with no bearer header passes through unauthenticated; the authorization rules then decide.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String PREFIX = "bearer ";

    private final JwtService jwtService;
    private final UserAccountProvider accounts;
    private final RestAuthenticationEntryPoint entryPoint;
    private final ApplicationEventPublisher events;

    public JwtAuthenticationFilter(JwtService jwtService, UserAccountProvider accounts,
                                   RestAuthenticationEntryPoint entryPoint, ApplicationEventPublisher events) {
        this.jwtService = jwtService;
        this.accounts = accounts;
        this.entryPoint = entryPoint;
        this.events = events;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || header.length() < PREFIX.length()
                || !header.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) {
            chain.doFilter(request, response);
            return;
        }
        try {
            JwtClaims claims = jwtService.parse(header.substring(PREFIX.length()).trim());
            UserAccount account = accounts.findById(claims.userId())
                    .orElseThrow(() -> new InvalidTokenException("unknown user", false));
            if (!account.enabled() || !account.accountNonLocked()) {
                throw new InvalidTokenException("account disabled or locked", false);
            }
            AuthenticatedUser principal = AuthenticatedUser.from(account, false);
            UsernamePasswordAuthenticationToken authentication =
                    UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities());
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
        } catch (InvalidTokenException ex) {
            SecurityContextHolder.clearContext();
            events.publishEvent(SecurityAuditEvent.of(SecurityAuditEvent.Type.TOKEN_REJECTED, "unknown",
                    request.getRemoteAddr(), ex.isExpired() ? "expired" : "invalid"));
            entryPoint.commence(request, response, ex);
            return;
        }
        chain.doFilter(request, response);
    }
}
