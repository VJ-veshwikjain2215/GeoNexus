package com.geonexus.security.bootstrap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.geonexus.security.config.SecurityProperties;
import com.geonexus.user.Role;
import com.geonexus.user.RoleName;
import com.geonexus.user.RoleRepository;
import com.geonexus.user.User;
import com.geonexus.user.UserRepository;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AdminBootstrapRunnerTest {

    @Mock UserRepository userRepository;
    @Mock RoleRepository roleRepository;
    @Mock PasswordEncoder passwordEncoder;

    private Role adminRole;

    @BeforeEach
    void setUp() {
        adminRole = new Role((short) 1, RoleName.ADMIN, "Administers accounts and can read the audit trail");
    }

    private static SecurityProperties propsWithBootstrap(boolean enabled, String username, String password,
                                                         String email, String displayName) {
        return new SecurityProperties(
                new SecurityProperties.Jwt("dummy_secret_of_at_least_32_characters_length_ok", "geonexus", "geonexus-api", Duration.ofMinutes(30)),
                new SecurityProperties.Cors(List.of("http://localhost:5173"), 3600),
                new SecurityProperties.Login(5, Duration.ofMinutes(15)),
                new SecurityProperties.BootstrapAdmin(enabled, username, password, email, displayName)
        );
    }

    @Test
    void provisionsAdminWhenEnabledWithValidCredentials() {
        var props = propsWithBootstrap(true, "superadmin", "P@ssw0rd1234!", "superadmin@geonexus.internal", "Super Administrator");
        var runner = new AdminBootstrapRunner(userRepository, roleRepository, passwordEncoder, props);

        when(userRepository.existsByUsernameIgnoreCase("superadmin")).thenReturn(false);
        when(roleRepository.findByName(RoleName.ADMIN)).thenReturn(Optional.of(adminRole));
        when(passwordEncoder.encode("P@ssw0rd1234!")).thenReturn("$2a$12$hashedPasswordExample");

        runner.run(new DefaultApplicationArguments());

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();

        assertThat(saved.getUsername()).isEqualTo("superadmin");
        assertThat(saved.getEmail()).isEqualTo("superadmin@geonexus.internal");
        assertThat(saved.getDisplayName()).isEqualTo("Super Administrator");
        assertThat(saved.getPasswordHash()).isEqualTo("$2a$12$hashedPasswordExample");
        assertThat(saved.hasRole(RoleName.ADMIN)).isTrue();
    }

    @Test
    void doesNothingWhenDisabled() {
        var props = propsWithBootstrap(false, "admin", "P@ssw0rd1234!", "admin@geonexus.internal", "Admin");
        var runner = new AdminBootstrapRunner(userRepository, roleRepository, passwordEncoder, props);

        runner.run(new DefaultApplicationArguments());

        verify(userRepository, never()).existsByUsernameIgnoreCase(anyString());
        verify(userRepository, never()).save(any());
    }

    @Test
    void skipsWhenAdminUserAlreadyExists() {
        var props = propsWithBootstrap(true, "existingadmin", "P@ssw0rd1234!", "admin@geonexus.internal", "Admin");
        var runner = new AdminBootstrapRunner(userRepository, roleRepository, passwordEncoder, props);

        when(userRepository.existsByUsernameIgnoreCase("existingadmin")).thenReturn(true);

        runner.run(new DefaultApplicationArguments());

        verify(userRepository, never()).save(any());
    }

    @Test
    void skipsWhenCredentialsAreBlank() {
        var props = propsWithBootstrap(true, "  ", "", "admin@geonexus.internal", "Admin");
        var runner = new AdminBootstrapRunner(userRepository, roleRepository, passwordEncoder, props);

        runner.run(new DefaultApplicationArguments());

        verify(userRepository, never()).existsByUsernameIgnoreCase(anyString());
        verify(userRepository, never()).save(any());
    }

    @Test
    void rejectsMalformedUsernameOrShortPassword() {
        // Username with invalid characters
        var props1 = propsWithBootstrap(true, "admin@invalid!", "P@ssw0rd1234!", "admin@geonexus.internal", "Admin");
        var runner1 = new AdminBootstrapRunner(userRepository, roleRepository, passwordEncoder, props1);
        runner1.run(new DefaultApplicationArguments());
        verify(userRepository, never()).save(any());

        // Password too short (< 8 chars)
        var props2 = propsWithBootstrap(true, "validadmin", "short", "admin@geonexus.internal", "Admin");
        var runner2 = new AdminBootstrapRunner(userRepository, roleRepository, passwordEncoder, props2);
        runner2.run(new DefaultApplicationArguments());
        verify(userRepository, never()).save(any());
    }
}
