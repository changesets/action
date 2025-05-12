---
"@changesets/action": patch
---

Fix PRs sometimes not getting reopened (with `commitMode: github-api`)

There was a race-condition that means sometimes existing PRs would not be found,
and new PRs would be opened. This has now been fixed by fetching existing PRs
before making any changes.

fixes #487
