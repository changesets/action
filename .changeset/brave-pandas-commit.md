---
"@changesets/action": major
---

Release commits and tags are now pushed using the GitHub API by default.

Replace the `commit-mode` input with the boolean `push-with-git-cli` input. Set `push-with-git-cli: true` to continue using the Git CLI.

Regardless of the push mode, custom GitHub tokens must be passed explicitly through the `github-token` input. The `GITHUB_TOKEN` environment variable and credentials configured by `actions/checkout` or embedded in remote URLs are not substitutes for this input. When the Git CLI is enabled, `github-token` takes precedence over those repository credentials.
