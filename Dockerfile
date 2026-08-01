# Frontend is built by CI (vite outDir → backend/src/main/resources/META-INF/resources/)
# and passed as an artifact, so this Dockerfile only needs Maven + JRE.

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# HEL-123: RowRelay resolves from the LAN GitLab Maven registry. The default
# (host NodePort) serves local builds; CI passes the in-cluster service DNS.
# ci_settings.xml disables Maven's default http blocker for this in-cluster hop.
ARG ROWRELAY_REPO_URL=http://localhost:30153/api/v4/projects/5/packages/maven

COPY ci_settings.xml /build/ci_settings.xml
COPY backend/pom.xml .
RUN mvn dependency:go-offline -q -s /build/ci_settings.xml -Drowrelay.repo.url=$ROWRELAY_REPO_URL

# Backend source + frontend static files (from CI artifact)
COPY backend/src ./src
RUN mvn package -DskipTests -q -s /build/ci_settings.xml -Drowrelay.repo.url=$ROWRELAY_REPO_URL

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

COPY --from=build /build/target/quarkus-app/lib/     ./lib/
COPY --from=build /build/target/quarkus-app/*.jar    ./
COPY --from=build /build/target/quarkus-app/app/     ./app/
COPY --from=build /build/target/quarkus-app/quarkus/ ./quarkus/

RUN mkdir -p /app/config

EXPOSE 8080
ENV JAVA_OPTS="-Djava.util.logging.manager=org.jboss.logmanager.LogManager"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar quarkus-run.jar"]
