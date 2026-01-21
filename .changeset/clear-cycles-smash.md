---
"@changesets/action": minor
---

Support project as well as user `.npmrc` files.

See https://github.com/changesets/action/issues/89.

Checks for a project local `.npmrc` before the user `.npmrc`, which avoids potentially misleading log messages (not finding a user `.npmrc` is not a problem if there's a project one) and unecessarily generating a user `.npmrc`.
