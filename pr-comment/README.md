# changesets/action/pr-comment

This action creates or updates comments on PRs, aimed to complement [changesets/action/pr-status](../pr-status/README.md).

Its features are kept intentionally simple. For advanced usecases, check out other actions such as [mshick/add-pr-comment](https://github.com/marketplace/actions/add-pr-comment) and [peter-evans/create-or-update-comment](https://github.com/marketplace/actions/create-or-update-comment).

## Requirements

- [Job permissions][job-permissions]:
  - `pull-requests: write`: to create and update comments on PRs
- [Workflow triggers][workflow-triggers]:
  - [`pull_request`][trigger-pull-request]
  - [`pull_request_target`][trigger-pull-request-target]

> [!CAUTION]
> **Do not run untrusted code** when using the `pull_request_target` event.
>
> `pull_request_target` can be useful to support PRs from forks, however it enables write permissions by default which can be a security risk if untrusted code is executed and the permissions aren't scoped down.

## Usage

> [!TIP]
> Check out [the docs](https://changesets.dev/guide/automating#non-blocking) to learn how to set up commenting changesets status on PRs.

```yaml
on:
  pull_request:

jobs:
  pr-comment:
    runs-on: ubuntu-slim
    permissions:
      pull-requests: write # to create and update comments on PRs (changesets/action/pr-comment)
    steps:
      - name: Comment on PR
        uses: changesets/action/pr-comment@v2
        with:
          body: Hello world!
```

If the action is called again for the same PR, for example, if called in another workflow run, it will update the comment it created by default.

If you use the action to create different types of comments, pass an `update-id` value to differentiate them.

```yaml
jobs:
  pr-comment:
    # ...
    steps:
      - name: Comment on PR
        uses: changesets/action/pr-comment@v2
        with:
          body: Hello world!
          update-id: my-tag
```

If you want to always create new comments, pass an empty value to `update-id`.

```yaml
jobs:
  pr-comment:
    # ...
    steps:
      - uses: changesets/action/pr-comment@v2
        with:
          body: Hello world!
          update-id: ""
```

## API

<!-- api-start -->

| Inputs         | Required | Description                                                                                                                                                                         |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-token` |          | The GitHub token to use for authentication. Defaults to the GitHub-provided token.                                                                                                  |
| `body`         | Yes      | The comment body to post on the PR.                                                                                                                                                 |
| `update-id`    |          | By default, the action will create and update a comment with this id. Pass a different id to create and update a new comment, or pass an empty string to disable updating comments. |

| Outputs      | Required | Description                                                |
| ------------ | -------- | ---------------------------------------------------------- |
| `comment-id` |          | The comment id of the comment that was created or updated. |

<!-- api-end -->

[job-permissions]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idpermissions
[workflow-triggers]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[trigger-pull-request]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request
[trigger-pull-request-target]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target
