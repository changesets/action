# changesets/action/publish

Publishes packages with Changesets.

Set the optional `stage` input to `true` or `false` to override
`stagedPublishing` from the Changesets config. The input is tri-state: omitting
it leaves the config in control. An explicit `stage` cannot be combined with a
custom `script`; configure the script itself instead.

When packages are staged, the action uploads a 30-day handoff and returns its
exact id as `staged-release-artifact-id`. It also prints a topologically
ordered approval command:

```sh
changeset stage approve <id...>
```

That command is only a convenience and uses the default registry. For custom
or multiple registries, split the IDs into correctly scoped commands and pass
`--registry` to each.

After approval, pass the artifact id to
`changesets/action/github-release` to verify publication and create Git tags
and GitHub Releases.
