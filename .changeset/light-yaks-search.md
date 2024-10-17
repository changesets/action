---
"@changesets/action": patch
---

write environment variable references to files instead of the values

Within the `.npmrc` and `.netrc` files, write references to `NODE_AUTH_TOKEN` and `GITHUB_TOKEN` rather than the actual values.
