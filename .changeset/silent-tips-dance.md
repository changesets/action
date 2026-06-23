---
"@changesets/action": patch
---

Fix the `/version` subaction to not crash on missing `pr-base-branch` input. This input is meant to be optional.
