package com.geonexus.security.audit;

import java.time.Instant;

/**
 * Published through Spring's event bus. The default listener only logs; a later phase adds a listener
 * that writes to the persistent audit_log table. Values are sanitised against log injection.
 */
public record SecurityAuditEvent(Type type, String subject, String ip, String detail, Instant at) {

    public enum Type {
        LOGIN_SUCCESS, LOGIN_FAILURE, LOGIN_LOCKED_OUT, TOKEN_REJECTED, ACCESS_DENIED
    }

    private static final int MAX_LEN = 100;

    public static SecurityAuditEvent of(Type type, String subject, String ip, String detail) {
        return new SecurityAuditEvent(type, clean(subject), clean(ip), clean(detail), Instant.now());
    }

    static String clean(String value) {
        if (value == null) {
            return "";
        }
        String s = value.replaceAll("[\\p{Cntrl}\\s]+", "_");
        return s.length() > MAX_LEN ? s.substring(0, MAX_LEN) : s;
    }
}
