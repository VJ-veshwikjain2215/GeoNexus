package com.geonexus.security.dto;

import com.geonexus.security.Role;
import com.geonexus.security.auth.AuthenticatedUser;
import java.util.List;

public record UserSummary(String id, String username, List<Role> roles) {

    public static UserSummary from(AuthenticatedUser user) {
        return new UserSummary(user.getId(), user.getUsername(), user.getRoles().stream().sorted().toList());
    }
}
