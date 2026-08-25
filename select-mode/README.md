# changesets/action/select-mode

This action selects the mode to run a Changesets workflow:

- `"version"`: Changesets are found. The workflow should version packages and create a pull request with the changes.
- `"publish"`: No changesets are found and they are publishable packages. The workflow should publish them.
- `"none"`: No changesets are found and there are no publishable packages. The workflow should do nothing.

## Requirements

- [Job permissions][job-permissions]: _none_
- [Workflow triggers][workflow-triggers]: _any_

## Usage

> [!TIP]
> Check out [the docs](https://changesets.dev/guide/automating#how-do-i-run-the-version-and-publish-commands) to learn how to set up the version and publish workflow.

## API

<!-- api-start -->

| Inputs | Description                                                                             |
| ------ | --------------------------------------------------------------------------------------- |
| `cwd`  | The working directory to execute Changesets in. Defaults to the root of the repository. |

| Outputs                    | Description                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- |
| `mode`                     | The mode to use for the current repo state: 'version', 'publish', or 'none'. |
| `publish-plan-artifact-id` | Artifact id for the generated publish plan when mode is `publish`            |

<!-- api-end -->

[job-permissions]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
[workflow-triggers]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
