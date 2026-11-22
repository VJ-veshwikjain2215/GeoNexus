package com.geonexus.security.bootstrap;

import com.geonexus.security.config.SecurityProperties;
import com.geonexus.user.Role;
import com.geonexus.user.RoleName;
import com.geonexus.user.RoleRepository;
import com.geonexus.user.User;
import com.geonexus.user.UserRepository;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Production-safe initial administrator account bootstrapper.
 * Runs on application startup; if enabled via environment configuration,
 * provisions
 * an initial ADMIN user if one does not already exist in the database.
 * Credentials are never hardcoded and are read strictly from configuration
 * properties.
 */
@Component
@Order(10)
@ConditionalOnProperty(prefix = "geonexus.security.bootstrap-admin", name = "enabled", havingValue = "true")
public class AdminBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);
    private static final Pattern USERNAME_PATTERN = Pattern.compile("^[A-Za-z0-9._-]{3,64}$");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^@\\s]+@[^@\\s]+$");
    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final int MAX_BCRYPT_BYTES = 72;

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecurityProperties securityProperties;

    public AdminBootstrapRunner(UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordEncoder passwordEncoder,
            SecurityProperties securityProperties) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordEncoder = passwordEncoder;
        this.securityProperties = securityProperties;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        var bootstrap = securityProperties.bootstrapAdmin();
        if (bootstrap == null || !bootstrap.enabled()) {
            log.debug("Admin bootstrap is disabled. Skipping initial account provisioning.");
            return;
        }

        String username = bootstrap.username() != null ? bootstrap.username().trim() : "";
        String password = bootstrap.password() != null ? bootstrap.password() : "";

        if (username.isBlank() || password.isBlank()) {
            log.warn("Admin bootstrap was enabled but username or password is blank; skipping account provisioning.");
            return;
        }

        if (!USERNAME_PATTERN.matcher(username).matches()) {
            log.error("Admin bootstrap failed: username '{}' violates format constraint ^[A-Za-z0-9._-]{{3,64}}$",
                    username);
            return;
        }

        if (password.length() < MIN_PASSWORD_LENGTH) {
            log.error("Admin bootstrap failed: password length must be at least {} characters.", MIN_PASSWORD_LENGTH);
            return;
        }

        if (password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_BCRYPT_BYTES) {
            log.error("Admin bootstrap failed: password exceeds BCrypt byte capacity of {} bytes.", MAX_BCRYPT_BYTES);
            return;
        }

        if (userRepository.existsByUsernameIgnoreCase(username)) {
            log.info("Admin bootstrap: user '{}' already exists in database; skipping creation.", username);
            return;
        }

        String email = bootstrap.email() != null && !bootstrap.email().isBlank()
                ? bootstrap.email().trim()
                : "admin@geonexus.internal";
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            log.error("Admin bootstrap failed: email '{}' violates standard format constraint.", email);
            return;
        }

        String displayName = bootstrap.displayName() != null && !bootstrap.displayName().isBlank()
                ? bootstrap.displayName().trim()
                : "Cadastral Administrator";

        Role adminRole = roleRepository.findByName(RoleName.ADMIN)
                .orElseThrow(() -> new IllegalStateException(
                        "ADMIN role definition not found in database. Ensure Flyway migrations have executed."));

        String passwordHash = passwordEncoder.encode(password);
        User adminUser = new User(username, email, displayName, passwordHash);
        adminUser.grantRole(adminRole);

        userRepository.save(adminUser);
        log.info("Admin bootstrap: initial administrator account '{}' ({}) successfully provisioned with role ADMIN.",
                username, email);
    }
}
