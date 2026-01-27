---
"@changesets/action": patch
---

The `.npmrc` generation now intelligently handles both traditional NPM token authentication and trusted publishing scenarios by only appending the auth token when `NPM_TOKEN` is defined. This prevents 'undefined' from being written to the registry configuration when using OIDC tokens from GitHub Actions trusted publishing.
