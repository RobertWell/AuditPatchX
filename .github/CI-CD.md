# CI/CD Documentation for AuditPatchX

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for the AuditPatchX project.

## Overview

The AuditPatchX project uses GitHub Actions for automated testing and deployment. The CI/CD pipeline ensures code quality, runs comprehensive tests, and validates builds before merging.

## Workflows

### 1. Backend Tests (`backend-tests.yml`)

**Triggers:**
- Push to `main` branch
- Push to `claude/**` branches
- Pull requests to `main` branch
- Only when backend code or workflow files change

**Jobs:**

#### Test Job
Runs comprehensive integration tests with Oracle DB using Test Containers.

**Steps:**
1. **Checkout code**: Clone the repository
2. **Set up JDK 17**: Install Java 17 (Temurin distribution)
3. **Cache Maven packages**: Cache dependencies for faster builds
4. **Build with Maven**: Compile the project without running tests
5. **Run tests**: Execute all tests including:
   - DatabaseServiceTest (30+ tests)
   - SecurityValidationServiceTest (40+ tests)
   - TableResourceTest (35+ tests)
6. **Generate test report**: Create Surefire test reports
7. **Upload test results**: Save test results as artifacts (30-day retention)
8. **Publish test summary**: Display test results in GitHub UI

**Environment:**
- Ubuntu Latest
- JDK 17
- Maven (latest)
- Docker (for Test Containers)

**Test Requirements:**
- Docker must be available for Oracle Test Containers
- Internet access for downloading Oracle XE container image
- Sufficient memory for Oracle DB container (~2GB)

#### Docker Build Job
Validates that the backend can be containerized.

**Steps:**
1. **Checkout code**: Clone the repository
2. **Set up Docker Buildx**: Prepare Docker build environment
3. **Build Docker image**: Create backend Docker image (if Dockerfile exists)

**Dependencies:**
- Runs only after test job succeeds
- Validates production build configuration

## Test Coverage

The CI pipeline runs the following test suites:

### DatabaseServiceTest
- **Query Operations**: 10 tests
  - Filter operators (eq, contains, startsWith, gt, gte, lt, lte)
  - Multiple filters
  - Limit enforcement
  - Security validation

- **GetByPk Operations**: 4 tests
  - Single PK retrieval
  - Composite PK retrieval
  - Not found handling
  - Invalid PK validation

- **Patch Validation**: 3 tests
  - Valid patch acceptance
  - Invalid column rejection
  - PK modification prevention

- **Update Operations**: 4 tests
  - Single/multiple field updates
  - PK update prevention
  - Invalid column validation
  - Transaction handling

- **Metadata Operations**: 5 tests
  - Table metadata retrieval
  - Composite PK support
  - Column type information
  - Security validation

### SecurityValidationServiceTest
- **Column Validation**: 15 tests
  - Allowlist enforcement
  - Column metadata caching
  - Case-insensitive validation
  - Invalid column detection

- **PK Validation**: 10 tests
  - Single and composite PK validation
  - PK completeness checks
  - PK update prevention

- **Metadata Operations**: 8 tests
  - Detailed column metadata
  - Type and nullability information
  - Cache management

### TableResourceTest
- **API Endpoints**: 35+ tests
  - GET /api/tables (2 tests)
  - POST /api/tables/query (5 tests)
  - POST /api/tables/record/get (4 tests)
  - POST /api/tables/record/validate-patch (3 tests)
  - POST /api/tables/record/update (5 tests)
  - GET /api/tables/db/tables/{schema}/{table} (5 tests)

## Running Tests Locally

### Prerequisites
```bash
# Install JDK 17
sudo apt-get install openjdk-17-jdk

# Install Maven
sudo apt-get install maven

# Install Docker
sudo apt-get install docker.io
sudo usermod -aG docker $USER
```

### Run Tests
```bash
cd backend

# Run all tests
mvn clean test

# Run specific test class
mvn test -Dtest=DatabaseServiceTest

# Run with coverage
mvn clean test jacoco:report
```

### View Test Results
```bash
# Test results location
backend/target/surefire-reports/

# HTML report
backend/target/surefire-reports/index.html

# Coverage report (if jacoco enabled)
backend/target/site/jacoco/index.html
```

## Test Containers Configuration

The CI pipeline uses Test Containers to spin up an Oracle XE database for integration testing.

**Container Details:**
- Image: `gvenzl/oracle-xe:21-slim-faststart`
- Database: XEPDB1
- User: test/test
- Schema: TESTUSER
- Startup time: ~30-60 seconds

