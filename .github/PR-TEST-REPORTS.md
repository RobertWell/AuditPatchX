# Pull Request Test Reports

This document describes how test reports are automatically integrated into GitHub Pull Requests.

## Overview

When you create or update a pull request, GitHub Actions automatically:
1. ✅ Runs all backend tests with Oracle Test Containers
2. 📊 Parses test results (passed, failed, skipped)
3. 💬 Posts a comment with a test summary
4. 🔍 Creates a detailed check with individual test results
5. 📎 Uploads test artifacts for download

## What You'll See in Your PR

### 1. PR Comment with Test Summary

A bot will automatically post a comment that looks like this:

---

## 🧪 Backend Test Results

✅ All tests passed!

| Metric | Count |
|--------|-------|
| ✅ **Passed** | 105 |
| ❌ **Failed** | 0 |
| ⏭️ **Skipped** | 0 |
| 📊 **Total** | 105 |

### Test Coverage
- **DatabaseService**: Query, GetByPk, Update, Validate operations
- **SecurityValidationService**: Allowlist, column validation, PK protection
- **TableResource**: All REST API endpoints

### Database
- **Oracle XE** (via Test Containers)
- Real database integration testing

<details>
<summary>📎 Test Artifacts</summary>

Download detailed test reports from the [workflow artifacts](https://github.com/RobertWell/AuditPatchX/actions/runs/123456789).
</details>

---
*Commit: abc123def456*

---

### 2. GitHub Check Status

In the "Checks" tab of your PR, you'll see:

```
✅ Test Results
   105 tests   105 ✅   0s ⏱️
   3 suites     0 💤   0 ❌
   3 files      0 🔥
```

With expandable sections showing:
- ✅ **DatabaseServiceTest** - 30 tests passed
- ✅ **SecurityValidationServiceTest** - 40 tests passed
- ✅ **TableResourceTest** - 35 tests passed

### 3. Detailed Test Results

Click on the check to see individual test results:

```
✅ com.auditpatchx.service.DatabaseServiceTest
   ✅ Query Tests
      ✅ Should query all employees
      ✅ Should query with equality filter
      ✅ Should query with contains filter
      ✅ Should query with multiple filters
   ✅ GetByPk Tests
      ✅ Should get employee by primary key
      ✅ Should get record by composite PK
   ✅ Update Tests
      ✅ Should update employee salary
      ✅ Should update multiple fields

✅ com.auditpatchx.service.SecurityValidationServiceTest
   ✅ ValidateAndGetColumns Tests
      ✅ Should return columns for allowed table
      ✅ Should throw SecurityException for non-allowlisted table
   ✅ ValidateColumns Tests
      ✅ Should accept valid columns
      ✅ Should throw SecurityException for invalid columns

✅ com.auditpatchx.resource.TableResourceTest
   ✅ GET /api/tables - List Tables
      ✅ Should list all allowed tables
   ✅ POST /api/tables/query - Query Table
      ✅ Should query all employees
      ✅ Should query with filter
   ✅ POST /api/tables/record/update - Update Record
      ✅ Should update employee salary
      ✅ Should return 400 when reason is missing
```

### 4. Failed Tests (Example)

If tests fail, the comment will show:

---

## 🧪 Backend Test Results

❌ Some tests failed

| Metric | Count |
|--------|-------|
| ✅ **Passed** | 103 |
| ❌ **Failed** | 2 |
| ⏭️ **Skipped** | 0 |
| 📊 **Total** | 105 |

---

And the check will show:

```
❌ Test Results
   105 tests   103 ✅   1s ⏱️
   3 suites     0 💤   2 ❌
   3 files      0 🔥
```

With detailed failure information:
```
❌ com.auditpatchx.service.DatabaseServiceTest
   ✅ Query Tests (9 passed)
   ❌ Update Tests
      ✅ Should update employee salary
      ❌ Should update multiple fields
         Expected: 200
         Actual: 403
         java.lang.AssertionError: Status code doesn't match
            at com.auditpatchx.service.DatabaseServiceTest.testUpdateMultipleFields(...)
```

## Features

### Auto-Update Comments
- The bot automatically **updates** the existing comment on new commits
- No spam - only one comment per PR
- Always shows the latest test results

### Downloadable Artifacts
- Full Surefire XML reports
- JUnit test reports
- Available for 30 days
- Accessible from the Actions tab

### Status Checks
- **Required checks** can be configured to block PR merging if tests fail
- Shows test status directly in the PR conversation
- Includes detailed test duration and statistics

### Comparison with Previous Runs
- Test results are compared to earlier commits
- Shows if tests are improving or regressing
- Helps identify flaky tests

## Configuration

### Required Permissions

The workflow needs these permissions (already configured):
```yaml
permissions:
  contents: read
  checks: write
  pull-requests: write
```

### Customization

You can customize the test report by editing `.github/workflows/backend-tests.yml`:

**Change comment format:**
```yaml
- name: Comment PR with test results
  uses: actions/github-script@v7
  with:
    script: |
      const body = `Your custom format here`;
```

**Adjust artifact retention:**
```yaml
- name: Upload test results
  uses: actions/upload-artifact@v4
  with:
    retention-days: 7  # Change from 30 to 7 days
```

**Modify test summary settings:**
```yaml
- name: Publish test summary
  uses: EnricoMi/publish-unit-test-result-action@v2
  with:
    comment_mode: update last  # Options: always, update last, off
    report_individual_runs: true
    deduplicate_classes_by_file_name: false
```

## Workflow Triggers

Tests run automatically on:

### Pull Requests
- When PR is opened
- On every new commit pushed to PR
- When PR is synchronized

### Direct Pushes
- Push to `main` branch
- Push to any `claude/**` branch

### Path Filtering
Tests only run when these paths change:
- `backend/**` (any backend code)
- `.github/workflows/backend-tests.yml` (workflow itself)

## Example PR Workflow

1. **Open PR** → Tests start automatically
2. **First run** → Comment posted with results
3. **Push new commit** → Tests run again, comment updates
4. **Tests pass** → Green checkmark, ready to merge
5. **Tests fail** → Red X, review failures before merging

## Accessing Detailed Reports

### From PR Comment
Click the workflow artifacts link in the test results comment

### From Actions Tab
1. Go to **Actions** → **Backend Tests**
2. Click on the specific workflow run
3. Scroll to **Artifacts** section
4. Download **test-results.zip**

### From Checks Tab
1. Go to PR **Checks** tab
2. Click **Test Results** check
3. View detailed test breakdown
4. Click individual tests for stack traces

## Troubleshooting

### Comment Not Appearing
- Check workflow permissions are set correctly
- Verify the workflow completed successfully
- Check if `github.event_name == 'pull_request'` condition is met

### Test Results Not Found
- Ensure Maven tests are running (`mvn test`)
- Verify `target/surefire-reports/` directory contains XML files
- Check step `Check test results exist` output

### Outdated Test Results
- Push a new commit to trigger workflow
- Manually re-run the workflow from Actions tab
- Check if workflow is triggered by path filters

## Benefits

✅ **Immediate Feedback** - See test results directly in PR
✅ **No Context Switching** - Don't need to open Actions tab
✅ **Historical Record** - Comments preserved even after merge
✅ **Reviewer Friendly** - Reviewers see test status at a glance
✅ **CI/CD Integration** - Blocks merging if tests fail (optional)
✅ **Detailed Reports** - Full test breakdown with artifacts

## Best Practices

1. **Review test results** before requesting reviews
2. **Fix failing tests** before pushing
3. **Keep test suite fast** - aim for <5 minutes
4. **Write descriptive test names** - they appear in reports
5. **Use test artifacts** for debugging complex failures
6. **Configure required checks** to enforce passing tests

## Related Documentation

- [Backend Test Documentation](../backend/src/test/README.md)
- [CI/CD Guide](./CI-CD.md)
- [GitHub Actions Workflow](./workflows/backend-tests.yml)

## Support

If you encounter issues with test reporting:
1. Check the Actions tab for workflow logs
2. Review the test results artifact
3. Verify Docker/Test Containers are working
4. Check GitHub permissions settings
