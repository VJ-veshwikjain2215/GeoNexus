package com.geonexus.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.geonexus.security.config.CorsConfigurationSourceFactory;
import com.geonexus.security.config.SecurityConfig;
import com.geonexus.security.config.SecurityProperties.Cors;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class CorsConfigurationSourceFactoryTest {

    @Test
    void wildcardAndMalformedOriginsAreRefused() {
        for (String bad : List.of("*", "https://*.example.com", "http://localhost:5173/", "localhost:5173", "null", "")) {
            assertThatThrownBy(() -> CorsConfigurationSourceFactory.create(new Cors(List.of(bad), 3600)))
                    .as(bad).isInstanceOf(IllegalStateException.class);
        }
    }

    @Test
    void exactOriginsAreAccepted() {
        assertThat(CorsConfigurationSourceFactory.create(
                new Cors(List.of("http://localhost:5173", "https://app.example.org"), 3600))).isNotNull();
    }

    @Test
    void passwordsAreHashedWithSaltedBCrypt() {
        PasswordEncoder encoder = new SecurityConfig().passwordEncoder();
        String a = encoder.encode("Correct-Horse-9");
        String b = encoder.encode("Correct-Horse-9");
        assertThat(a).startsWith("$2").isNotEqualTo(b).doesNotContain("Correct-Horse-9");
        assertThat(encoder.matches("Correct-Horse-9", a)).isTrue();
        assertThat(encoder.matches("wrong", a)).isFalse();
    }
}
