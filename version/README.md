# changesets/action/version

This action versions packages and creates or updates a pull request with the changes.

## Requirements

- Needs repo checked out and `@changesets/cli` installed
- [Job permissions][job-permissions]:
  - `contents: write`: to commit version changes
  - `pull-requests: write`: to create pull request
- [Workflow triggers][workflow-triggers]: _any_

## Usage

> [!TIP]
> Check out [the docs](https://changesets.dev/guide/automating#how-do-i-run-the-version-and-publish-commands) to learn how to set up the version and publish workflow.

## API

<!-- api-start -->

| Inputs           | Required | Description                                                                                                                                                                                                                                                                           |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-token`   |          | The GitHub token to use for authentication. Defaults to the GitHub-provided token.                                                                                                                                                                                                    |
| `script`         |          | The command to use to version packages                                                                                                                                                                                                                                                |
| `commit-message` |          | The commit message. Default to `Version Packages`                                                                                                                                                                                                                                     |
| `pr-title`       |          | The pull request title. Default to `Version Packages`                                                                                                                                                                                                                                 |
| `pr-draft`       |          | Controls draft PR behavior. Use 'create' to create new version PRs as draft, or 'always' to also convert existing version PRs back to draft when updating them.                                                                                                                       |
| `pr-base-branch` |          | Sets the base branch of the PR. Defaults to `github.ref_name`.                                                                                                                                                                                                                        |
| `commit-mode`    |          | An enum to specify the commit mode. Use "git-cli" to push changes using the Git CLI, or "github-api" to push changes via the GitHub API. When using "github-api", all commits and tags are signed using GitHub's GPG key and attributed to the user or app who owns the GITHUB_TOKEN. |

| Outputs     | Required | Description                                         |
| ----------- | -------- | --------------------------------------------------- |
| `pr-number` |          | The pull request number that was created or updated |

<!-- api-end -->

[job-permissions]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
[workflow-triggers]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
