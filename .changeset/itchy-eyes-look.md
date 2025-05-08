---
"@changesets/action": patch
---

Make git add work consistently with subdirectories

Ensure that when running the action from a subdirectory of a repository,
only the files from that directory are added, regardless of `commitMode`.