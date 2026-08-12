---
"@changesets/action": minor
---

Add a `cwd` input to the root action, `/select-mode`, `/version`, `/pack`, and `/publish` sub-actions to set the current working directory to execute Changesets in. This input existed in v1 but was incorrectly removed.
