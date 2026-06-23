# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build

# Cache Maven dependencies first (layer only invalidated when pom.xml changes)
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    mvn dependency:go-offline -q 2>/dev/null || true

# Copy source and build
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn package -DskipTests -q

# Extract Spring Boot layered jar for optimal layer caching
# (Spring Boot 3.3+: layertools renamed to tools; fallback keeps backward compat)
RUN java -Djarmode=tools -jar target/*.jar extract --layers --launcher --destination /app \
    || java -Djarmode=layertools -jar target/*.jar extract --destination /app

# ── Stage 2: Runtime ────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Non-root user for Cloud Run security
RUN addgroup -S myaba && adduser -S myaba -G myaba
USER myaba

# Copy layered jar contents (order matters — least to most frequently changing)
COPY --from=builder /app/dependencies/ ./
COPY --from=builder /app/spring-boot-loader/ ./
COPY --from=builder /app/snapshot-dependencies/ ./
COPY --from=builder /app/application/ ./

EXPOSE 8080

# Use exec form so signals are forwarded correctly (important for Cloud Run drain)
ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "org.springframework.boot.loader.launch.JarLauncher"]
