---
"@changesets/action": major
---

Replace `commit-mode` with the boolean `push-with-git-cli` input. GitHub API pushes are used by default; set `push-with-git-cli` to `true` to push release commits and tags with the Git CLI.
