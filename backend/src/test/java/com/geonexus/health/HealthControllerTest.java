package com.geonexus.health;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.geonexus.config.WebConfig;

@WebMvcTest(controllers = HealthController.class)
@Import(WebConfig.class)
@TestPropertySource(properties = {
        "spring.application.name=geonexus-backend",
        "geonexus.cors.allowed-origins=http://localhost:5173"
})
class HealthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void healthReturnsUpAsJson() throws Exception {
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
    void unsupportedMethodIsRejectedWithoutDetails() throws Exception {
        mockMvc.perform(post("/api/v1/health"))
                .andExpect(status().isMethodNotAllowed());
    }
}
