package com.geonexus.security.auth;

import com.geonexus.security.account.UserAccountProvider;
import java.util.Locale;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AuthUserDetailsService implements UserDetailsService {

    private final UserAccountProvider accounts;

    public AuthUserDetailsService(UserAccountProvider accounts) {
        this.accounts = accounts;
    }

    public static String normalize(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        return accounts.findByUsername(normalize(username))
                .map(a -> AuthenticatedUser.from(a, true))
                .orElseThrow(() -> new UsernameNotFoundException("user not found"));
    }
}