**Resource Requirements:**
- Memory: 2GB minimum
- Disk: 1GB for container image
- Network: Internet access for initial image pull

**Benefits:**
- Real Oracle DB testing (not mocks)
- Isolated test environment
- Reproducible tests
- No external dependencies

## Status Badges

Add these badges to your README.md to display CI status:

```markdown
![Backend Tests](https://github.com/RobertWell/AuditPatchX/workflows/Backend%20Tests/badge.svg)
```

## Artifacts

The CI pipeline produces the following artifacts:

### Test Results
- **Location**: Uploaded to GitHub Actions artifacts
- **Retention**: 30 days
- **Contents**:
  - Surefire XML reports
  - Test output logs
  - Error stack traces

### Test Reports
- **Format**: XML (JUnit format)
- **Publishing**: GitHub UI via publish-unit-test-result-action
- **Features**:
  - Test count summary
  - Pass/fail status
  - Test duration
  - Failure details

## Environment Variables

The following environment variables are used in CI:

### Required
None - all configuration is in code or default values

### Optional
- `TESTCONTAINERS_RYUK_DISABLED`: Control Ryuk container cleanup (default: false)
- `MAVEN_OPTS`: Maven JVM options (e.g., memory settings)

## Caching Strategy

The pipeline uses caching to improve build times:

### Maven Dependencies Cache
- **Key**: OS + hash of pom.xml
- **Path**: ~/.m2
- **Benefit**: Skip dependency downloads on subsequent runs
- **Invalidation**: Automatic when pom.xml changes

### Docker Layer Cache
- **Strategy**: Docker Buildx cache
- **Benefit**: Faster Docker builds
- **Invalidation**: Automatic when base images change

## Failure Handling

### Test Failures
- Pipeline fails if any test fails
- Test results uploaded regardless of success/failure
- Failure details visible in GitHub Actions logs and summary

### Build Failures
- Maven compile failures stop the pipeline immediately
- Error logs available in Actions console

### Container Failures
- Test Containers failures logged with details
- Common issues:
  - Docker not available
  - Insufficient memory
  - Network connectivity (image pull)

## Performance Optimization

### Parallel Test Execution
JUnit 5 supports parallel test execution. To enable:

```xml
<!-- In pom.xml -->
<plugin>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <parallel>classes</parallel>
        <threadCount>4</threadCount>
    </configuration>
</plugin>
```

### Container Reuse
Test Containers can reuse containers across test classes for faster execution:

```kotlin
@Container
@JvmStatic
val oracle = OracleContainer(...)
    .withReuse(true)
```

## Best Practices

1. **Run tests locally** before pushing
2. **Keep tests fast** - aim for <5 minutes total
3. **Use meaningful test names** - descriptive @DisplayName annotations
4. **Clean up resources** - Test Containers handles this automatically
5. **Monitor CI performance** - watch for slowdowns
6. **Cache dependencies** - already configured in workflow
7. **Fail fast** - configure to stop on first failure if needed

## Troubleshooting

### Tests Pass Locally But Fail in CI
- Check for environment-specific code
- Verify Test Containers Docker access
- Check memory limits in CI

### Slow Test Execution
- Enable parallel execution
- Optimize container startup
- Use container reuse
- Review test data setup

### Container Pull Failures
- Check GitHub Actions runner network access
- Verify container image availability
- Consider using a cached image

### Memory Issues
- Increase GitHub Actions runner memory (if self-hosted)
- Reduce parallel test threads
- Optimize container resource limits

## Future Enhancements

### Code Coverage
Add Jacoco for code coverage reporting:

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.11</version>
    <executions>
        <execution>
            <goals>
                <goal>prepare-agent</goal>
                <goal>report</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

### Deployment
Add deployment jobs:
- Build and push Docker images
- Deploy to staging environment
- Run smoke tests
- Deploy to production

### Security Scanning
Add security scanning:
- OWASP Dependency Check
- Container vulnerability scanning
- Static code analysis (SonarQube)

### Performance Testing
Add performance tests:
- Load testing with JMeter
- Benchmark tests
- Database query performance

## Support

For CI/CD issues:
1. Check GitHub Actions logs
2. Review test results artifacts
3. Run tests locally to reproduce
4. Check Test Containers documentation
5. Review Maven build logs

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Test Containers Documentation](https://www.testcontainers.org/)
- [Maven Surefire Plugin](https://maven.apache.org/surefire/maven-surefire-plugin/)
- [JUnit 5 Documentation](https://junit.org/junit5/docs/current/user-guide/)
