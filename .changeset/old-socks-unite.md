---
"@changesets/action": patch
---

Change directory to `cwd` before running git user setup. This fixes an issue when the action starts its execution not in a git repository.
