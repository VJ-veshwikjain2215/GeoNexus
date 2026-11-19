package com.geonexus.security.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "must not be blank") @Size(max = 100, message = "must be at most 100 characters") String username,
        @NotBlank(message = "must not be blank") @Size(max = 128, message = "must be at most 128 characters") String password) {

    /** Records print all components by default; never let the password reach a log line. */
    @Override
    public String toString() {
        return "LoginRequest[username=" + username + ", password=<redacted>]";
    }
}
