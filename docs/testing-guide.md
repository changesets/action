# OIDC Testing Guide

## Quick Test Using This Workflow

1. Push the test workflow to your fork:
   ```bash
   git add .github/workflows/test-oidc-validation.yml
   git commit -m "test: add OIDC validation test workflow"
   git push origin main
   ```

2. Run the workflow manually from GitHub Actions UI:
   - Go to Actions tab
   - Select "Test OIDC Validation"
   - Run workflow with different scenarios

## Full End-to-End Test (If Needed)

### 1. Create Test Package Repository

```bash
# Create a new test repo
mkdir changesets-oidc-test
cd changesets-oidc-test
npm init -y

# Update package.json
cat > package.json <<'EOF'
{
  "name": "@YOUR_NPM_USERNAME/changesets-oidc-test",
  "version": "0.0.1",
  "description": "Test package for OIDC changesets",
  "main": "index.js",
  "scripts": {
    "release": "changeset publish"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/YOUR_USERNAME/changesets-oidc-test.git"
  }
}
EOF

# Create minimal package
echo 'module.exports = "test";' > index.js

# Initialize changesets
npx @changesets/cli init
```

### 2. Configure npm OIDC Trusted Publishing

1. Go to npmjs.com → Your Profile → Publishing Access
2. Add a trusted publisher:
   - Source: GitHub Actions
   - Repository: `YOUR_USERNAME/changesets-oidc-test`
   - Workflow file: `.github/workflows/release.yml`
   - Environment: (leave empty or specify)

### 3. Create Workflow in Test Repo

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    branches:
      - main

permissions:
  contents: write
  pull-requests: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm install -g npm@latest
      - run: yarn install

      - uses: GarthDB/changesets-action@v1.6.9
        with:
          publish: yarn release
          oidcAuth: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 4. Create a Test Changeset

```bash
npx changeset add
# Select patch
# Describe changes
# Commit and push
```

### 5. Monitor the Workflow

Watch the GitHub Actions run to verify:
- ✅ OIDC validation passes
- ✅ Version PR is created
- ✅ After merging, package publishes successfully
- ✅ Provenance attestation is generated

## Recommended Approach

Given that:
1. Your code is already tested in production (Adobe spectrum-design-data)
2. We only simplified redundant code without changing functionality
3. All 30 tests pass locally

**Recommendation: Use Option 1 or 2 first**

- Push test workflow to your fork
- Run validation tests
- If those pass, you're ready for PR

**Only create a full test package if:**
- Maintainers request it
- You want extra confidence
- You need to debug an issue
