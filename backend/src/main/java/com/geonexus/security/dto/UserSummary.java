package com.geonexus.security.dto;

import com.geonexus.security.Role;
import com.geonexus.security.auth.AuthenticatedUser;
import com.geonexus.user.User;
import java.util.List;

public record UserSummary(String id, String username, List<Role> roles) {

    public static UserSummary from(AuthenticatedUser user) {
        if (user == null) {
            return null;
        }
        return new UserSummary(user.getId(), user.getUsername(), user.getRoles().stream().sorted().toList());
    }

    public static UserSummary from(User user) {
        if (user == null) {
            return null;
        }
        List<Role> roles = user.getRoles() != null
                ? user.getRoles().stream()
                        .map(r -> Role.valueOf(r.getName().name()))
                        .sorted()
                        .toList()
                : List.of();
        return new UserSummary(user.getId().toString(), user.getUsername(), roles);
    }
}

