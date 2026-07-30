# Changesets GitHub Action

> [!IMPORTANT]
> This is the development branch for `changesets/action` v2 compatible with Changesets v3. For the v1 code compatible with Changesets v2, check out the [`maintenance/v1`](https://github.com/changesets/action/tree/maintenance/v1) branch.

This repo contains a collection of GitHub Actions for [Changesets](https://changesets.dev). Check out the [Automating Changesets](https://changesets.dev/guide/automating) guide to learn how to use these actions to automate your workflow.

- [changesets/action](./README.md): (This README. See below for details.)
- [changesets/action/select-mode](./select-mode/README.md): Select the mode to run a Changesets workflow.
- [changesets/action/version](./version/README.md): Version packages and create or update a pull request with the changes.
- [changesets/action/pack](./pack/README.md): Pack publishable packages into tarballs.
- [changesets/action/publish](./publish/README.md): Publish packages to npm.
- [changesets/action/pr-status](./pr-status/README.md): Generate changeset status in PRs.
- [changesets/action/pr-comment](./pr-comment/README.md): Create or update comments on PRs.

## changesets/action

This action handles versioning and publishing of packages. It's the equivalent of setting up the `changesets/action/select-mode`, `changesets/action/version`, and `changesets/action/publish` actions in a workflow, but with the required permissions combined.

If using [trusted publishing](https://docs.npmjs.com/trusted-publishers), it's recommended to set up the individual sub-actions instead to tighten publish permissions.

## Requirements

- Needs repo checked out and `@changesets/cli` installed
- [Job permissions][job-permissions]:
  - `contents: write`: to commit version changes
  - `pull-requests: write`: to create pull request
  - `id-token: write`: if using [trusted publishing](https://docs.npmjs.com/trusted-publishers)
- [Workflow triggers][workflow-triggers]: _any_

## Usage

> [!TIP]
> Check out [the docs](https://changesets.dev/guide/automating#how-do-i-run-the-version-and-publish-commands) to learn how to set up the version and publish workflow.

## API

<!-- api-start -->

| Inputs                   | Required | Description                                                                                                                                                                                                                                                                           |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-token`           |          | The GitHub token to use for authentication. Defaults to the GitHub-provided token.                                                                                                                                                                                                    |
| `publish-script`         |          | The command to use to build and publish packages                                                                                                                                                                                                                                      |
| `version-script`         |          | The command to update version, edit CHANGELOG, read and delete changesets. Default to `changeset version` if not provided                                                                                                                                                             |
| `commit-message`         |          | The commit message. Default to `Version Packages`                                                                                                                                                                                                                                     |
| `pr-title`               |          | The pull request title. Default to `Version Packages`                                                                                                                                                                                                                                 |
| `pr-draft`               |          | Controls draft PR behavior. Use 'create' to create new version PRs as draft, or 'always' to also convert existing version PRs back to draft when updating them.                                                                                                                       |
| `pr-base-branch`         |          | Sets the base branch of the PR. Defaults to `github.ref_name`.                                                                                                                                                                                                                        |
| `create-github-releases` |          | Whether to create Github releases after publish                                                                                                                                                                                                                                       |
| `push-git-tags`          |          | Whether to create git tags after publish. If `create-github-releases` is set to `true`, this option will also always be `true`.                                                                                                                                                       |
| `commit-mode`            |          | An enum to specify the commit mode. Use "git-cli" to push changes using the Git CLI, or "github-api" to push changes via the GitHub API. When using "github-api", all commits and tags are signed using GitHub's GPG key and attributed to the user or app who owns the GITHUB_TOKEN. |

| Outputs              | Required | Description                                                                                                                                      |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `published`          |          | A "true" or "false" string value to indicate whether a publishing is happened or not                                                             |
| `published-packages` |          | A JSON array to present the published packages. The format is `[{"name": "@xx/xx", "version": "1.2.0"}, {"name": "@xx/xy", "version": "0.8.9"}]` |
| `has-changesets`     |          | A "true" or "false" string value about whether there were changesets. Useful if you want to create your own publishing functionality.            |
| `pr-number`          |          | The pull request number that was created or updated                                                                                              |

<!-- api-end -->

[job-permissions]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
[workflow-triggers]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
