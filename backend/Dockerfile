# Multi-stage Dockerfile for GeoNexus Spring Boot backend
# Stage 1: Build JAR
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder
WORKDIR /workspace

# Copy POM and download dependencies for offline layer caching
COPY pom.xml .
RUN mvn dependency:go-offline -B || true

# Copy source and package application fat JAR
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Minimal hardened runtime image
FROM eclipse-temurin:21-jre-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup -S geonexus && adduser -S geonexus -G geonexus

COPY --from=builder /workspace/target/geonexus-backend-*.jar app.jar
RUN chown -R geonexus:geonexus /app

USER geonexus

EXPOSE 8080

# Memory-efficient JVM settings for Render Free Tier (512 MB RAM limit):
# - MaxRAMPercentage=65.0 keeps maximum heap under ~330 MB
# - UseSerialGC minimizes GC thread overhead (ideal for 0.1 CPU)
# - Xss512k reduces per-thread stack allocation
# - MaxMetaspaceSize bounds class metadata
# - ExitOnOutOfMemoryError ensures clean restart on memory pressure
ENV JAVA_OPTS="-XX:MaxRAMPercentage=65.0 -XX:MinRAMPercentage=40.0 -XX:+UseSerialGC -Xss512k -XX:MaxMetaspaceSize=160m -XX:+ExitOnOutOfMemoryError -Djava.security.egd=file:/dev/./urandom"

HEALTHCHECK --interval=30s --timeout=5s --start-period=35s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/api/v1/health || exit 1

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Dserver.port=${PORT:-8080} -jar app.jar"]
