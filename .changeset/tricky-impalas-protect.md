---
"@changesets/action": minor
---

Added option to ignore creation or modification of `.npmrc` file.
This resolves issues where the correctly configured `.npmrc` file does not match the assumptions made by the action, such as when authenticating to Azure DevOps Artifact Feeds.
