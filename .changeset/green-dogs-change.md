---
"@changesets/action": minor
---

Introduce a new input `commitMode` that allows using the GitHub API for pushing tags and commits instead of the Git CLI.

When used with `"github-api"` value all tags and commits will be attributed to the user whose GITHUB_TOKEN is used, and also signed using GitHub's internal GPG key.
