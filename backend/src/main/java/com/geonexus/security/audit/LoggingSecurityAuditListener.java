package com.geonexus.security.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class LoggingSecurityAuditListener {

    private static final Logger log = LoggerFactory.getLogger("security-audit");

    @EventListener
    public void on(SecurityAuditEvent event) {
        log.info("type={} subject={} ip={} detail={}", event.type(), event.subject(), event.ip(), event.detail());
    }
}
