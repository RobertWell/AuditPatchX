# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Cache dependencies first
COPY backend/pom.xml .
RUN mvn dependency:go-offline -q

# Build (skip tests — tests run in CI with testcontainer)
COPY backend/src ./src
RUN mvn package -DskipTests -q

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Quarkus fast-jar layout
COPY --from=build /build/target/quarkus-app/lib/           ./lib/
COPY --from=build /build/target/quarkus-app/*.jar          ./
COPY --from=build /build/target/quarkus-app/app/           ./app/
COPY --from=build /build/target/quarkus-app/quarkus/       ./quarkus/

# Config overlay directory — mount a ConfigMap here in Kubernetes
RUN mkdir -p /app/config

EXPOSE 8080
ENV JAVA_OPTS="-Djava.util.logging.manager=org.jboss.logmanager.LogManager"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar quarkus-run.jar"]
