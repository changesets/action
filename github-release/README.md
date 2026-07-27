# changesets/action/github-release

Finalizes packages produced by staged publishing. Pass the exact
`staged-release-artifact-id` output from `changesets/action/publish`.

By default the action waits up to two minutes for every approved package
version to become visible before creating any Git tag or GitHub Release.
Private registries therefore need read authentication configured before this
step. Set `verify-published: false` to skip that check.

The handoff is bound to the repository, workflow run, and commit. Tags and
releases are created idempotently; a tag that already points at another commit
is rejected.
