package com.geonexus.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.geonexus.security.account.UserAccount;
import com.geonexus.security.audit.SecurityAuditEvent;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.security.config.SecurityProperties;
import com.geonexus.security.jwt.JwtService;
import com.jayway.jsonpath.JsonPath;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(classes = SecurityTestConfiguration.class, properties = {
        "geonexus.security.jwt.secret=" + TestKeys.SECRET,
        "geonexus.security.cors.allowed-origins=http://localhost:5173"
})
@RecordApplicationEvents
class AuthApiIntegrationTest {

    @Autowired WebApplicationContext context;
    @Autowired JwtService jwtService;
    @Autowired InMemoryUserAccountProvider accounts;
    @Autowired ApplicationEvents events;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    // ---------- helpers ----------

    private static String loginJson(String user, String pass) {
        return "{\"username\":\"" + user + "\",\"password\":\"" + pass + "\"}";
    }

    private ResultActions login(String user, String pass) throws Exception {
        return mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(loginJson(user, pass)));
    }

    private String tokenFor(String user) throws Exception {
        String body = login(user, TestKeys.PASSWORD).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.accessToken");
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private static SecurityProperties props(String secret, String issuer) {
        return new SecurityProperties(
                new SecurityProperties.Jwt(secret, issuer, "geonexus-api", Duration.ofMinutes(30)),
                new SecurityProperties.Cors(List.of("http://localhost:5173"), 3600),
                new SecurityProperties.Login(5, Duration.ofMinutes(15)));
    }

    private AuthenticatedUser principal(String id) {
        return AuthenticatedUser.from(accounts.get(id), false);
    }

    // ---------- login ----------

    @Test
    void loginSucceedsAndReturnsBearerTokenWithoutSecrets() throws Exception {
        String body = login("Admin1 ", TestKeys.PASSWORD) // username is trimmed + case-insensitive
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, org.hamcrest.Matchers.containsString("no-store")))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresInSeconds").value(1800))
                .andExpect(jsonPath("$.user.username").value("admin1"))
                .andExpect(jsonPath("$.user.roles[0]").value("ADMIN"))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain("passwordHash").doesNotContain("$2a$").doesNotContain(TestKeys.PASSWORD);
        String token = JsonPath.read(body, "$.accessToken");
        assertThat(jwtService.parse(token).userId()).isEqualTo("u-admin");
    }

    @Test
    void tokenFromLoginAuthenticatesMeEndpoint() throws Exception {
        mvc.perform(get("/api/v1/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(tokenFor("surveyor1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("surveyor1"))
                .andExpect(jsonPath("$.roles[0]").value("SURVEYOR"));
    }

    @Test
    void wrongPasswordAndUnknownUserGetIdenticalGenericResponse() throws Exception {
        String wrongPassword = login("viewer1", "wrong-password-1").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andReturn().getResponse().getContentAsString();
        String unknownUser = login("ghost-user", "wrong-password-1").andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"))
                .andReturn().getResponse().getContentAsString();

        assertThat((String) JsonPath.read(wrongPassword, "$.message"))
                .isEqualTo(JsonPath.read(unknownUser, "$.message"));
        assertThat(wrongPassword).doesNotContain("wrong-password-1").doesNotContain("viewer1");
    }

    @Test
    void disabledAccountCannotLogInAndLooksLikeBadCredentials() throws Exception {
        login("disabled1", TestKeys.PASSWORD).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void failedLoginPublishesAuditEventWithoutPassword() throws Exception {
        login("reviewer1", "audit-secret-pw").andExpect(status().isUnauthorized());
        List<SecurityAuditEvent> failures = events.stream(SecurityAuditEvent.class)
                .filter(e -> e.type() == SecurityAuditEvent.Type.LOGIN_FAILURE).toList();
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0).toString()).doesNotContain("audit-secret-pw");
    }

    @Test
    void repeatedFailuresLockOutEvenTheCorrectPassword() throws Exception {
        for (int i = 0; i < 5; i++) {
            login("lockout1", "bad-password-" + i).andExpect(status().isUnauthorized());
        }
        login("lockout1", TestKeys.PASSWORD).andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
    }

    // ---------- validation ----------

    @Test
    void blankLoginFieldsFailValidationWithoutEchoingValues() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"  \",\"password\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.violations[?(@.field=='username')]").exists())
                .andExpect(jsonPath("$.violations[?(@.field=='password')]").exists());
    }

    @Test
    void overlongPasswordIsRejectedByValidation() throws Exception {
        String longPw = "a".repeat(129);
        String body = login("viewer1", longPw).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain(longPw);
    }

    @Test
    void passwordOverBcryptLimitInBytesIsTreatedAsInvalidCredentials() throws Exception {
        login("viewer1", "é".repeat(60)) // 120 bytes, 60 chars: passes @Size, exceeds BCrypt's 72 bytes
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void malformedJsonReturnsSafeBadRequest() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("JsonParse"))));
    }

    @Test
    void validationAppliesToOtherEndpointsWithConsistentModel() throws Exception {
        mvc.perform(post("/api/v1/probe/validated").header(HttpHeaders.AUTHORIZATION, bearer(tokenFor("surveyor1")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\",\"count\":0}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.violations.length()").value(2));
    }

    // ---------- unauthenticated / token problems ----------

    @Test
    void protectedRouteWithoutTokenIsUnauthorizedJson() throws Exception {
        mvc.perform(get("/api/v1/probe/read"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"))
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void unknownRouteDoesNotRevealExistenceToAnonymousCallers() throws Exception {
        mvc.perform(get("/api/v1/does-not-exist")).andExpect(status().isUnauthorized());
    }

    @Test
    void garbageTokenIsRejected() throws Exception {
        mvc.perform(get("/api/v1/probe/read").header(HttpHeaders.AUTHORIZATION, bearer("not.a.jwt")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOKEN_INVALID"));
    }

    @Test
    void unsignedAlgNoneTokenIsRejected() throws Exception {
        String none = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1LWFkbWluIn0.";
        mvc.perform(get("/api/v1/probe/read").header(HttpHeaders.AUTHORIZATION, bearer(none)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOKEN_INVALID"));
    }

    @Test
    void tamperedSignatureIsRejected() throws Exception {
        String token = tokenFor("admin1");
        int i = token.lastIndexOf('.') + 6;
        char swapped = token.charAt(i) == 'A' ? 'B' : 'A';
        String tampered = token.substring(0, i) + swapped + token.substring(i + 1);
        mvc.perform(get("/api/v1/probe/read").header(HttpHeaders.AUTHORIZATION, bearer(tampered)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOKEN_INVALID"));
    }

    @Test
    void tokenSignedWithAnotherKeyOrIssuerIsRejected() throws Exception {
        JwtService otherKey = new JwtService(props(TestKeys.OTHER_SECRET, "geonexus"), Clock.systemUTC());
        JwtService otherIssuer = new JwtService(props(TestKeys.SECRET, "someone-else"), Clock.systemUTC());
        for (JwtService svc : List.of(otherKey, otherIssuer)) {
            mvc.perform(get("/api/v1/probe/read")
                            .header(HttpHeaders.AUTHORIZATION, bearer(svc.issue(principal("u-admin")))))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("TOKEN_INVALID"));
        }
    }

    @Test
    void expiredTokenIsRejectedWithDistinctCode() throws Exception {
        Clock twoHoursAgo = Clock.fixed(Instant.now().minus(Duration.ofHours(2)), ZoneOffset.UTC);
        String expired = new JwtService(props(TestKeys.SECRET, "geonexus"), twoHoursAgo).issue(principal("u-admin"));
        mvc.perform(get("/api/v1/probe/read").header(HttpHeaders.AUTHORIZATION, bearer(expired)))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, org.hamcrest.Matchers.containsString("invalid_token")))
                .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));
    }

    @Test
    void validTokenForDeletedOrDisabledUserIsRejected() throws Exception {
        String token = tokenFor("temp1");
        UserAccount original = accounts.get("u-temp");
        accounts.remove("u-temp");
        try {
            mvc.perform(get("/api/v1/probe/read").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("TOKEN_INVALID"));
        } finally {
            accounts.restore(original);
        }
        UserAccount disabled = new UserAccount(original.id(), original.username(), original.passwordHash(),
                original.roles(), false, true);
        accounts.restore(disabled);
        try {
            mvc.perform(get("/api/v1/probe/read").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isUnauthorized());
        } finally {
            accounts.restore(original);
        }
    }

    // ---------- authorization ----------

    @Test
    void routeRuleBlocksNonAdministratorsFromAdminPaths() throws Exception {
        mvc.perform(get("/api/v1/admin/probe").header(HttpHeaders.AUTHORIZATION, bearer(tokenFor("viewer1"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(get("/api/v1/admin/probe").header(HttpHeaders.AUTHORIZATION, bearer(tokenFor("admin1"))))
                .andExpect(status().isOk());
    }

    @Test
    void methodSecurityEnforcesRoleMatrixWithJsonForbidden() throws Exception {
        String viewer = bearer(tokenFor("viewer1"));
        String surveyor = bearer(tokenFor("surveyor1"));
        String reviewer = bearer(tokenFor("reviewer1"));
        String admin = bearer(tokenFor("admin1"));

        mvc.perform(get("/api/v1/probe/read").header(HttpHeaders.AUTHORIZATION, viewer)).andExpect(status().isOk());

        mvc.perform(post("/api/v1/probe/survey").header(HttpHeaders.AUTHORIZATION, viewer))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mvc.perform(post("/api/v1/probe/survey").header(HttpHeaders.AUTHORIZATION, reviewer))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/probe/survey").header(HttpHeaders.AUTHORIZATION, surveyor)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/probe/survey").header(HttpHeaders.AUTHORIZATION, admin)).andExpect(status().isOk());

        mvc.perform(post("/api/v1/probe/review").header(HttpHeaders.AUTHORIZATION, surveyor))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/probe/review").header(HttpHeaders.AUTHORIZATION, reviewer)).andExpect(status().isOk());
        mvc.perform(post("/api/v1/probe/review").header(HttpHeaders.AUTHORIZATION, admin)).andExpect(status().isOk());
    }

    // ---------- CORS ----------

    @Test
    void corsPreflightAllowedOnlyForConfiguredOrigin() throws Exception {
        mvc.perform(options("/api/v1/auth/login")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"));

        mvc.perform(options("/api/v1/auth/login")
                        .header(HttpHeaders.ORIGIN, "https://evil.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    // ---------- error safety ----------

    @Test
    void unexpectedExceptionsReturnGenericBodyWithoutInternalDetail() throws Exception {
        String body = mvc.perform(get("/api/v1/probe/boom").header(HttpHeaders.AUTHORIZATION, bearer(tokenFor("viewer1"))))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.errorId").exists())
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("SENSITIVE-INTERNAL-DETAIL").doesNotContain("jdbc").doesNotContain("IllegalState")
                .doesNotContain("at com.geonexus");
    }

    @Test
    void wrongHttpMethodReturnsConsistentErrorModel() throws Exception {
        mvc.perform(get("/api/v1/auth/login").header(HttpHeaders.AUTHORIZATION, bearer(tokenFor("viewer1"))))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void securityHeadersArePresent() throws Exception {
        mvc.perform(get("/api/v1/probe/read"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().exists("Content-Security-Policy"));
    }
}
