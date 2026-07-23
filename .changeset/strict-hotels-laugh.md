---
"@changesets/action": major
---

Removed `.npmrc` handling when the `NPM_TOKEN` environment variable is set.

Authentication should be handled via Trusted Publishing instead. If a token is still needed, use `actions/setup-node` to set it up instead via the `registry-url` option. Check out the updated action README for more information of setting up npm authentication in GitHub Actions.
