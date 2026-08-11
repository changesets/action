---
"@changesets/action": major
---

Rename the root action inputs and outputs to better match the sub-actions' conventions.

Inputs:

- `version` -> `version-script`
- `publish` -> `publish-script`
- `commit` -> `commit-message`
- `title` -> `pr-title`
- `branch` -> `pr-base-branch`

Outputs:

- `pull-request-number` -> `pr-number`
