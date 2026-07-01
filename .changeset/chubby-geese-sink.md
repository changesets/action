---
"@changesets/action": major
---

Add a new `push-git-tags` option that complements `create-github-releases` to control specifically if git tags should be created but not GitHub releases.

If `create-github-releases` was previously set to `false`, which also indirectly disabled git tag creation, git tags will now be created instead by default. If this is not desired, set `push-git-tags` to `false` explicitly.
