package com.geonexus.config;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class WebConfigTest {

    @Test
    void acceptsExactOrigins() {
        assertDoesNotThrow(() -> new WebConfig(new String[] {"http://localhost:5173", " https://app.example.org "}));
    }

    @Test
    void rejectsWildcardOrigin() {
        assertThrows(IllegalStateException.class, () -> new WebConfig(new String[] {"*"}));
        assertThrows(IllegalStateException.class, () -> new WebConfig(new String[] {"https://*.example.org"}));
    }

    @Test
    void rejectsEmptyOriginList() {
        assertThrows(IllegalStateException.class, () -> new WebConfig(new String[] {" ", ""}));
    }
}
