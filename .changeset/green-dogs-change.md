---
"@changesets/action": major
---

Start using GitHub API to push tags and commits to repos

Rather than use local git commands to push changes to GitHub,
this action now uses the GitHub API directly,
which means that all tags and commits will be attributed to the user whose
GITHUB_TOKEN is used, and signed.
