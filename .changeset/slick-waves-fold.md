---
"@changesets/action": patch
---

Improved force-push handling when using `commitMode: "github-api"` so updating an existing branch no longer temporarily resets the target branch to the base commit, avoiding cases where GitHub closes open pull requests during the update. This should remove a possibility of a GitHub state race that caused the force-pushed PRs not being reopened.
