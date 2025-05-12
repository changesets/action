---
"@changesets/action": patch
---

fix: cwd now works again with relative paths and commitMode: git-cli

v1.5.2 introduced a bug where specifying `cwd`
when using the default `commitMode` would break things,
as it tried to resolve the path twice.