---
"@changesets/action": patch
---

Remove the `setup-git-user` input. Complete custom Git identities are now preserved automatically, while `github-actions[bot]` is configured as a fallback before creating local release commits or tags.
