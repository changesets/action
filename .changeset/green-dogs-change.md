---
"@changesets/action": minor
---

Introduce a new input commitUsingApi that allows pushing tags and commits
using the GitHub API instead of the git CLI.

When used, this means means that all tags and commits will be attributed
to the user whose GITHUB_TOKEN is used,
and also signed using GitHub's internal GPG key.
