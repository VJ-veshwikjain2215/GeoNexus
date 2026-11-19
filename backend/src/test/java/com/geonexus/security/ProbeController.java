package com.geonexus.security;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.util.Map;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Minimal endpoints that exercise route rules and method security. Test-only. */
@TestComponent
@RestController
public class ProbeController {

    public record Body(@NotBlank String name, @Min(1) int count) {
    }

    @GetMapping("/api/v1/admin/probe")
    public Map<String, String> admin() {
        return Map.of("status", "ok");
    }

    @GetMapping("/api/v1/probe/read")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public Map<String, String> read() {
        return Map.of("status", "ok");
    }

    @PostMapping("/api/v1/probe/survey")
    @PreAuthorize(SecurityExpressions.SURVEY_WRITE)
    public Map<String, String> survey() {
        return Map.of("status", "ok");
    }

    @PostMapping("/api/v1/probe/review")
    @PreAuthorize(SecurityExpressions.REVIEW)
    public Map<String, String> review() {
        return Map.of("status", "ok");
    }

    @PostMapping("/api/v1/probe/validated")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public Map<String, String> validated(@Valid @RequestBody Body body) {
        return Map.of("status", "ok");
    }

    @GetMapping("/api/v1/probe/boom")
    @PreAuthorize(SecurityExpressions.ANY_ROLE)
    public Map<String, String> boom() {
        throw new IllegalStateException("SENSITIVE-INTERNAL-DETAIL jdbc:postgresql://db/secret");
    }
}
