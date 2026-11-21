package com.geonexus.health;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.geonexus.security.SecurityTestConfiguration;
import com.geonexus.security.TestKeys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** Health stays public and CORS-restricted once Spring Security is in front of it. */
@SpringBootTest(classes = SecurityTestConfiguration.class, properties = {
        "spring.application.name=geonexus-backend",
        "geonexus.cors.allowed-origins=http://localhost:5173",
        "geonexus.security.jwt.secret=" + TestKeys.SECRET,
        "geonexus.security.cors.allowed-origins=http://localhost:5173"
})
@Import(HealthController.class)
class HealthControllerTest {

    @Autowired
    private WebApplicationContext context;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test
    void healthIsPublicAndReturnsUpAsJson() throws Exception {
        mockMvc.perform(get("/api/v1/health").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.service").value("geonexus-backend"))
                .andExpect(jsonPath("$.timestamp").isNotEmpty());
    }

    @Test
    void healthResponseIsNotCacheable() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"));
    }

    @Test
    void healthDoesNotLeakConfigurationDetails() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    void allowedOriginReceivesCorsHeader() throws Exception {
        mockMvc.perform(get("/api/v1/health").header("Origin", "http://localhost:5173"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }

    @Test
    void unknownOriginIsRejected() throws Exception {
        mockMvc.perform(get("/api/v1/health").header("Origin", "http://evil.example"))
                .andExpect(status().isForbidden());
    }

    @Test
    void nonGetRequestsRequireAuthentication() throws Exception {
        mockMvc.perform(post("/api/v1/health"))
                .andExpect(status().isUnauthorized());
    }
}
