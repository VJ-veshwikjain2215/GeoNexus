package com.geonexus.security.auth;

import com.geonexus.security.Role;
import com.geonexus.security.account.UserAccount;
import java.util.Collection;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** Principal placed in the SecurityContext. Holds the password hash only during credential login. */
public final class AuthenticatedUser implements UserDetails, CredentialsContainer {

    private static final long serialVersionUID = 1L;

    private final String id;
    private final String username;
    private String passwordHash;
    private final Set<Role> roles;
    private final boolean enabled;
    private final boolean accountNonLocked;

    private AuthenticatedUser(String id, String username, String passwordHash, Set<Role> roles,
                              boolean enabled, boolean accountNonLocked) {
        this.id = id;
        this.username = username;
        this.passwordHash = passwordHash;
        this.roles = roles;
        this.enabled = enabled;
        this.accountNonLocked = accountNonLocked;
    }

    public static AuthenticatedUser from(UserAccount account, boolean withPasswordHash) {
        return new AuthenticatedUser(account.id(), account.username(),
                withPasswordHash ? account.passwordHash() : null,
                account.roles(), account.enabled(), account.accountNonLocked());
    }

    public String getId() {
        return id;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return roles.stream().map(r -> new SimpleGrantedAuthority(r.authority())).collect(Collectors.toSet());
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return username;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return accountNonLocked;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    @Override
    public void eraseCredentials() {
        this.passwordHash = null;
    }

    @Override
    public String toString() {
        return "AuthenticatedUser[id=" + id + ", username=" + username + ", roles=" + roles + "]";
    }
}
