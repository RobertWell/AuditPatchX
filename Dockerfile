# ── Stage 1: build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: build backend ────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /build

# Cache Maven dependencies first
COPY backend/pom.xml .
RUN mvn dependency:go-offline -q

# vite outDir is ../backend/src/main/resources/META-INF/resources (relative to /frontend WORKDIR)
# which resolves to /backend/src/main/resources/META-INF/resources inside the build stage
COPY --from=frontend-build /backend/src/main/resources/META-INF/resources/ \
     src/main/resources/META-INF/resources/

# Build backend (tests run in CI with testcontainer, skip here)
COPY backend/src ./src
RUN mvn package -DskipTests -q

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

COPY --from=backend-build /build/target/quarkus-app/lib/     ./lib/
COPY --from=backend-build /build/target/quarkus-app/*.jar    ./
COPY --from=backend-build /build/target/quarkus-app/app/     ./app/
COPY --from=backend-build /build/target/quarkus-app/quarkus/ ./quarkus/

RUN mkdir -p /app/config

EXPOSE 8080
ENV JAVA_OPTS="-Djava.util.logging.manager=org.jboss.logmanager.LogManager"
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar quarkus-run.jar"]
