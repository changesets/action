---
"@changesets/action": minor
---

Published packages detection done through stdout parsing was replaced with one based on the shared output file using `CHANGESETS_OUTPUT` environment variable. When using custom scripts this environment variable should always be passed down to the Changesets CLI invocations.
